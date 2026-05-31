import { lazy, Suspense } from 'preact/compat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { AuditResult, NormalizedIssue, Settings } from '../lib/types';
import {
  sendToWorker,
  type CachedAuditResponse,
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
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditDone, setAuditDone] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [suppressed, setSuppressed] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const tabIdRef = useRef<number | null>(null);
  useThemeClass(settings.theme);

  // Resolve the active tab and hydrate settings + any cached audit on open.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (cancelled) return;
      tabIdRef.current = tab?.id ?? null;

      const s = await sendToWorker<SettingsResponse>({ type: 'GET_SETTINGS' });
      if (!cancelled) setSettings(s.settings);

      if (tab?.id != null) {
        const cached = await sendToWorker<CachedAuditResponse>({
          type: 'GET_CACHED_AUDIT',
          tabId: tab.id,
        });
        if (!cancelled && cached.result) {
          setResult(cached.result);
          setRoute(cached.result.issues.length === 0 ? 'pass' : 'results');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1400);
  }, []);

  const runAudit = useCallback(async () => {
    const tabId = tabIdRef.current;
    if (tabId == null) {
      setError('Open a normal website tab, then try again.');
      return;
    }
    setError(null);
    setAuditDone(false);
    setRoute('running');
    announce('Audit started');
    try {
      // Watchdog: if the worker stalls or the service worker is suspended
      // mid-audit, this guarantees the UI leaves the running state.
      const res = await Promise.race([
        sendToWorker<RunAuditResponse>({ type: 'RUN_AUDIT', tabId }),
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
      if (!res.ok) {
        setError(res.error);
        setRoute('empty');
        announce('Audit could not run');
        return;
      }
      setResult(res.result);
      setSuppressed(new Set());
      const count = res.result.issues.length;
      if (count === 0) {
        setRoute('pass');
        announce('Audit complete. No issues found.');
      } else {
        setRoute('results');
        announce(`Audit complete. ${count} ${count === 1 ? 'issue' : 'issues'} found.`);
      }
    } catch (err) {
      setAuditDone(true);
      setError(
        err instanceof Error && err.message
          ? err.message
          : "The scan didn't finish. The page may have closed or changed. Try running it again.",
      );
      setRoute('empty');
      announce('Audit could not run');
    }
  }, []);

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

  const highlight = useCallback((selector: string) => {
    const tabId = tabIdRef.current;
    if (tabId != null) void sendToWorker({ type: 'HIGHLIGHT', tabId, selector });
  }, []);

  const clearHighlight = useCallback(() => {
    const tabId = tabIdRef.current;
    if (tabId != null) void sendToWorker({ type: 'CLEAR_HIGHLIGHT', tabId });
  }, []);

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
        {route === 'empty' && <EmptyScreen error={error} onRun={() => void runAudit()} />}
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
