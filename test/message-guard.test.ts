// Guards the sender check added in front of every onMessage branch (plan 012):
// only the extension's own pages (the side panel, tab-less senders whose URL
// starts with chrome-extension://) and the dashboard-key relay content script
// (tab-bearing, origin matching the configured dashboard) are legitimate
// peers on this channel. Everything else — including a sender.id mismatch —
// is refused before any branch runs, so GET_SETTINGS never leaks the raw key
// and SET_SETTINGS never accepts a write from an unexpected sender.
// Run with: tsx test/message-guard.test.ts
import { DEFAULT_SETTINGS, HARPOON_DASHBOARD_URL } from '../src/lib/storage';
import type { Settings } from '../src/lib/types';

const checks: [string, boolean][] = [];
const ok = (name: string, cond: boolean) => checks.push([name, cond]);

// In-memory chrome.storage stub, plus no-op stand-ins for every other chrome.*
// surface service-worker.ts touches at module load time.
let store: Record<string, unknown> = {};
const local = {
  get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
  set: async (obj: Record<string, unknown>) => {
    store = { ...store, ...obj };
  },
};
const noopEvent = { addListener: () => {} };
let fetchCalls = 0;
(globalThis as { fetch: unknown }).fetch = async () => {
  fetchCalls++;
  return { status: 200, ok: true, json: async () => ({ duplicate: false }) };
};
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: { local, session: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
  action: { onClicked: noopEvent },
  tabs: { onUpdated: noopEvent, onRemoved: noopEvent, get: async () => null },
  runtime: { id: 'test-ext', onConnect: noopEvent, onMessage: noopEvent },
  sidePanel: undefined,
  scripting: { executeScript: async () => [] },
};

// Panel-shaped sender: the side panel page, no tab.
const panelSender = {
  id: 'test-ext',
  tab: undefined,
  url: 'chrome-extension://test/src/sidepanel/index.html',
} as unknown as chrome.runtime.MessageSender;
// Relay-shaped sender: a content script on the configured dashboard origin.
const relaySender = (origin: string) =>
  ({ id: 'test-ext', origin, tab: { id: 1 } } as unknown as chrome.runtime.MessageSender);
// A sender whose id does not match the extension's own id.
const foreignSender = {
  id: 'some-other-extension',
  tab: undefined,
  url: 'chrome-extension://test/src/sidepanel/index.html',
} as unknown as chrome.runtime.MessageSender;

async function main(): Promise<void> {
  const { handleMessage } = await import('../src/background/service-worker');

  // --- 1: GET_SETTINGS from a panel-shaped sender returns settings ---
  store = { settings: { ...DEFAULT_SETTINGS } as Settings };
  const panelSettings = (await handleMessage({ type: 'GET_SETTINGS' }, panelSender)) as {
    settings?: Settings;
  };
  ok('GET_SETTINGS from the panel returns settings', panelSettings.settings !== undefined);
  ok(
    'GET_SETTINGS from the panel returns the stored dashboardUrl',
    panelSettings.settings?.dashboardUrl === DEFAULT_SETTINGS.dashboardUrl,
  );

  // --- 2: GET_SETTINGS from a content-script-shaped sender is refused, and
  // the response carries no settings object ---
  const relaySettings = (await handleMessage(
    { type: 'GET_SETTINGS' },
    relaySender(HARPOON_DASHBOARD_URL),
  )) as { ok?: boolean; settings?: Settings };
  ok('GET_SETTINGS from the relay is refused', relaySettings.ok === false);
  ok('a refused GET_SETTINGS carries no settings object', relaySettings.settings === undefined);

  // --- 3: SET_SETTINGS from a tab-bearing sender is refused; storage
  // unchanged ---
  store = { settings: { ...DEFAULT_SETTINGS } as Settings };
  const beforeSet = JSON.stringify(store.settings);
  const setResult = (await handleMessage(
    { type: 'SET_SETTINGS', settings: { ...DEFAULT_SETTINGS, dashboardApiKey: 'hijacked' } },
    relaySender(HARPOON_DASHBOARD_URL),
  )) as { ok: boolean };
  ok('SET_SETTINGS from a tab-bearing sender is refused', setResult.ok === false);
  ok('a refused SET_SETTINGS leaves storage unchanged', JSON.stringify(store.settings) === beforeSet);

  // --- 4: RELAY_DASHBOARD_KEY from a panel-shaped sender (no tab) is refused ---
  store = { settings: { ...DEFAULT_SETTINGS } as Settings };
  const relayFromPanel = (await handleMessage(
    { type: 'RELAY_DASHBOARD_KEY', apiKey: 'from_panel' },
    panelSender,
  )) as { ok: boolean };
  ok('RELAY_DASHBOARD_KEY from a panel sender (no tab) is refused', relayFromPanel.ok === false);
  ok(
    'a refused panel relay leaves the key unset',
    (store.settings as Settings).dashboardApiKey === '',
  );

  // --- 5: RELAY_DASHBOARD_KEY from https://evil.example with a tab is
  // refused; key unchanged; no fetch performed ---
  store = { settings: { ...DEFAULT_SETTINGS } as Settings };
  fetchCalls = 0;
  const relayFromEvil = (await handleMessage(
    { type: 'RELAY_DASHBOARD_KEY', apiKey: 'from_evil' },
    relaySender('https://evil.example'),
  )) as { ok: boolean };
  ok('RELAY_DASHBOARD_KEY from an unrelated origin is refused', relayFromEvil.ok === false);
  ok(
    'a refused relay from an unrelated origin leaves the key unchanged',
    (store.settings as Settings).dashboardApiKey === '',
  );
  ok('a refused relay makes no fetch', fetchCalls === 0);

  // --- 6: RELAY_DASHBOARD_KEY from the configured origin with a tab is
  // accepted; key stored; dashboardUrl unchanged from its prior value ---
  store = { settings: { ...DEFAULT_SETTINGS, dashboardUrl: 'https://mend-a11y.com' } as Settings };
  const relayOk = (await handleMessage(
    { type: 'RELAY_DASHBOARD_KEY', apiKey: 'good_key' },
    relaySender('https://mend-a11y.com'),
  )) as { ok: boolean };
  ok('RELAY_DASHBOARD_KEY from the configured origin is accepted', relayOk.ok === true);
  ok(
    'the key lands in settings',
    (store.settings as Settings).dashboardApiKey === 'good_key',
  );
  ok(
    'dashboardUrl is unchanged by a successful relay',
    (store.settings as Settings).dashboardUrl === 'https://mend-a11y.com',
  );

  // --- 7: with settings pointing at a local dev URL, a relay from that same
  // origin is accepted (the expected-origin rule follows the configured URL,
  // not a hardcoded host) ---
  store = { settings: { ...DEFAULT_SETTINGS, dashboardUrl: 'http://localhost:3000' } as Settings };
  const relayDev = (await handleMessage(
    { type: 'RELAY_DASHBOARD_KEY', apiKey: 'dev_key' },
    relaySender('http://localhost:3000'),
  )) as { ok: boolean };
  ok('RELAY_DASHBOARD_KEY from the configured dev origin is accepted', relayDev.ok === true);
  ok(
    'the dev key lands in settings',
    (store.settings as Settings).dashboardApiKey === 'dev_key',
  );

  // --- 8: a sender with a mismatched sender.id is refused for every message
  // type tried ---
  store = { settings: { ...DEFAULT_SETTINGS } as Settings };
  const foreignGet = (await handleMessage({ type: 'GET_SETTINGS' }, foreignSender)) as {
    ok?: boolean;
    settings?: Settings;
  };
  ok('a mismatched sender.id is refused for GET_SETTINGS', foreignGet.ok === false);
  ok('a refused foreign GET_SETTINGS carries no settings object', foreignGet.settings === undefined);

  const foreignRelay = (await handleMessage(
    { type: 'RELAY_DASHBOARD_KEY', apiKey: 'foreign_key' },
    { id: 'some-other-extension', origin: HARPOON_DASHBOARD_URL, tab: { id: 1 } } as unknown as chrome.runtime.MessageSender,
  )) as { ok: boolean };
  ok('a mismatched sender.id is refused for RELAY_DASHBOARD_KEY', foreignRelay.ok === false);
  ok(
    'a refused foreign relay leaves the key unset',
    (store.settings as Settings).dashboardApiKey === '',
  );

  let pass = 0;
  for (const [name, cond] of checks) {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
    if (cond) pass++;
  }
  console.log(`\n${pass}/${checks.length} checks passed`);
  process.exit(pass === checks.length ? 0 : 1);
}

void main();
