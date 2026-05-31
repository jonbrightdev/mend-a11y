import { runAudit } from '../lib/audit';
import type { PanelMessage } from '../lib/messages';
import { HIGHLIGHT_ACCENT, clearHighlightInPage, highlightInPage } from '../lib/highlight';
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
// the panel closes or the user moves on.
let highlightTabId: number | null = null;

function clearHighlightOn(tabId: number): void {
  chrome.scripting
    .executeScript({ target: { tabId }, func: clearHighlightInPage })
    .catch(() => {});
}

// Drop cached results when a tab starts navigating so we never show stale data,
// and clear any overlay we had on it.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    void clearCachedAudit(tabId);
    if (highlightTabId === tabId) highlightTabId = null;
  }
});

// Tidy the per-tab cache when a tab closes so ids don't accumulate stale audits.
chrome.tabs.onRemoved.addListener((tabId) => {
  void clearCachedAudit(tabId);
  if (highlightTabId === tabId) highlightTabId = null;
});

// The panel opens a long-lived port on mount. When the panel closes, the port
// disconnects and we clear any overlay still drawn on the page.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'mend-panel') return;
  port.onDisconnect.addListener(() => {
    if (highlightTabId != null) {
      clearHighlightOn(highlightTabId);
      highlightTabId = null;
    }
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
      highlightTabId = message.tabId;
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
      if (highlightTabId === message.tabId) highlightTabId = null;
      await chrome.scripting
        .executeScript({
          target: { tabId: message.tabId },
          func: clearHighlightInPage,
        })
        .catch(() => {});
      return { ok: true };
    }
    default:
      return { ok: false, error: 'Unknown message' };
  }
}
