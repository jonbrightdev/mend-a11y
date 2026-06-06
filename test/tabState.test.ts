// Guards the per-tab helper state: set/get round-trips, activeTabs lists only
// the tabs recorded under a given prefix (ignoring other session keys), and
// clearHelperEverywhere reverts each active tab and forgets it.
// Run with: tsx test/tabState.test.ts
import { clearHelperEverywhere, perTabState } from '../src/lib/tabState';

const checks: [string, boolean][] = [];
const ok = (name: string, cond: boolean) => checks.push([name, cond]);

// In-memory chrome.storage.session stub. get(null) returns everything; get(key)
// returns the single entry; set merges; remove deletes.
let store: Record<string, unknown> = {};
const session = {
  get: async (key: string | null) => {
    if (key == null) return { ...store };
    return key in store ? { [key]: store[key] } : {};
  },
  set: async (obj: Record<string, unknown>) => {
    store = { ...store, ...obj };
  },
  remove: async (key: string) => {
    delete store[key];
  },
};
(globalThis as unknown as { chrome: unknown }).chrome = { storage: { session } };

const ts = perTabState<true>('ts');
const fo = perTabState<true>('fo');
const vs = perTabState<string>('vs');

async function main(): Promise<void> {
  // --- set / get round-trip ---
  store = {};
  await ts.set(5, true);
  ok('get returns the stored flag', (await ts.get(5)) === true);
  ok('absent tab reads as null', (await ts.get(99)) === null);
  await ts.set(5, null);
  ok('set(null) clears the record', (await ts.get(5)) === null);

  await vs.set(7, 'lowVision');
  ok('string value round-trips', (await vs.get(7)) === 'lowVision');

  // --- activeTabs lists only this prefix ---
  store = {
    'ts:5': true,
    'ts:12': true,
    'fo:3': true,
    'vs:7': 'protanopia',
    'ts:abc': true, // malformed, should be ignored
    highlightTabId: 9,
    settings: { theme: 'light' },
  };
  ok(
    'activeTabs returns matching, integer tab ids',
    (await ts.activeTabs()).sort((a, b) => a - b).join(',') === '5,12',
  );
  ok('activeTabs is prefix-scoped', (await fo.activeTabs()).join(',') === '3');
  ok('activeTabs ignores other prefixes and keys', (await vs.activeTabs()).join(',') === '7');

  // --- clearHelperEverywhere reverts each tab and forgets it ---
  store = { 'ts:5': true, 'ts:12': true, 'fo:3': true };
  const reverted: number[] = [];
  await clearHelperEverywhere(ts, (tabId) => reverted.push(tabId));
  ok('teardown ran for each active tab', reverted.sort((a, b) => a - b).join(',') === '5,12');
  ok('cleared tabs no longer active', (await ts.activeTabs()).length === 0);
  ok('other helpers are left untouched', (await fo.activeTabs()).join(',') === '3');

  let pass = 0;
  for (const [name, cond] of checks) {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
    if (cond) pass++;
  }
  console.log(`\n${pass}/${checks.length} checks passed`);
  process.exit(pass === checks.length ? 0 : 1);
}

void main();
