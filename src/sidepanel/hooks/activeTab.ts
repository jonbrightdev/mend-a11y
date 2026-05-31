import { useEffect, useRef, useState } from 'preact/hooks';
import { sendToWorker, type CachedAuditResponse } from '../../lib/messages';
import type { AuditResult } from '../../lib/types';

export interface ActiveTab {
  /** Active tab id in this panel's window, or null if none is resolvable. */
  tabId: number | null;
  /** Hostname of the active tab, for display in the empty state. */
  host: string | null;
  /** Cached audit for the active tab, or null if it hasn't been audited. */
  cached: AuditResult | null;
  /** True while resolving a tab change, so the UI can avoid flicker. */
  loading: boolean;
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

/**
 * Follows the active tab in the window this side panel belongs to. On every
 * activation, focus change, or navigation, it re-resolves the active tab and
 * loads that tab's cached audit, so the panel reflects whatever page is in
 * front of the user rather than the single tab an audit was first run on.
 */
export function useActiveTab(): ActiveTab {
  const [state, setState] = useState<ActiveTab>({
    tabId: null,
    host: null,
    cached: null,
    loading: true,
  });
  const windowIdRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const resolve = async (): Promise<void> => {
      // Determine which window this panel is in once, then always read the
      // active tab of that window specifically.
      if (windowIdRef.current == null) {
        try {
          const win = await chrome.windows.getCurrent();
          windowIdRef.current = win?.id ?? null;
        } catch {
          windowIdRef.current = null;
        }
      }
      const windowId = windowIdRef.current;
      const query = windowId != null ? { active: true, windowId } : { active: true, lastFocusedWindow: true };
      let tab: chrome.tabs.Tab | undefined;
      try {
        [tab] = await chrome.tabs.query(query);
      } catch {
        tab = undefined;
      }
      if (cancelled) return;

      const tabId = tab?.id ?? null;
      const host = hostOf(tab?.url);

      if (tabId == null) {
        setState({ tabId: null, host, cached: null, loading: false });
        return;
      }

      let cached: AuditResult | null = null;
      try {
        const res = await sendToWorker<CachedAuditResponse>({ type: 'GET_CACHED_AUDIT', tabId });
        cached = res.result;
      } catch {
        cached = null;
      }
      if (cancelled) return;
      setState({ tabId, host, cached, loading: false });
    };

    void resolve();

    const onActivated = (info: chrome.tabs.OnActivatedInfo): void => {
      if (windowIdRef.current == null || info.windowId === windowIdRef.current) void resolve();
    };
    const onFocus = (): void => void resolve();
    const onUpdated = (
      _tabId: number,
      changeInfo: chrome.tabs.OnUpdatedInfo,
    ): void => {
      // Re-resolve when the front tab finishes a navigation or its title/url
      // changes, so a stale result drops to the empty state.
      if (changeInfo.status === 'complete' || changeInfo.url) void resolve();
    };

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.windows.onFocusChanged.addListener(onFocus);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      cancelled = true;
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.windows.onFocusChanged.removeListener(onFocus);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  return state;
}
