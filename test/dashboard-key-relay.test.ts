// Guards the background side of the account-page key relay: RELAY_DASHBOARD_KEY
// merges the key into settings without clobbering other fields, and is
// refused unless the sender is a content-script-shaped sender whose origin
// matches the configured dashboard (plan 012). The content script itself
// (src/content/dashboard-key-relay.ts) listens via window.addEventListener,
// which needs a real DOM MessageEvent; this repo's test:unit harness is plain
// tsx running under Node with no DOM (no jsdom dependency, `window` is
// undefined), so that half is only exercisable via test:smoke's puppeteer
// flow, not here.
// Run with: tsx test/dashboard-key-relay.test.ts
import {
  DEFAULT_SETTINGS,
  HARPOON_DASHBOARD_URL,
  reconnectSettingsToHarpoon,
} from '../src/lib/storage';
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
  runtime: { id: 'test-ext', onConnect: noopEvent, onMessage: noopEvent },
  sidePanel: undefined,
  scripting: { executeScript: async () => [] },
};

// A relay sender: a content script on the configured dashboard origin.
const relaySender = (origin: string) =>
  ({ id: 'test-ext', origin, tab: { id: 1 } } as unknown as chrome.runtime.MessageSender);

async function main(): Promise<void> {
  const { handleMessage } = await import('../src/background/service-worker');

  // --- merges apiKey without clobbering other settings fields ---
  store = { settings: { ...DEFAULT_SETTINGS, theme: 'dark', wcagVersion: '2.2' } as Settings };
  await handleMessage(
    { type: 'RELAY_DASHBOARD_KEY', apiKey: 'mend_relayed' },
    relaySender(HARPOON_DASHBOARD_URL),
  );
  const merged = store.settings as Settings;
  ok('apiKey is stored', merged.dashboardApiKey === 'mend_relayed');
  ok('unrelated fields survive', merged.theme === 'dark' && merged.wcagVersion === '2.2');

  // --- a relay from a non-matching origin (a subdomain of the dashboard host)
  // is refused and writes nothing ---
  store = { settings: { ...DEFAULT_SETTINGS } as Settings };
  const refused = await handleMessage(
    { type: 'RELAY_DASHBOARD_KEY', apiKey: 'mend_relayed2' },
    relaySender('https://staging.mend-a11y.com'),
  ) as { ok: boolean };
  const untouched = store.settings as Settings;
  ok('relay from a subdomain is refused', refused.ok === false);
  ok('a refused relay leaves dashboardUrl untouched', untouched.dashboardUrl === HARPOON_DASHBOARD_URL);
  ok('a refused relay leaves the key unset', untouched.dashboardApiKey === '');

  // --- a relay from the exact configured origin succeeds and leaves
  // dashboardUrl untouched ---
  store = { settings: { ...DEFAULT_SETTINGS, dashboardUrl: 'https://existing.test' } as Settings };
  await handleMessage(
    { type: 'RELAY_DASHBOARD_KEY', apiKey: 'mend_relayed3' },
    relaySender('https://existing.test'),
  );
  const withoutOrigin = store.settings as Settings;
  ok('a relay from the configured origin is accepted', withoutOrigin.dashboardApiKey === 'mend_relayed3');
  ok('dashboardUrl is unchanged by a successful relay',
    withoutOrigin.dashboardUrl === 'https://existing.test');

  // --- a legacy stored blob (before autoSync / the account prompt) gains the defaults ---
  const { getSettings } = await import('../src/lib/storage');
  const legacy = { ...DEFAULT_SETTINGS } as Partial<Settings>;
  delete legacy.autoSync;
  delete legacy.accountPromptDismissed;
  store = { settings: legacy };
  const migrated = await getSettings();
  ok('legacy blob defaults autoSync on', migrated.autoSync === true);
  ok('legacy blob defaults the prompt undismissed', migrated.accountPromptDismissed === false);

  // --- a relayed key never resurrects a dismissed prompt ---
  store = { settings: { ...DEFAULT_SETTINGS, accountPromptDismissed: true } as Settings };
  await handleMessage(
    { type: 'RELAY_DASHBOARD_KEY', apiKey: 'mend_relayed4' },
    relaySender(HARPOON_DASHBOARD_URL),
  );
  const dismissed = store.settings as Settings;
  ok('accountPromptDismissed survives the relay merge', dismissed.accountPromptDismissed === true);
  ok('relay leaves autoSync on', dismissed.autoSync === true);

  // --- migration is explicit and exact-origin only ---
  const reconnected = reconnectSettingsToHarpoon({
    ...DEFAULT_SETTINGS,
    dashboardUrl: 'https://mend-a11y.com',
    dashboardApiKey: 'old-secret',
    autoSync: false,
  });
  ok('explicit reconnect replaces the old first-party origin', reconnected.dashboardUrl === HARPOON_DASHBOARD_URL);
  ok('explicit reconnect clears the old key', reconnected.dashboardApiKey === '');
  ok('explicit reconnect preserves disabled auto-save', reconnected.autoSync === false);
  const custom = { ...DEFAULT_SETTINGS, dashboardUrl: 'https://self-hosted.example', dashboardApiKey: 'custom' };
  ok('custom endpoints are never rewritten', reconnectSettingsToHarpoon(custom) === custom);

  let pass = 0;
  for (const [name, cond] of checks) {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
    if (cond) pass++;
  }
  console.log(`\n${pass}/${checks.length} checks passed`);
  process.exit(pass === checks.length ? 0 : 1);
}

void main();
