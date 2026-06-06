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
import {
  clearCachedAudit,
  getCachedAudit,
  getSettings,
  setSettings,
} from '../lib/storage';

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

// Per-tab text-spacing emulation state, also session-backed. The injected style
// is per-page and is removed on reload, so this record is cleared on navigation
// and tab close to stay in sync with what's actually on the page.
function tsKey(tabId: number): string {
  return `ts:${tabId}`;
}

async function setTextSpacingTab(tabId: number, on: boolean): Promise<void> {
  try {
    if (on) await chrome.storage.session.set({ [tsKey(tabId)]: true });
    else await chrome.storage.session.remove(tsKey(tabId));
  } catch {
    /* ignore */
  }
}

async function getTextSpacingTab(tabId: number): Promise<boolean> {
  try {
    const got = await chrome.storage.session.get(tsKey(tabId));
    return got[tsKey(tabId)] === true;
  } catch {
    return false;
  }
}

// Per-tab focus-order overlay state, session-backed like text spacing. The
// overlay is per-page and torn down on reload, so this is cleared on navigation
// and tab close to stay in sync with what's actually on the page.
function foKey(tabId: number): string {
  return `fo:${tabId}`;
}

async function setFocusOrderTab(tabId: number, on: boolean): Promise<void> {
  try {
    if (on) await chrome.storage.session.set({ [foKey(tabId)]: true });
    else await chrome.storage.session.remove(foKey(tabId));
  } catch {
    /* ignore */
  }
}

async function getFocusOrderTab(tabId: number): Promise<boolean> {
  try {
    const got = await chrome.storage.session.get(foKey(tabId));
    return got[foKey(tabId)] === true;
  } catch {
    return false;
  }
}

// Drop cached results when a tab starts navigating so we never show stale data,
// and forget any overlay we had on it (the navigation tears the overlay down).
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    void clearCachedAudit(tabId);
    void setTextSpacingTab(tabId, false);
    void setFocusOrderTab(tabId, false);
    void getHighlightTab().then((id) => {
      if (id === tabId) void setHighlightTab(null);
    });
  }
});

// Tidy the per-tab cache when a tab closes so ids don't accumulate stale audits.
chrome.tabs.onRemoved.addListener((tabId) => {
  void clearCachedAudit(tabId);
  void setTextSpacingTab(tabId, false);
  void setFocusOrderTab(tabId, false);
  void getHighlightTab().then((id) => {
    if (id === tabId) void setHighlightTab(null);
  });
});

// The panel opens a long-lived port on mount. When the panel closes, the port
// disconnects and we clear any overlay still drawn on the page. Reading the id
// from session storage means this works even if the worker restarted meanwhile.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'mend-panel') return;
  port.onDisconnect.addListener(() => {
    void getHighlightTab().then((id) => {
      if (id != null) {
        clearHighlightOn(id);
        void setHighlightTab(null);
      }
    });
  });
});

chrome.runtime.onMessage.addListener((message: PanelMessage, _sender, sendResponse) => {
  void handleMessage(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
  return true; // keep the channel open for the async response
});

async function handleMessage(message: PanelMessage): Promise<unknown> {
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
      void setHighlightTab(null);
      await chrome.scripting
        .executeScript({
          target: { tabId: message.tabId },
          func: clearHighlightInPage,
        })
        .catch(() => {});
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
        await setTextSpacingTab(message.tabId, message.enabled);
        return { ok: true, enabled: message.enabled };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        // No grant on this tab (e.g. panel opened on another tab and switched).
        const denied = /cannot access|host permission|activeTab|must request permission|not in effect|has not been invoked/i.test(
          msg,
        );
        return {
          ok: false,
          error: denied
            ? 'Click the Mend icon on this tab first, then try again.'
            : "Mend couldn't change spacing on this page. Try reloading and again.",
        };
      }
    }
    case 'GET_TEXT_SPACING': {
      return { ok: true, enabled: await getTextSpacingTab(message.tabId) };
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
        await setFocusOrderTab(message.tabId, message.enabled);
        return { ok: true, enabled: message.enabled };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        // No grant on this tab (e.g. panel opened on another tab and switched).
        const denied = /cannot access|host permission|activeTab|must request permission|not in effect|has not been invoked/i.test(
          msg,
        );
        return {
          ok: false,
          error: denied
            ? 'Click the Mend icon on this tab first, then try again.'
            : "Mend couldn't show the focus order on this page. Try reloading and again.",
        };
      }
    }
    case 'GET_FOCUS_ORDER': {
      return { ok: true, enabled: await getFocusOrderTab(message.tabId) };
    }
    default:
      return { ok: false, error: 'Unknown message' };
  }
}
