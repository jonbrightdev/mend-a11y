// Guards the "Save audit" funnel's extension half (plan 009): STAGE_PENDING_SAVE
// snapshots the finished run into a tab-independent session slot, and
// RELAY_DASHBOARD_KEY flushes that snapshot to the dashboard the moment the
// /connect page relays a key — including after the audited tab's own cache
// entry has been cleared by navigation, which is the whole point. Same harness
// notes as dashboard-key-relay.test.ts: plain tsx under Node, no DOM, so the
// content script's window listener is exercised by test:smoke, not here.
// Run with: tsx test/pending-save.test.ts
import {
  DEFAULT_SETTINGS,
  HARPOON_DASHBOARD_URL,
  reconnectSettingsToHarpoon,
  setSettings,
} from '../src/lib/storage';
import type { AuditResult, PendingSave, Settings } from '../src/lib/types';

const checks: [string, boolean][] = [];
const ok = (name: string, cond: boolean) => checks.push([name, cond]);

// In-memory chrome.storage stubs. Unlike dashboard-key-relay.test.ts this needs
// a real session store (the audit cache and the pending snapshot live there),
// plus a fetch stub standing in for the portal's /api/ingest.
let store: Record<string, unknown> = {};
let session: Record<string, unknown> = {};
const backedBy = (bucket: () => Record<string, unknown>, mutate: (fn: (b: Record<string, unknown>) => void) => void) => ({
  get: async (key: string) => (key in bucket() ? { [key]: bucket()[key] } : {}),
  set: async (obj: Record<string, unknown>) => {
    mutate((b) => Object.assign(b, obj));
  },
  remove: async (key: string) => {
    mutate((b) => {
      delete b[key];
    });
  },
});
const local = backedBy(() => store, (fn) => fn(store));
const sessionArea = backedBy(() => session, (fn) => fn(session));

let tabTitle: string | undefined = 'Example Domain';
const noopEvent = { addListener: () => {} };
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: { local, session: sessionArea },
  action: { onClicked: noopEvent },
  tabs: { onUpdated: noopEvent, onRemoved: noopEvent, get: async () => ({ title: tabTitle }) },
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
// Relay-shaped sender: a content script on the configured dashboard origin
// (DEFAULT_SETTINGS.dashboardUrl is the Harpoon application origin).
const relaySender = {
  id: 'test-ext',
  origin: HARPOON_DASHBOARD_URL,
  tab: { id: 1 },
} as unknown as chrome.runtime.MessageSender;

// fetch stub: records requests, answers with a scripted status/body.
interface FetchCall {
  url: string;
  body: unknown;
}
let fetchCalls: FetchCall[] = [];
let fetchReply: { status: number; body: unknown } = { status: 200, body: { duplicate: false } };
(globalThis as { fetch: unknown }).fetch = async (url: string, init: { body: string }) => {
  fetchCalls.push({ url, body: JSON.parse(init.body) });
  const { status, body } = fetchReply;
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
};

const audit: AuditResult = {
  url: 'https://example.com/page',
  startedAt: 1754400000000,
  durationMs: 1234,
  issues: [],
  totalChecks: 42,
  partial: false,
};

async function main(): Promise<void> {
  const { handleMessage } = await import('../src/background/service-worker');
  const { setCachedAudit, clearCachedAudit } = await import('../src/lib/storage');

  // --- STAGE_PENDING_SAVE snapshots the cached audit and the tab title ---
  store = { settings: { ...DEFAULT_SETTINGS } as Settings };
  session = {};
  await setCachedAudit(7, audit);
  const staged = await handleMessage({ type: 'STAGE_PENDING_SAVE', tabId: 7 }, panelSender);
  const snapshot = session.pendingSave as PendingSave | undefined;
  ok('staging a cached audit returns ok', (staged as { ok: boolean }).ok === true);
  ok('snapshot copies the result', snapshot?.result.url === audit.url);
  ok('snapshot resolves the tab title', snapshot?.pageTitle === 'Example Domain');

  // --- staging falls back to the audit URL when the tab has no title ---
  session = {};
  tabTitle = undefined;
  await setCachedAudit(7, audit);
  await handleMessage({ type: 'STAGE_PENDING_SAVE', tabId: 7 }, panelSender);
  ok(
    'snapshot falls back to the audit URL as title',
    (session.pendingSave as PendingSave).pageTitle === audit.url,
  );
  tabTitle = 'Example Domain';

  // --- STAGE_PENDING_SAVE with no cached audit stores nothing ---
  session = {};
  const notStaged = await handleMessage({ type: 'STAGE_PENDING_SAVE', tabId: 99 }, panelSender);
  ok('staging without a cached audit returns ok: false', (notStaged as { ok: boolean }).ok === false);
  ok('nothing is stored without a cached audit', !('pendingSave' in session));

  // --- RELAY_DASHBOARD_KEY with a staged save uploads it and clears the slot ---
  store = { settings: { ...DEFAULT_SETTINGS } as Settings };
  session = {};
  fetchCalls = [];
  fetchReply = { status: 200, body: { duplicate: false } };
  await setCachedAudit(7, audit);
  await handleMessage({ type: 'STAGE_PENDING_SAVE', tabId: 7 }, panelSender);
  const relayed = await handleMessage(
    { type: 'RELAY_DASHBOARD_KEY', apiKey: 'mend_key1' },
    relaySender,
  ) as { ok: boolean; uploaded: boolean };
  ok('relay with a staged save reports uploaded', relayed.ok === true && relayed.uploaded === true);
  ok('the staged audit was POSTed to /api/ingest',
    fetchCalls.length === 1 && fetchCalls[0].url === `${HARPOON_DASHBOARD_URL}/api/ingest`);
  ok('the POST carries the snapshot, title included',
    (fetchCalls[0].body as { url: string; pageTitle: string }).url === audit.url &&
    (fetchCalls[0].body as { pageTitle: string }).pageTitle === 'Example Domain');
  ok('the snapshot is cleared after upload', !('pendingSave' in session));
  ok('the key still lands in settings', (store.settings as Settings).dashboardApiKey === 'mend_key1');

  // --- RELAY_DASHBOARD_KEY with nothing staged skips the network entirely ---
  store = { settings: { ...DEFAULT_SETTINGS } as Settings };
  session = {};
  fetchCalls = [];
  const bare = await handleMessage(
    { type: 'RELAY_DASHBOARD_KEY', apiKey: 'mend_key2' },
    relaySender,
  ) as { ok: boolean; uploaded: boolean };
  ok('relay without a staged save reports uploaded: false', bare.ok === true && bare.uploaded === false);
  ok('no request is made without a staged save', fetchCalls.length === 0);
  ok('the key lands anyway', (store.settings as Settings).dashboardApiKey === 'mend_key2');

  // --- a retryable failure (500) keeps the snapshot; the key still lands ---
  store = { settings: { ...DEFAULT_SETTINGS } as Settings };
  session = {};
  fetchCalls = [];
  fetchReply = { status: 500, body: { error: 'server exploded' } };
  await setCachedAudit(7, audit);
  await handleMessage({ type: 'STAGE_PENDING_SAVE', tabId: 7 }, panelSender);
  const failed = await handleMessage(
    { type: 'RELAY_DASHBOARD_KEY', apiKey: 'mend_key3' },
    relaySender,
  ) as { ok: boolean; uploaded: boolean };
  ok('a 500 still resolves the relay ok', failed.ok === true && failed.uploaded === false);
  ok('a 500 keeps the snapshot for a retry', 'pendingSave' in session);
  ok('a 500 still stores the key', (store.settings as Settings).dashboardApiKey === 'mend_key3');

  // --- a non-retryable refusal (403 AUDIT_CAP) drops the snapshot ---
  fetchCalls = [];
  fetchReply = { status: 403, body: { error: 'Saved audit limit reached.', code: 'AUDIT_CAP' } };
  const capped = await handleMessage(
    { type: 'RELAY_DASHBOARD_KEY', apiKey: 'mend_key4' },
    relaySender,
  ) as { ok: boolean; uploaded: boolean };
  ok('AUDIT_CAP still resolves the relay ok', capped.ok === true && capped.uploaded === false);
  ok('AUDIT_CAP clears the snapshot', !('pendingSave' in session));
  ok('AUDIT_CAP still stores the key', (store.settings as Settings).dashboardApiKey === 'mend_key4');

  // --- the snapshot survives a cleared tab cache (the point of the plan) ---
  store = { settings: { ...DEFAULT_SETTINGS } as Settings };
  session = {};
  fetchCalls = [];
  fetchReply = { status: 200, body: { duplicate: false } };
  await setCachedAudit(7, audit);
  await handleMessage({ type: 'STAGE_PENDING_SAVE', tabId: 7 }, panelSender);
  await clearCachedAudit(7); // what onUpdated does when the audited tab navigates
  const afterNav = await handleMessage(
    { type: 'RELAY_DASHBOARD_KEY', apiKey: 'mend_key5' },
    relaySender,
  ) as { ok: boolean; uploaded: boolean };
  ok('the upload survives the tab cache being cleared',
    afterNav.uploaded === true && fetchCalls.length === 1);

  // --- explicit first-party reconnect changes only local settings; a pending audit stays ---
  session = { pendingSave: { result: audit, pageTitle: 'Still pending', stagedAt: Date.now() } };
  const legacySettings = {
    ...DEFAULT_SETTINGS,
    dashboardUrl: 'https://mend-a11y.com',
    dashboardApiKey: 'old-mend-key',
    autoSync: false,
  } as Settings;
  await setSettings(reconnectSettingsToHarpoon(legacySettings));
  ok('reconnect preserves a pending local result', 'pendingSave' in session);
  ok('reconnect preserves disabled auto-save', (store.settings as Settings).autoSync === false);
  ok('reconnect never sends the old key', (store.settings as Settings).dashboardApiKey === '');

  let pass = 0;
  for (const [name, cond] of checks) {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
    if (cond) pass++;
  }
  console.log(`\n${pass}/${checks.length} checks passed`);
  process.exit(pass === checks.length ? 0 : 1);
}

void main();
