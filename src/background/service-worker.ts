import { runAudit } from '../lib/audit';
import type { PanelMessage } from '../lib/messages';
import { HIGHLIGHT_ACCENT, clearHighlightInPage, highlightInPage } from '../lib/highlight';
import {
  TEXT_SPACING_CSS,
  TEXT_SPACING_STYLE_ID,
  applyTextSpacingInPage,
  removeTextSpacingInPage,
} from '../lib/textSpacing';
import { FOCUS_ORDER_ACCENT, clearFocusOrderInPage, showFocusOrderInPage } from '../lib/focusOrder';
import { extractOutlineInPage, type OutlineData } from '../lib/outline';
import {
  VISION_DEFS_ID,
  VISION_STYLE_ID,
  applyVisionInPage,
  removeVisionInPage,
  visionMarkup,
  type VisionMode,
} from '../lib/vision';
import {
  HARPOON_DASHBOARD_URL,
  clearCachedAudit,
  clearPendingSave,
  getCachedAudit,
  getPendingSave,
  getSettings,
  setPendingSave,
  setSettings,
} from '../lib/storage';
import { clearHelperEverywhere, perTabState } from '../lib/tabState';
import { SyncError, normalizeDashboardUrl, syncConfigured, uploadAudit } from '../lib/sync';

// Open the side panel from the action click. Doing this in onClicked (rather
// than via openPanelOnActionClick) means the click confers the activeTab grant
// for the current tab, which a bare side-panel open does not. The grant then
// persists for that tab until it navigates, so the subsequent Run audit works.
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false }).catch(() => {});

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId != null) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch((e: unknown) => {
      console.warn('[mend] sidePanel.open failed', e);
    });
  }
});

// The tab where a highlight overlay is currently shown, so we can clear it when
// the panel closes or the user moves on. Backed by session storage so an evicted
// service worker can still recover and clear it on the panel's port disconnect.
const HL_KEY = 'highlightTabId';

async function setHighlightTab(tabId: number | null): Promise<void> {
  try {
    if (tabId == null) await chrome.storage.session.remove(HL_KEY);
    else await chrome.storage.session.set({ [HL_KEY]: tabId });
  } catch {
    /* ignore */
  }
}

async function getHighlightTab(): Promise<number | null> {
  try {
    const got = await chrome.storage.session.get(HL_KEY);
    const id = got[HL_KEY];
    return typeof id === 'number' ? id : null;
  } catch {
    return null;
  }
}

function clearHighlightOn(tabId: number): void {
  chrome.scripting
    .executeScript({ target: { tabId }, func: clearHighlightInPage })
    .catch(() => {});
}

// Per-tab helper state lives in chrome.storage.session (see lib/tabState). Each
// helper writes its effect directly into the page (an injected style, overlay,
// or filter) that the browser tears down on reload, so these records are cleared
// on navigation, tab close, and panel close to stay in sync with the page.
const textSpacing = perTabState<true>('ts');
const focusOrder = perTabState<true>('fo');
const vision = perTabState<string>('vs');

// Best-effort reverts for a single tab, mirroring clearHighlightOn: fire the
// helper's injected remove and swallow errors (the tab may have navigated or
// closed). Used by the panel-close teardown.
function removeTextSpacingOn(tabId: number): void {
  chrome.scripting
    .executeScript({ target: { tabId }, func: removeTextSpacingInPage, args: [TEXT_SPACING_STYLE_ID] })
    .catch(() => {});
}

function clearFocusOrderOn(tabId: number): void {
  chrome.scripting.executeScript({ target: { tabId }, func: clearFocusOrderInPage }).catch(() => {});
}

function removeVisionOn(tabId: number): void {
  chrome.scripting
    .executeScript({ target: { tabId }, func: removeVisionInPage, args: [VISION_DEFS_ID, VISION_STYLE_ID] })
    .catch(() => {});
}

// Shared error mapping for the page-mutating helpers: a missing host grant on
// this tab (e.g. the panel was opened on another tab and switched) gets the
// "click the icon" hint; anything else gets the helper's own fallback message.
function mapDeniedError(e: unknown, fallback: string): { ok: false; error: string } {
  const msg = e instanceof Error ? e.message : String(e);
  const denied = /cannot access|host permission|activeTab|must request permission|not in effect|has not been invoked/i.test(
    msg,
  );
  return {
    ok: false,
    error: denied ? 'Click the Mend icon on this tab first, then try again.' : fallback,
  };
}

// Drop cached results when a tab starts navigating so we never show stale data,
// and forget any overlay we had on it (the navigation tears the overlay down).
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    void clearCachedAudit(tabId);
    void textSpacing.set(tabId, null);
    void focusOrder.set(tabId, null);
    void vision.set(tabId, null);
    void getHighlightTab().then((id) => {
      if (id === tabId) void setHighlightTab(null);
    });
  }
});

// Tidy the per-tab cache when a tab closes so ids don't accumulate stale audits.
chrome.tabs.onRemoved.addListener((tabId) => {
  void clearCachedAudit(tabId);
  void textSpacing.set(tabId, null);
  void focusOrder.set(tabId, null);
  void vision.set(tabId, null);
  void getHighlightTab().then((id) => {
    if (id === tabId) void setHighlightTab(null);
  });
});

// The panel opens a long-lived port on mount. When the panel closes, the port
// disconnects and we clear everything the panel had drawn on a page so nothing
// lingers once the user keeps browsing: the highlight box (one tab), and the
// text-spacing, focus-order, and vision effects (each possibly on several tabs
// in all-sites mode). Reading ids from session storage means this works even if
// the worker restarted meanwhile.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'mend-panel') return;
  port.onDisconnect.addListener(() => {
    void getHighlightTab().then((id) => {
      if (id != null) {
        clearHighlightOn(id);
        void setHighlightTab(null);
      }
    });
    void clearHelperEverywhere(textSpacing, removeTextSpacingOn);
    void clearHelperEverywhere(focusOrder, clearFocusOrderOn);
    void clearHelperEverywhere(vision, removeVisionOn);
  });
});

chrome.runtime.onMessage.addListener((message: PanelMessage, sender, sendResponse) => {
  void handleMessage(message, sender)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
  return true; // keep the channel open for the async response
});

// Only two peers are ever legitimate on this channel: the extension's own
// pages (the side panel), and the dashboard-key relay content script. Guard
// by shape: panel senders always carry a chrome-extension:// sender.url,
// which a web page can never present; the relay is a content script whose
// origin must match the configured dashboard. Everything else is refused
// before any branch runs.
async function guardSender(
  message: PanelMessage,
  sender: chrome.runtime.MessageSender,
): Promise<{ ok: false; error: string } | null> {
  if (sender.id !== chrome.runtime.id) return { ok: false, error: 'Unauthorized sender' };

  if (message.type === 'RELAY_DASHBOARD_KEY') {
    const settings = await getSettings();
    const expectedOrigin = new URL(
      normalizeDashboardUrl(settings.dashboardUrl) ?? HARPOON_DASHBOARD_URL,
    ).origin;
    if (sender.tab !== undefined && sender.origin === expectedOrigin) return null;
    return { ok: false, error: 'Unauthorized sender' };
  }

  // Chrome ties the side panel's page to the window's active tab, so
  // sender.tab is populated here too (verified against the built extension,
  // not just docs) — it is not the no-tab signal a popup gives. The URL check
  // alone is still a hard boundary: Chrome sets sender.url from the sender's
  // real location and a web page can never present a chrome-extension://
  // URL, so this still excludes every content script, including the relay's.
  if (sender.url?.startsWith('chrome-extension://')) return null;
  return { ok: false, error: 'Unauthorized sender' };
}

export async function handleMessage(
  message: PanelMessage,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  const refusal = await guardSender(message, sender);
  if (refusal) return refusal;
  switch (message.type) {
    case 'RUN_AUDIT': {
      const result = await runAudit(message.tabId);
      return { ok: true, result };
    }
    case 'GET_CACHED_AUDIT': {
      return { result: await getCachedAudit(message.tabId) };
    }
    case 'GET_SETTINGS': {
      return { settings: await getSettings() };
    }
    case 'SET_SETTINGS': {
      await setSettings(message.settings);
      return { ok: true };
    }
    case 'HIGHLIGHT': {
      void setHighlightTab(message.tabId);
      await chrome.scripting
        .executeScript({
          target: { tabId: message.tabId },
          func: highlightInPage,
          args: [message.selector, HIGHLIGHT_ACCENT],
        })
        .catch((e: unknown) => console.warn('[mend] highlight failed', e));
      return { ok: true };
    }
    case 'CLEAR_HIGHLIGHT': {
      const stored = await getHighlightTab();
      if (stored != null) {
        await chrome.scripting
          .executeScript({
            target: { tabId: stored },
            func: clearHighlightInPage,
          })
          .catch(() => {});
      }
      void setHighlightTab(null);
      return { ok: true };
    }
    case 'SET_TEXT_SPACING': {
      try {
        if (message.enabled) {
          await chrome.scripting.executeScript({
            target: { tabId: message.tabId },
            func: applyTextSpacingInPage,
            args: [TEXT_SPACING_CSS, TEXT_SPACING_STYLE_ID],
          });
        } else {
          await chrome.scripting.executeScript({
            target: { tabId: message.tabId },
            func: removeTextSpacingInPage,
            args: [TEXT_SPACING_STYLE_ID],
          });
        }
        await textSpacing.set(message.tabId, message.enabled ? true : null);
        return { ok: true, enabled: message.enabled };
      } catch (e: unknown) {
        return mapDeniedError(e, "Mend couldn't change spacing on this page. Try reloading and again.");
      }
    }
    case 'GET_TEXT_SPACING': {
      return { ok: true, enabled: (await textSpacing.get(message.tabId)) === true };
    }
    case 'SET_FOCUS_ORDER': {
      try {
        if (message.enabled) {
          await chrome.scripting.executeScript({
            target: { tabId: message.tabId },
            func: showFocusOrderInPage,
            args: [FOCUS_ORDER_ACCENT],
          });
        } else {
          await chrome.scripting.executeScript({
            target: { tabId: message.tabId },
            func: clearFocusOrderInPage,
          });
        }
        await focusOrder.set(message.tabId, message.enabled ? true : null);
        return { ok: true, enabled: message.enabled };
      } catch (e: unknown) {
        return mapDeniedError(
          e,
          "Mend couldn't show the focus order on this page. Try reloading and again.",
        );
      }
    }
    case 'GET_FOCUS_ORDER': {
      return { ok: true, enabled: (await focusOrder.get(message.tabId)) === true };
    }
    case 'GET_OUTLINE': {
      try {
        const injection = await chrome.scripting.executeScript({
          target: { tabId: message.tabId },
          func: extractOutlineInPage,
        });
        const data = injection[0]?.result as OutlineData | undefined;
        if (!data) throw new Error('No outline returned');
        return { ok: true, data };
      } catch (e: unknown) {
        return mapDeniedError(e, "Mend couldn't read the page structure. Try reloading and again.");
      }
    }
    case 'SET_VISION': {
      try {
        if (message.mode) {
          const { svg, css } = visionMarkup(message.mode);
          await chrome.scripting.executeScript({
            target: { tabId: message.tabId },
            func: applyVisionInPage,
            args: [svg, css, VISION_DEFS_ID, VISION_STYLE_ID],
          });
        } else {
          await chrome.scripting.executeScript({
            target: { tabId: message.tabId },
            func: removeVisionInPage,
            args: [VISION_DEFS_ID, VISION_STYLE_ID],
          });
        }
        await vision.set(message.tabId, message.mode);
        return { ok: true, mode: message.mode };
      } catch (e: unknown) {
        return mapDeniedError(
          e,
          "Mend couldn't apply the vision simulation on this page. Try reloading and again.",
        );
      }
    }
    case 'GET_VISION': {
      const mode = (await vision.get(message.tabId)) as VisionMode | null;
      return { ok: true, mode };
    }
    case 'SAVE_TO_DASHBOARD': {
      const result = await getCachedAudit(message.tabId);
      if (!result) return { ok: false, error: 'Run an audit on this tab first.' };
      const settings = await getSettings();
      if (!syncConfigured(settings)) {
        return { ok: false, error: 'Add your dashboard URL and API key in settings first.' };
      }
      const tab = await chrome.tabs.get(message.tabId).catch(() => null);
      try {
        const outcome = await uploadAudit(settings, result, tab?.title ?? result.url);
        return { ok: true, duplicate: outcome.duplicate };
      } catch (e: unknown) {
        if (e instanceof SyncError) {
          return { ok: false, error: e.message, code: e.code, retryable: e.retryable };
        }
        return { ok: false, error: e instanceof Error ? e.message : 'Saving failed. Try again.' };
      }
    }
    case 'STAGE_PENDING_SAVE': {
      const result = await getCachedAudit(message.tabId);
      if (!result) return { ok: false };
      const tab = await chrome.tabs.get(message.tabId).catch(() => null);
      // Copied, not referenced: the tab is about to lose focus and may navigate,
      // which clears its cache entry via the onUpdated listener above.
      await setPendingSave({
        result,
        pageTitle: tab?.title ?? result.url,
        stagedAt: Date.now(),
      });
      return { ok: true };
    }
    case 'RELAY_DASHBOARD_KEY': {
      const settings = await getSettings();
      // The guard above has already required sender.origin to equal this
      // settings' dashboard origin, so dashboardUrl is left untouched here —
      // the relay no longer rewrites the upload endpoint from sender-supplied
      // data.
      const next = { ...settings, dashboardApiKey: message.apiKey };
      await setSettings(next);

      // The funnel's payoff (plan 009): the run the user pressed "Save audit"
      // on goes up the instant the key lands, from here rather than the panel
      // — the panel is looking at the website's tab by now, not the audited
      // one. `uploaded` tells the content script whether to ack the page.
      const pending = await getPendingSave();
      if (!pending) return { ok: true, uploaded: false };
      try {
        await uploadAudit(next, pending.result, pending.pageTitle);
        await clearPendingSave();
        return { ok: true, uploaded: true };
      } catch (e: unknown) {
        // Keep the snapshot on a retryable failure so a second attempt (a
        // re-press of Save, a fresh key) can still send it. A refusal that
        // retrying cannot fix — the plan's saved-audit cap — drops it, so it
        // does not sit in session storage forever.
        if (e instanceof SyncError && !e.retryable) await clearPendingSave();
        return { ok: true, uploaded: false };
      }
    }
    default:
      return { ok: false, error: 'Unknown message' };
  }
}
