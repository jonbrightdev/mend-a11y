import type { AuditResult, PendingSave, Settings } from './types';

export const HARPOON_DASHBOARD_URL = 'https://app.harpoon.solutions';
export const LEGACY_MEND_DASHBOARD_URL = 'https://mend-a11y.com';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  wcagVersion: '2.1',
  conformanceLevel: 'AA',
  thoroughness: 'standard',
  experimentalRules: false,
  highlightStyle: 'overlay',
  dashboardUrl: HARPOON_DASHBOARD_URL,
  dashboardApiKey: '',
  autoSync: true,
  accountPromptDismissed: false,
};

/** Exact first-party legacy origin only; custom/self-hosted destinations are never rewritten. */
export function usesLegacyMendDashboard(settings: Settings): boolean {
  return settings.dashboardUrl.replace(/\/+$/, '') === LEGACY_MEND_DASHBOARD_URL;
}

/** User-triggered migration. Pending audit snapshots live in session storage and survive. */
export function reconnectSettingsToHarpoon(settings: Settings): Settings {
  if (!usesLegacyMendDashboard(settings)) return settings;
  return { ...settings, dashboardUrl: HARPOON_DASHBOARD_URL, dashboardApiKey: '' };
}

const SETTINGS_KEY = 'settings';
const cacheKey = (tabId: number): string => `audit:${tabId}`;

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const saved = stored[SETTINGS_KEY] as Partial<Settings> | undefined;
  const merged = { ...DEFAULT_SETTINGS, ...saved };
  // Older installs may have persisted an empty string before the URL field
  // was hidden and defaulted; treat that the same as never having set it.
  if (!merged.dashboardUrl.trim()) merged.dashboardUrl = DEFAULT_SETTINGS.dashboardUrl;
  return merged;
}

export async function setSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function getCachedAudit(tabId: number): Promise<AuditResult | null> {
  const key = cacheKey(tabId);
  const stored = await chrome.storage.session.get(key);
  return (stored[key] as AuditResult | undefined) ?? null;
}

export async function setCachedAudit(tabId: number, result: AuditResult): Promise<void> {
  await chrome.storage.session.set({ [cacheKey(tabId)]: result });
}

export async function clearCachedAudit(tabId: number): Promise<void> {
  await chrome.storage.session.remove(cacheKey(tabId));
}

// The pending save is a tab-independent snapshot of a finished run, staged when
// the user presses "Save audit" and flushed by the worker the moment the
// /connect funnel relays a key. Session-scoped on purpose: it holds page
// content (selectors, HTML snippets) and must not outlive the browser session.
const PENDING_SAVE_KEY = 'pendingSave';

export async function getPendingSave(): Promise<PendingSave | null> {
  const stored = await chrome.storage.session.get(PENDING_SAVE_KEY);
  return (stored[PENDING_SAVE_KEY] as PendingSave | undefined) ?? null;
}

export async function setPendingSave(pending: PendingSave): Promise<void> {
  await chrome.storage.session.set({ [PENDING_SAVE_KEY]: pending });
}

export async function clearPendingSave(): Promise<void> {
  await chrome.storage.session.remove(PENDING_SAVE_KEY);
}
