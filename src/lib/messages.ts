import type { AuditResult, Settings } from './types';
import type { OutlineData } from './outline';
import type { VisionMode } from './vision';

/** Messages the side panel sends to the service worker. */
export type PanelMessage =
  | { type: 'RUN_AUDIT'; tabId: number }
  | { type: 'GET_CACHED_AUDIT'; tabId: number }
  | { type: 'HIGHLIGHT'; tabId: number; selector: string }
  | { type: 'CLEAR_HIGHLIGHT'; tabId: number }
  | { type: 'SET_TEXT_SPACING'; tabId: number; enabled: boolean }
  | { type: 'GET_TEXT_SPACING'; tabId: number }
  | { type: 'SET_FOCUS_ORDER'; tabId: number; enabled: boolean }
  | { type: 'GET_FOCUS_ORDER'; tabId: number }
  | { type: 'GET_OUTLINE'; tabId: number }
  | { type: 'SET_VISION'; tabId: number; mode: VisionMode | null }
  | { type: 'GET_VISION'; tabId: number }
  | { type: 'GET_SETTINGS' }
  | { type: 'SET_SETTINGS'; settings: Settings }
  | { type: 'SAVE_TO_DASHBOARD'; tabId: number };

export type RunAuditResponse =
  | { ok: true; result: AuditResult }
  | { ok: false; error: string };

export type CachedAuditResponse = { result: AuditResult | null };
export type SettingsResponse = { settings: Settings };
export type AckResponse = { ok: boolean };
export type TextSpacingResponse =
  | { ok: true; enabled: boolean }
  | { ok: false; error: string };
export type FocusOrderResponse =
  | { ok: true; enabled: boolean }
  | { ok: false; error: string };
export type OutlineResponse =
  | { ok: true; data: OutlineData }
  | { ok: false; error: string };
export type VisionResponse =
  | { ok: true; mode: VisionMode | null }
  | { ok: false; error: string };
export type SaveToDashboardResponse =
  | { ok: true; duplicate: boolean }
  | { ok: false; error: string };

export async function sendToWorker<T>(message: PanelMessage): Promise<T> {
  return (await chrome.runtime.sendMessage(message)) as T;
}
