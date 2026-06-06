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

// Per-tab helper state, session-backed. Each helper writes its effect directly
// into the page (an injected style or overlay) that the browser tears down on
// reload, so these records are cleared on navigation and tab close to stay in
// sync with what is actually on the page. The value is `true` for on/off helpers
// (text spacing, focus order) or a mode string for the vision simulation;
// absent means off.
function perTabState<T extends string | true>(prefix: string) {
  const key = (tabId: number): string => `${prefix}:${tabId}`;
  return {
    async set(tabId: number, value: T | null): Promise<void> {
      try {
        if (value == null) await chrome.storage.session.remove(key(tabId));
        else await chrome.storage.session.set({ [key(tabId)]: value });
      } catch {
        /* ignore */
      }
    },
    async get(tabId: number): Promise<T | null> {
      try {
        const got = await chrome.storage.session.get(key(tabId));
        return (got[key(tabId)] ?? null) as T | null;
      } catch {
        return null;
      }
    },
  };
}

const textSpacing = perTabState<true>('ts');
const focusOrder = perTabState<true>('fo');
const vision = perTabState<string>('vs');

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
    default:
      return { ok: false, error: 'Unknown message' };
  }
}
