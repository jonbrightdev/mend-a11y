// Guards the background side of the account-page key relay: RELAY_DASHBOARD_KEY
// merges the key into settings without clobbering other fields, and adopts the
// sender's origin as dashboardUrl. The content script itself
// (src/content/dashboard-key-relay.ts) listens via window.addEventListener,
// which needs a real DOM MessageEvent; this repo's test:unit harness is plain
// tsx running under Node with no DOM (no jsdom dependency, `window` is
// undefined), so that half is only exercisable via test:smoke's puppeteer
// flow, not here.
// Run with: tsx test/dashboard-key-relay.test.ts
import { DEFAULT_SETTINGS } from '../src/lib/storage';
import type { Settings } from '../src/lib/types';

const checks: [string, boolean][] = [];
const ok = (name: string, cond: boolean) => checks.push([name, cond]);

// In-memory chrome.storage.local stub, plus no-op stand-ins for every other
// chrome.* surface service-worker.ts touches at module load time (registering
// its various onClicked/onUpdated/onRemoved/onConnect/onMessage listeners).
let store: Record<string, unknown> = {};
const local = {
  get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
  set: async (obj: Record<string, unknown>) => {
    store = { ...store, ...obj };
  },
};
const noopEvent = { addListener: () => {} };
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: { local, session: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
  action: { onClicked: noopEvent },
  tabs: { onUpdated: noopEvent, onRemoved: noopEvent, get: async () => null },
  runtime: { onConnect: noopEvent, onMessage: noopEvent },
  sidePanel: undefined,
  scripting: { executeScript: async () => [] },
};

async function main(): Promise<void> {
  const { handleMessage } = await import('../src/background/service-worker');

  // --- merges apiKey without clobbering other settings fields ---
  store = { settings: { ...DEFAULT_SETTINGS, theme: 'dark', wcagVersion: '2.2' } as Settings };
  await handleMessage({ type: 'RELAY_DASHBOARD_KEY', apiKey: 'mend_relayed' }, { origin: undefined });
  const merged = store.settings as Settings;
  ok('apiKey is stored', merged.dashboardApiKey === 'mend_relayed');
  ok('unrelated fields survive', merged.theme === 'dark' && merged.wcagVersion === '2.2');

  // --- adopts sender.origin as dashboardUrl when provided ---
  store = { settings: { ...DEFAULT_SETTINGS } as Settings };
  await handleMessage(
    { type: 'RELAY_DASHBOARD_KEY', apiKey: 'mend_relayed2' },
    { origin: 'https://staging.mend-a11y.com' },
  );
  const withOrigin = store.settings as Settings;
  ok('dashboardUrl adopts sender.origin', withOrigin.dashboardUrl === 'https://staging.mend-a11y.com');

  // --- falls back to the existing dashboardUrl when sender.origin is absent ---
  store = { settings: { ...DEFAULT_SETTINGS, dashboardUrl: 'https://existing.test' } as Settings };
  await handleMessage({ type: 'RELAY_DASHBOARD_KEY', apiKey: 'mend_relayed3' }, { origin: undefined });
  const withoutOrigin = store.settings as Settings;
  ok('dashboardUrl falls back to prior settings when origin is missing',
    withoutOrigin.dashboardUrl === 'https://existing.test');

  let pass = 0;
  for (const [name, cond] of checks) {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
    if (cond) pass++;
  }
  console.log(`\n${pass}/${checks.length} checks passed`);
  process.exit(pass === checks.length ? 0 : 1);
}

void main();
