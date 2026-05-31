import { runAudit } from '../lib/audit';
import type { PanelMessage } from '../lib/messages';
import {
  clearCachedAudit,
  getCachedAudit,
  getSettings,
  setSettings,
} from '../lib/storage';

// Toolbar button opens the side panel.
function enablePanelOnClick(): void {
  chrome.sidePanel
    ?.setPanelBehavior?.({ openPanelOnActionClick: true })
    .catch(() => {
      /* not fatal */
    });
}
chrome.runtime.onInstalled.addListener(enablePanelOnClick);
enablePanelOnClick();

// Drop cached results when a tab starts navigating so we never show stale data.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    void clearCachedAudit(tabId);
  }
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
      await chrome.tabs
        .sendMessage(message.tabId, { type: 'HIGHLIGHT', selector: message.selector })
        .catch(() => {});
      return { ok: true };
    }
    case 'CLEAR_HIGHLIGHT': {
      await chrome.tabs
        .sendMessage(message.tabId, { type: 'CLEAR_HIGHLIGHT' })
        .catch(() => {});
      return { ok: true };
    }
    default:
      return { ok: false, error: 'Unknown message' };
  }
}
