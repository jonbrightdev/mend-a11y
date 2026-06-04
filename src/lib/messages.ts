import type { AuditResult, Settings } from './types';

/** Messages the side panel sends to the service worker. */
export type PanelMessage =
  | { type: 'RUN_AUDIT'; tabId: number }
  | { type: 'GET_CACHED_AUDIT'; tabId: number }
  | { type: 'HIGHLIGHT'; tabId: number; selector: string }
  | { type: 'CLEAR_HIGHLIGHT'; tabId: number }
  | { type: 'SET_TEXT_SPACING'; tabId: number; enabled: boolean }
  | { type: 'GET_TEXT_SPACING'; tabId: number }
  | { type: 'GET_SETTINGS' }
  | { type: 'SET_SETTINGS'; settings: Settings };

export type RunAuditResponse =
  | { ok: true; result: AuditResult }
  | { ok: false; error: string };

export type CachedAuditResponse = { result: AuditResult | null };
export type SettingsResponse = { settings: Settings };
export type AckResponse = { ok: boolean };
export type TextSpacingResponse =
  | { ok: true; enabled: boolean }
  | { ok: false; error: string };

export async function sendToWorker<T>(message: PanelMessage): Promise<T> {
  return (await chrome.runtime.sendMessage(message)) as T;
}
