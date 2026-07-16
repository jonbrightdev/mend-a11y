import type { AuditResult, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  wcagVersion: '2.1',
  conformanceLevel: 'AA',
  thoroughness: 'standard',
  experimentalRules: false,
  highlightStyle: 'overlay',
  dashboardUrl: '',
  dashboardApiKey: '',
};

const SETTINGS_KEY = 'settings';
const cacheKey = (tabId: number): string => `audit:${tabId}`;

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const saved = stored[SETTINGS_KEY] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...saved };
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
