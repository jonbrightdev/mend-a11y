import { lazy, Suspense } from 'preact/compat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { AuditResult, NormalizedIssue, Settings } from '../lib/types';
import {
  sendToWorker,
  type RunAuditResponse,
  type SaveToDashboardResponse,
  type StagePendingSaveResponse,
  type SettingsResponse,
  type TextSpacingResponse,
  type FocusOrderResponse,
  type VisionResponse,
} from '../lib/messages';
import { DEFAULT_SETTINGS, HARPOON_DASHBOARD_URL } from '../lib/storage';
import { normalizeDashboardUrl, syncConfigured } from '../lib/sync';
import { exportAudit } from './export';
import type { SyncInfo } from './components/SyncStatus';
import { clearErrorEntries } from './syncState';
import { defaultFilters, type FilterState } from './screens/filterState';
import { EmptyScreen } from './screens/EmptyScreen';
import { RunningScreen } from './screens/RunningScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { PassScreen } from './screens/PassScreen';
import { FocusOrderIcon, OutlineIcon, SettingsIcon, TextSpacingIcon, VisionIcon } from './components/Icon';
import { announce } from './hooks/a11y';
import { useThemeClass } from './hooks/theme';
import { useActiveTab } from './hooks/activeTab';
import { foldCachedAudit } from './hooks/tabResults';
import { hasAllSitesAccess, requestAllSitesAccess, revokeAllSitesAccess } from '../lib/permissions';
import type { VisionMode } from '../lib/vision';

const IssueDetailScreen = lazy(() =>
  import('./screens/IssueDetailScreen').then((m) => ({ default: m.IssueDetailScreen })),
);
const FiltersScreen = lazy(() =>
  import('./screens/FiltersScreen').then((m) => ({ default: m.FiltersScreen })),
);
const SettingsScreen = lazy(() =>
  import('./screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
);
const OutlineScreen = lazy(() =>
  import('./screens/OutlineScreen').then((m) => ({ default: m.OutlineScreen })),
);
const VisionScreen = lazy(() =>
  import('./screens/VisionScreen').then((m) => ({ default: m.VisionScreen })),
);

type Route = 'empty' | 'running' | 'results' | 'pass' | 'detail';

const SHEET_EXIT_MS = 250; // keep in sync with --ap-duration-slow in panel.css

/**
 * Keeps a sheet mounted for the length of its exit animation. `open` drives the
 * request; `mounted` drives the render; `closing` drives the [data-state] the
 * CSS animates on.
 */
function useSheet(open: boolean): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    const id = window.setTimeout(() => setMounted(false), SHEET_EXIT_MS);
    return () => window.clearTimeout(id);
  }, [open, mounted]);
  return { mounted, closing: mounted && !open };
}

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
  const [allSites, setAllSites] = useState(false);
  const [textSpacing, setTextSpacing] = useState(false);
  const [focusOrder, setFocusOrder] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [vision, setVision] = useState<VisionMode | null>(null);
  const [showVision, setShowVision] = useState(false);
  // Dashboard uploads, keyed by audit (url|startedAt). With auto-save on, an
  // entry appears the moment an audit finishes and drives the live sync chip;
  // with it off, the same map backs the manual Save button's states.
  const [syncStates, setSyncStates] = useState<Record<string, SyncInfo>>({});

  const filtersSheet = useSheet(showFilters);
  const settingsSheet = useSheet(showSettings);
  const outlineSheet = useSheet(showOutline);
  const visionSheet = useSheet(showVision);

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
      const granted = await hasAllSitesAccess();
      if (!cancelled) setAllSites(granted);
    })();
    const port = chrome.runtime.connect({ name: 'mend-panel' });
    const onPerm = (): void => {
      void hasAllSitesAccess().then((g) => setAllSites(g));
    };
    chrome.permissions.onAdded.addListener(onPerm);
    chrome.permissions.onRemoved.addListener(onPerm);

    // A key relayed in from the account page (or written by another panel)
    // must reach an already-open panel: re-fetch through GET_SETTINGS so the
    // default-merging in getSettings stays the single source of truth.
    const onStorage = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ): void => {
      if (area === 'local' && changes['settings']) {
        void sendToWorker<SettingsResponse>({ type: 'GET_SETTINGS' }).then((s) => {
          if (!cancelled) setSettings(s.settings);
        });
      }
    };
    chrome.storage.onChanged.addListener(onStorage);

    // The side panel closing does not reliably run React effect cleanup, so
    // clear any page overlay explicitly when the panel document is hidden or
    // unloaded. pagehide is the dependable unload signal for this context.
    const clearOnLeave = (): void => {
      try {
        void chrome.runtime.sendMessage({ type: 'CLEAR_HIGHLIGHT' });
      } catch {
        /* worker may already be tearing down; the port disconnect is the backstop */
      }
    };
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') clearOnLeave();
    };
    window.addEventListener('pagehide', clearOnLeave);
    document.addEventListener('visibilitychange', onHide);

    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', clearOnLeave);
      document.removeEventListener('visibilitychange', onHide);
      clearOnLeave();
      port.disconnect();
      chrome.permissions.onAdded.removeListener(onPerm);
      chrome.permissions.onRemoved.removeListener(onPerm);
      chrome.storage.onChanged.removeListener(onStorage);
    };
  }, []);

  // Fold a tab's cached audit (from the active-tab hook) into the result map,
  // in both directions: add/replace when a fresh audit lands, and delete when
  // the worker's cache has gone empty for that tab (typically a navigation) —
  // otherwise a navigated-away audit keeps being shown as if it still
  // described the current page. See tabResults.ts for the value-key
  // comparison and the loading guard that keeps this from over-clearing.
  useEffect(() => {
    setResultsByTab((prev) => foldCachedAudit(prev, active.tabId, active.cached, active.loading));
  }, [active.tabId, active.cached, active.loading]);

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

  // Keep the text-spacing toggle in sync with the active tab. The emulation is
  // per-page, so switching tabs reflects whatever that tab's state is.
  useEffect(() => {
    if (tabId == null) {
      setTextSpacing(false);
      return;
    }
    let cancelled = false;
    void sendToWorker<TextSpacingResponse>({ type: 'GET_TEXT_SPACING', tabId })
      .then((res) => {
        if (!cancelled) setTextSpacing(res.ok ? res.enabled : false);
      })
      .catch(() => {
        if (!cancelled) setTextSpacing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tabId]);

  // Same for the focus-order overlay: per-page, so it tracks the active tab.
  useEffect(() => {
    if (tabId == null) {
      setFocusOrder(false);
      return;
    }
    let cancelled = false;
    void sendToWorker<FocusOrderResponse>({ type: 'GET_FOCUS_ORDER', tabId })
      .then((res) => {
        if (!cancelled) setFocusOrder(res.ok ? res.enabled : false);
      })
      .catch(() => {
        if (!cancelled) setFocusOrder(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tabId]);

  // And the vision filter: also per-page, tracking the active tab.
  useEffect(() => {
    if (tabId == null) {
      setVision(null);
      return;
    }
    let cancelled = false;
    void sendToWorker<VisionResponse>({ type: 'GET_VISION', tabId })
      .then((res) => {
        if (!cancelled) setVision(res.ok ? res.mode : null);
      })
      .catch(() => {
        if (!cancelled) setVision(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tabId]);

  const toastTimer = useRef<number | null>(null);
  const showToast = useCallback((msg: string, ms = 1400) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = window.setTimeout(() => {
      toastTimer.current = null;
      setToast(null);
    }, ms);
  }, []);

  // Request all-sites access (one-time opt-in) from this click, then audit.
  const grantAndRun = useCallback(async () => {
    const granted = await requestAllSitesAccess();
    setAllSites(granted);
    if (granted) {
      announce('Access granted for all sites');
      void runAuditRef.current?.();
    }
  }, []);

  const toggleAllSites = useCallback(async (next: boolean) => {
    const ok = next ? await requestAllSitesAccess() : await revokeAllSitesAccess();
    // After a request the state is whatever was granted; after a revoke it's off.
    setAllSites(next ? ok : false);
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

  const runAuditRef = useRef<typeof runAudit | null>(null);
  runAuditRef.current = runAudit;

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
    void sendToWorker({ type: 'CLEAR_HIGHLIGHT' });
  }, []);

  const toggleTextSpacing = useCallback(async () => {
    if (tabId == null) return;
    const next = !textSpacing;
    setTextSpacing(next); // optimistic; revert if the worker reports failure
    const res = await sendToWorker<TextSpacingResponse>({
      type: 'SET_TEXT_SPACING',
      tabId,
      enabled: next,
    });
    if (!res.ok) {
      setTextSpacing(!next);
      showToast(res.error);
      return;
    }
    announce(
      next
        ? 'Text spacing applied. Check the page for clipped or overlapping text.'
        : 'Text spacing removed.',
    );
  }, [tabId, textSpacing, showToast]);

  const toggleFocusOrder = useCallback(async () => {
    if (tabId == null) return;
    const next = !focusOrder;
    setFocusOrder(next); // optimistic; revert if the worker reports failure
    const res = await sendToWorker<FocusOrderResponse>({
      type: 'SET_FOCUS_ORDER',
      tabId,
      enabled: next,
    });
    if (!res.ok) {
      setFocusOrder(!next);
      showToast(res.error);
      return;
    }
    announce(
      next
        ? 'Focus order shown. Numbered badges mark each keyboard stop in order.'
        : 'Focus order hidden.',
    );
  }, [tabId, focusOrder, showToast]);

  const applyVision = useCallback(
    async (mode: VisionMode | null) => {
      if (tabId == null) return;
      const prev = vision;
      setVision(mode); // optimistic; revert if the worker reports failure
      const res = await sendToWorker<VisionResponse>({ type: 'SET_VISION', tabId, mode });
      if (!res.ok) {
        setVision(prev);
        showToast(res.error);
        return;
      }
      announce(
        mode
          ? 'Vision simulation applied. Inspect the page through the chosen filter.'
          : 'Vision simulation off.',
      );
    },
    [tabId, vision, showToast],
  );

  // Clear any page overlay when leaving the detail view.
  useEffect(() => {
    if (route !== 'detail') clearHighlight();
  }, [route, clearHighlight]);

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    void sendToWorker({ type: 'SET_SETTINGS', settings: next });
  }, []);

  // Dashboard sync. The worker reads the cached audit for the tab and uploads
  // it; the panel tracks per-audit state and reports the outcome. With
  // auto-save on (the default once a key is set), the effect below uploads
  // every finished audit on its own — including the audit already on screen
  // the moment a key first arrives via the account-page relay.
  const syncEnabled = syncConfigured(settings);
  const autoSync = syncEnabled && settings.autoSync;
  const auditKey = result ? `${result.url}|${result.startedAt}` : null;
  const syncInfo = auditKey ? syncStates[auditKey] : undefined;

  const uploadForTab = useCallback(
    async (target: number, key: string) => {
      setSyncStates((prev) => ({ ...prev, [key]: { phase: 'uploading' } }));
      announce('Saving audit to your dashboard.');
      const res = await sendToWorker<SaveToDashboardResponse>({
        type: 'SAVE_TO_DASHBOARD',
        tabId: target,
      }).catch(
        (): SaveToDashboardResponse => ({
          ok: false,
          error: 'Saving failed. Try again.',
          retryable: true,
        }),
      );
      if (!res.ok) {
        setSyncStates((prev) => ({
          ...prev,
          [key]: { phase: 'error', error: res.error, retryable: res.retryable === true },
        }));
        // Long enough to actually read a sentence-length error; the contract
        // keeps the portal's message (plan caps included) user-readable as-is.
        showToast(res.error, 5000);
        announce('Saving to the dashboard failed.');
        return;
      }
      setSyncStates((prev) => ({ ...prev, [key]: { phase: 'synced', duplicate: res.duplicate } }));
      announce('Audit saved to your dashboard.');
    },
    [showToast],
  );

  // Auto-upload: any finished audit on the active tab that hasn't been sent
  // (or refused) yet goes up as soon as sync is on. Firing on settings changes
  // too is what makes a freshly entered or relayed key post the current audit.
  useEffect(() => {
    if (!autoSync || tabId == null || auditKey == null) return;
    if (syncStates[auditKey]) return;
    void uploadForTab(tabId, auditKey);
  }, [autoSync, tabId, auditKey, syncStates, uploadForTab]);

  // A refusal recorded under one key must not keep blocking after the key
  // changes -- the key that earned the 401 is gone, so the refusal no longer
  // says anything about whether the new one will work. Dropping error
  // entries here lets the auto-upload effect's guard pass again and retry.
  const apiKey = settings.dashboardApiKey;
  useEffect(() => {
    setSyncStates(clearErrorEntries);
  }, [apiKey]);

  const saveToDashboard = useCallback(() => {
    if (tabId == null || auditKey == null) return;
    void uploadForTab(tabId, auditKey);
  }, [tabId, auditKey, uploadForTab]);

  // Manual mode (auto-save off) keeps the Save button; an error drops the
  // button back to idle — the toast has said why, pressing again retries.
  const saveState =
    syncInfo?.phase === 'uploading' ? 'saving' : syncInfo?.phase === 'synced' ? 'saved' : 'idle';

  // Keyless users get the account callout on results/pass until dismissed.
  const showAccountPrompt = !syncEnabled && !settings.accountPromptDismissed;

  const saveAudit = useCallback(() => {
    const base = normalizeDashboardUrl(settings.dashboardUrl) ?? HARPOON_DASHBOARD_URL;
    const open = () => void chrome.tabs.create({ url: `${base}/connect` });
    if (tabId == null) {
      open();
      return;
    }
    // Stage first, then open: the website's /connect step uploads whatever is
    // staged the moment it hands us a key, and a race here would leave it
    // waiting on an empty snapshot.
    void sendToWorker<StagePendingSaveResponse>({ type: 'STAGE_PENDING_SAVE', tabId })
      .catch(() => undefined)
      .then(open);
  }, [settings.dashboardUrl, tabId]);

  const dismissPrompt = useCallback(() => {
    updateSettings({ ...settings, accountPromptDismissed: true });
  }, [settings, updateSettings]);

  // Local JSON export: the one way a keyless user gets an audit out of the
  // panel. Available unconditionally -- unlike Save, it never depends on
  // syncEnabled. Title resolution mirrors the worker's SAVE_TO_DASHBOARD
  // case: chrome.tabs.get with a same fallback to the audit's URL.
  const exportResult = useCallback(async () => {
    if (result == null) return;
    const tab = tabId != null ? await chrome.tabs.get(tabId).catch(() => null) : null;
    const { name, json } = exportAudit(result, tab?.title ?? result.url);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [result, tabId]);

  const prompt = showAccountPrompt
    ? { onSave: saveAudit, onDismiss: dismissPrompt }
    : undefined;

  return (
    <main class="shell">
      <div class="topbar">
        <span class="brand">
          <span class="dot" />
          Mend
        </span>
        <span class="spacer" />
        <button
          class={`icon-btn${showOutline ? ' is-active' : ''}`}
          aria-label="Show page outline"
          aria-haspopup="dialog"
          aria-expanded={showOutline}
          title="Show the heading and landmark outline"
          disabled={tabId == null}
          onClick={() => setShowOutline(true)}
        >
          <OutlineIcon />
        </button>
        <button
          class={`icon-btn${focusOrder ? ' is-active' : ''}`}
          aria-label="Show keyboard focus order"
          aria-pressed={focusOrder}
          title="Show the keyboard focus order on the page"
          disabled={tabId == null}
          onClick={() => void toggleFocusOrder()}
        >
          <FocusOrderIcon />
        </button>
        <button
          class={`icon-btn${textSpacing ? ' is-active' : ''}`}
          aria-label="Emulate WCAG text spacing"
          aria-pressed={textSpacing}
          title="Emulate WCAG 1.4.12 text spacing"
          disabled={tabId == null}
          onClick={() => void toggleTextSpacing()}
        >
          <TextSpacingIcon />
        </button>
        <button
          class={`icon-btn${vision ? ' is-active' : ''}`}
          aria-label="Simulate a vision deficiency"
          aria-haspopup="dialog"
          aria-expanded={showVision}
          title="Simulate color-vision deficiencies and low vision"
          disabled={tabId == null}
          onClick={() => setShowVision(true)}
        >
          <VisionIcon />
        </button>
        <button class="icon-btn" aria-label="Settings" onClick={() => setShowSettings(true)}>
          <SettingsIcon />
        </button>
      </div>

      <div class="scroll">
        {route === 'empty' && (
          <EmptyScreen
            error={error}
            host={active.host}
            allSites={allSites}
            syncEnabled={autoSync}
            onRun={() => void runAudit()}
            onGrantAndRun={() => void grantAndRun()}
          />
        )}
        {route === 'running' && <RunningScreen done={auditDone} willSync={autoSync} />}
        {route === 'results' && visibleResult && (
          <ResultsScreen
            result={visibleResult}
            onOpenIssue={openIssue}
            onRerun={() => void runAudit()}
            onOpenFilters={() => setShowFilters(true)}
            onExport={() => void exportResult()}
            onSave={syncEnabled && !autoSync ? saveToDashboard : undefined}
            saveState={saveState}
            sync={autoSync ? syncInfo : undefined}
            onRetrySync={saveToDashboard}
            prompt={prompt}
          />
        )}
        {route === 'pass' && result && (
          <PassScreen
            result={result}
            onRerun={() => void runAudit()}
            onExport={() => void exportResult()}
            onSave={syncEnabled && !autoSync ? saveToDashboard : undefined}
            saveState={saveState}
            sync={autoSync ? syncInfo : undefined}
            onRetrySync={saveToDashboard}
            prompt={prompt}
          />
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

      {filtersSheet.mounted && (
        <Suspense fallback={null}>
          <FiltersScreen
            initial={filters}
            closing={filtersSheet.closing}
            onApply={(state) => {
              setFilters(state);
              setShowFilters(false);
            }}
            onClose={() => setShowFilters(false)}
          />
        </Suspense>
      )}

      {settingsSheet.mounted && (
        <Suspense fallback={null}>
          <SettingsScreen
            settings={settings}
            closing={settingsSheet.closing}
            onChange={updateSettings}
            onClose={() => setShowSettings(false)}
            allSites={allSites}
            onToggleAllSites={(next) => void toggleAllSites(next)}
          />
        </Suspense>
      )}

      {outlineSheet.mounted && (
        <Suspense fallback={null}>
          <OutlineScreen
            tabId={tabId}
            closing={outlineSheet.closing}
            onClose={() => {
              clearHighlight();
              setShowOutline(false);
            }}
            onLocate={highlight}
          />
        </Suspense>
      )}

      {visionSheet.mounted && (
        <Suspense fallback={null}>
          <VisionScreen
            mode={vision}
            closing={visionSheet.closing}
            onApply={(m) => void applyVision(m)}
            onClose={() => setShowVision(false)}
          />
        </Suspense>
      )}

      {toast && (
        <div class="toast" role="status" key={toast}>
          {toast}
        </div>
      )}
    </main>
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
