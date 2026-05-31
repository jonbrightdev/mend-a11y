import { lazy, Suspense } from 'preact/compat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { AuditResult, NormalizedIssue, Settings } from '../lib/types';
import {
  sendToWorker,
  type RunAuditResponse,
  type SettingsResponse,
} from '../lib/messages';
import { DEFAULT_SETTINGS } from '../lib/storage';
import { defaultFilters, type FilterState } from './screens/filterState';
import { EmptyScreen } from './screens/EmptyScreen';
import { RunningScreen } from './screens/RunningScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { PassScreen } from './screens/PassScreen';
import { SettingsIcon } from './components/Icon';
import { announce } from './hooks/a11y';
import { useThemeClass } from './hooks/theme';
import { useActiveTab } from './hooks/activeTab';

const IssueDetailScreen = lazy(() =>
  import('./screens/IssueDetailScreen').then((m) => ({ default: m.IssueDetailScreen })),
);
const FiltersScreen = lazy(() =>
  import('./screens/FiltersScreen').then((m) => ({ default: m.FiltersScreen })),
);
const SettingsScreen = lazy(() =>
  import('./screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
);

type Route = 'empty' | 'running' | 'results' | 'pass' | 'detail';

export function App() {
  const [route, setRoute] = useState<Route>('empty');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  // Results keyed by tab id, so several tabs can hold audits at once and the
  // panel can swap instantly when the user changes tabs.
  const [resultsByTab, setResultsByTab] = useState<Record<number, AuditResult>>({});
  const [error, setError] = useState<string | null>(null);
  const [auditDone, setAuditDone] = useState(false);
  const [runningTabId, setRunningTabId] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [suppressed, setSuppressed] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useThemeClass(settings.theme);
  const active = useActiveTab();
  const tabId = active.tabId;
  const result = tabId != null ? resultsByTab[tabId] ?? null : null;

  // Hydrate settings once on open, and open the panel-close port so the worker
  // can clear any page overlay when this panel is dismissed.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await sendToWorker<SettingsResponse>({ type: 'GET_SETTINGS' });
      if (!cancelled) setSettings(s.settings);
    })();
    const port = chrome.runtime.connect({ name: 'mend-panel' });
    return () => {
      cancelled = true;
      port.disconnect();
    };
  }, []);

  // Fold a tab's cached audit (from the active-tab hook) into the result map.
  useEffect(() => {
    if (active.tabId != null && active.cached) {
      const id = active.tabId;
      const cached = active.cached;
      setResultsByTab((prev) => (prev[id] === cached ? prev : { ...prev, [id]: cached }));
    }
  }, [active.tabId, active.cached]);

  // Drive the visible route from the active tab. Switching tabs shows that
  // tab's result, or its empty state if it hasn't been audited. We don't
  // disturb the modal sheets or an in-progress run on this tab.
  useEffect(() => {
    if (active.loading) return;
    if (runningTabId != null && runningTabId === tabId) return;
    setError(null);
    setActiveId(null);
    if (result) {
      setRoute(result.issues.length === 0 ? 'pass' : 'results');
    } else {
      setRoute('empty');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, active.loading, result]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1400);
  }, []);

  const runAudit = useCallback(async () => {
    if (tabId == null) {
      setError('Open a normal website tab, then try again.');
      return;
    }
    const target = tabId;
    setError(null);
    setAuditDone(false);
    setRunningTabId(target);
    setRoute('running');
    announce('Audit started');
    try {
      // Watchdog: if the worker stalls or the service worker is suspended
      // mid-audit, this guarantees the UI leaves the running state.
      const res = await Promise.race([
        sendToWorker<RunAuditResponse>({ type: 'RUN_AUDIT', tabId: target }),
        new Promise<never>((_, reject) =>
          window.setTimeout(
            () =>
              reject(
                new Error(
                  "The scan didn't finish in time. Reload the page and try again, or set depth to Quick in settings.",
                ),
              ),
            60_000,
          ),
        ),
      ]);
      setAuditDone(true);
      setRunningTabId(null);
      if (!res.ok) {
        setError(res.error);
        // Only surface the error if the user is still on the tab they ran on.
        if (tabIdNow() === target) setRoute('empty');
        announce('Audit could not run');
        return;
      }
      setResultsByTab((prev) => ({ ...prev, [target]: res.result }));
      setSuppressed(new Set());
      const count = res.result.issues.length;
      announce(
        count === 0
          ? 'Audit complete. No issues found.'
          : `Audit complete. ${count} ${count === 1 ? 'issue' : 'issues'} found.`,
      );
      // Reflect the result only if the user is still looking at that tab.
      if (tabIdNow() === target) setRoute(count === 0 ? 'pass' : 'results');
    } catch (err) {
      setAuditDone(true);
      setRunningTabId(null);
      setError(
        err instanceof Error && err.message
          ? err.message
          : "The scan didn't finish. The page may have closed or changed. Try running it again.",
      );
      if (tabIdNow() === target) setRoute('empty');
      announce('Audit could not run');
    }
  }, [tabId]);

  // Read the current active tab id without re-creating runAudit on every switch.
  const activeIdForRun = useRef<number | null>(null);
  activeIdForRun.current = tabId;
  const tabIdNow = (): number | null => activeIdForRun.current;

  // Apply suppression + filter sheet selections to the cached result.
  const visibleResult = useMemo<AuditResult | null>(() => {
    if (!result) return null;
    const q = filters.wcagQuery.trim();
    const issues = result.issues.filter((i) => {
      if (suppressed.has(i.id)) return false;
      if (!filters.severities.has(i.impact)) return false;
      if (!filters.categories.has(i.category)) return false;
      if (q && !i.wcag.some((w) => w.includes(q))) return false;
      return true;
    });
    const sorted = applySort(issues, filters.sort);
    return { ...result, issues: sorted };
  }, [result, suppressed, filters]);

  const flatVisible = visibleResult?.issues ?? [];
  const activeIndex = activeId ? flatVisible.findIndex((i) => i.id === activeId) : -1;
  const activeIssue = activeIndex >= 0 ? flatVisible[activeIndex] : undefined;

  const openIssue = useCallback((id: string) => {
    setActiveId(id);
    setRoute('detail');
    announce('Issue opened');
  }, []);

  const highlight = useCallback(
    (selector: string) => {
      if (tabId != null) void sendToWorker({ type: 'HIGHLIGHT', tabId, selector });
    },
    [tabId],
  );

  const clearHighlight = useCallback(() => {
    if (tabId != null) void sendToWorker({ type: 'CLEAR_HIGHLIGHT', tabId });
  }, [tabId]);

  // Clear any page overlay when leaving the detail view.
  useEffect(() => {
    if (route !== 'detail') clearHighlight();
  }, [route, clearHighlight]);

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    void sendToWorker({ type: 'SET_SETTINGS', settings: next });
  }, []);

  return (
    <div class="shell">
      <div class="topbar">
        <span class="brand">
          <span class="dot" />
          Mend
        </span>
        <span class="spacer" />
        <button class="icon-btn" aria-label="Settings" onClick={() => setShowSettings(true)}>
          <SettingsIcon />
        </button>
      </div>

      <div class="scroll">
        {route === 'empty' && (
          <EmptyScreen error={error} host={active.host} onRun={() => void runAudit()} />
        )}
        {route === 'running' && <RunningScreen done={auditDone} />}
        {route === 'results' && visibleResult && (
          <ResultsScreen
            result={visibleResult}
            onOpenIssue={openIssue}
            onRerun={() => void runAudit()}
            onOpenFilters={() => setShowFilters(true)}
          />
        )}
        {route === 'pass' && result && (
          <PassScreen result={result} onRerun={() => void runAudit()} />
        )}
        {route === 'detail' && activeIssue && (
          <Suspense fallback={<div class="pad">Loading…</div>}>
            <IssueDetailScreen
              issue={activeIssue as NormalizedIssue}
              position={activeIndex + 1}
              total={flatVisible.length}
              onBack={() => setRoute('results')}
              onHighlight={highlight}
              onClearHighlight={clearHighlight}
              onSuppress={(id) => {
                setSuppressed((prev) => new Set(prev).add(id));
                setRoute('results');
              }}
              onPrev={() => {
                const prev = flatVisible[activeIndex - 1];
                if (prev) setActiveId(prev.id);
              }}
              onNext={() => {
                const next = flatVisible[activeIndex + 1];
                if (next) setActiveId(next.id);
              }}
              onToast={showToast}
            />
          </Suspense>
        )}
        {route === 'detail' && !activeIssue && (
          <div class="pad">That issue is no longer in view. Go back to the list.</div>
        )}
      </div>

      {showFilters && (
        <Suspense fallback={null}>
          <FiltersScreen
            initial={filters}
            onApply={(state) => {
              setFilters(state);
              setShowFilters(false);
            }}
            onClose={() => setShowFilters(false)}
          />
        </Suspense>
      )}

      {showSettings && (
        <Suspense fallback={null}>
          <SettingsScreen
            settings={settings}
            onChange={updateSettings}
            onClose={() => setShowSettings(false)}
          />
        </Suspense>
      )}

      {toast && <div class="toast" role="status">{toast}</div>}
    </div>
  );
}

function applySort(issues: NormalizedIssue[], sort: FilterState['sort']): NormalizedIssue[] {
  const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  const copy = [...issues];
  if (sort === 'page') {
    copy.sort((a, b) => a.domOrder - b.domOrder || a.ruleId.localeCompare(b.ruleId));
  } else if (sort === 'rule') {
    copy.sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.domOrder - b.domOrder);
  } else {
    copy.sort(
      (a, b) =>
        order[a.impact] - order[b.impact] ||
        a.domOrder - b.domOrder ||
        a.ruleId.localeCompare(b.ruleId),
    );
  }
  return copy;
}
