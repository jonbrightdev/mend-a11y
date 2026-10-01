// Characterizes src/lib/audit.ts (plan 015): the injection ladder (all-frames
// engine injection, top-frame retry, restricted-page vs missing-grant error
// classification), the audit timeout, and result assembly. This pins TODAY's
// behavior, including two known-suspect branches marked below — plan 016
// edits audit.ts and updates those two checks in the same commit.
// Run with: tsx test/audit.test.ts
import { DEFAULT_SETTINGS } from '../src/lib/storage';
import type { RawRunnerResult } from '../src/lib/normalize';
import type { Settings } from '../src/lib/types';

const checks: [string, boolean][] = [];
const ok = (name: string, cond: boolean) => checks.push([name, cond]);

// --- in-memory chrome.storage stubs (modeled on test/pending-save.test.ts) ---
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

// --- chrome.tabs.get: returns urls from a queue, one per call, repeating the
// last entry once the queue is exhausted (so re-reads after the queue has one
// entry just see the same value again). ---
let tabUrlQueue: string[] = [''];
let tabGetCallCount = 0;
const tabsGet = async (_tabId: number): Promise<{ url: string }> => {
  const idx = Math.min(tabGetCallCount, tabUrlQueue.length - 1);
  const url = tabUrlQueue[idx] ?? '';
  tabGetCallCount++;
  return { url };
};

// --- chrome.scripting.executeScript: a dispatcher keyed on call shape (files
// vs func, allFrames vs not), each independently configurable per case. ---
type ScriptOutcome =
  | { kind: 'resolve'; value: Array<{ frameId?: number; result?: unknown; error?: unknown }> }
  | { kind: 'reject'; error: Error }
  | { kind: 'never' };

let allFramesFilesOutcome: ScriptOutcome = { kind: 'resolve', value: [] };
let topFrameFilesOutcome: ScriptOutcome = { kind: 'resolve', value: [] };
let funcRunOutcome: ScriptOutcome = { kind: 'resolve', value: [{ result: undefined }] };

async function settle(o: ScriptOutcome): Promise<unknown> {
  if (o.kind === 'resolve') return o.value;
  if (o.kind === 'reject') throw o.error;
  return new Promise(() => {
    /* never settles */
  });
}

interface ExecuteScriptOpts {
  target: { tabId: number; allFrames?: boolean };
  world: string;
  files?: string[];
  func?: (...args: unknown[]) => unknown;
  args?: unknown[];
}
const executeScript = async (opts: ExecuteScriptOpts): Promise<unknown> => {
  if (typeof opts.func === 'function') return settle(funcRunOutcome);
  if (opts.target.allFrames) return settle(allFramesFilesOutcome);
  return settle(topFrameFilesOutcome);
};

(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: { local, session: sessionArea },
  tabs: { get: tabsGet },
  scripting: { executeScript },
};

// Reset all mutable stub state between cases so the suite stays order-independent.
function reset(): void {
  store = { settings: { ...DEFAULT_SETTINGS } as Settings };
  session = {};
  tabUrlQueue = [''];
  tabGetCallCount = 0;
  allFramesFilesOutcome = { kind: 'resolve', value: [] };
  topFrameFilesOutcome = { kind: 'resolve', value: [] };
  funcRunOutcome = { kind: 'resolve', value: [{ result: undefined }] };
}

const rawResult: RawRunnerResult = {
  violations: [
    {
      id: 'color-contrast',
      impact: 'serious',
      help: 'Elements must meet contrast',
      helpUrl: 'https://x',
      tags: ['wcag2aa', 'wcag143'],
      nodes: [{ target: ['.a'], html: '<a class="a"></a>', failureSummary: 'raise contrast', domOrder: 0 }],
    },
    {
      id: 'image-alt',
      impact: 'critical',
      help: 'Images must have alt text',
      helpUrl: 'https://y',
      tags: ['wcag2a', 'wcag111'],
      nodes: [{ target: ['img'], html: '<img>', failureSummary: 'add alt', domOrder: 1 }],
    },
  ],
  counts: { passes: 10, violations: 2, incomplete: 1, inapplicable: 3 },
};

async function main(): Promise<void> {
  const { runAudit } = await import('../src/lib/audit');

  // --- 1) chrome:// url rejects via assertAuditable, before any injection ---
  reset();
  tabUrlQueue = ['chrome://settings'];
  let err1: Error | undefined;
  try {
    await runAudit(1);
  } catch (e) {
    err1 = e as Error;
  }
  ok('chrome:// url rejects with the browser/extension-pages message', !!err1 && /browser or extension pages/.test(err1.message));

  // --- 2) Web Store url rejects via assertAuditable ---
  reset();
  tabUrlQueue = ['https://chromewebstore.google.com/detail/x'];
  let err2: Error | undefined;
  try {
    await runAudit(2);
  } catch (e) {
    err2 = e as Error;
  }
  ok('Web Store url rejects with the Web Store message', !!err2 && /Web Store/.test(err2.message));

  // --- 3) empty url + all-frames injection denied for missing grant ---
  reset();
  tabUrlQueue = [''];
  allFramesFilesOutcome = {
    kind: 'reject',
    error: new Error('Cannot access contents of the page. Extension manifest must request permission.'),
  };
  let err3: Error | undefined;
  try {
    await runAudit(3);
  } catch (e) {
    err3 = e as Error;
  }
  ok('missing-grant injection failure rejects with the Click-the-Mend-icon guidance', !!err3 && /Click the Mend icon/.test(err3.message));

  // --- 4) empty url + all-frames injection denied because the page is restricted ---
  reset();
  tabUrlQueue = [''];
  allFramesFilesOutcome = { kind: 'reject', error: new Error('The extensions gallery cannot be scripted.') };
  let err4: Error | undefined;
  try {
    await runAudit(4);
  } catch (e) {
    err4 = e as Error;
  }
  ok('restricted-page injection failure rejects with the browser/extension-pages message', !!err4 && /browser or extension pages/.test(err4.message));

  // --- 5) happy path: all-frames ok, func-run returns real violations ---
  reset();
  tabUrlQueue = ['https://example.com'];
  allFramesFilesOutcome = { kind: 'resolve', value: [{ frameId: 0, result: undefined }] };
  funcRunOutcome = { kind: 'resolve', value: [{ result: rawResult }] };
  const result5 = await runAudit(5);
  ok('happy path resolves with an AuditResult', !!result5 && Array.isArray(result5.issues));
  ok('happy path is not marked partial', result5.partial === false);
  ok('happy path issue count matches the raw violations', result5.issues.length === 2);
  ok('happy path result is cached under audit:<tabId>', session['audit:5'] !== undefined);

  // --- 6) all-frames rejects with a generic error; top-frame retry succeeds ---
  reset();
  tabUrlQueue = ['https://example.com'];
  allFramesFilesOutcome = { kind: 'reject', error: new Error('Frame with ID 42 was removed.') };
  topFrameFilesOutcome = { kind: 'resolve', value: [{ frameId: 0, result: undefined }] };
  funcRunOutcome = { kind: 'resolve', value: [{ result: rawResult }] };
  const result6 = await runAudit(6);
  ok('generic all-frames failure falls back to the top frame and still succeeds', result6.issues.length === 2);
  ok('the top-frame fallback marks the audit partial', result6.partial === true);
  ok('the top-frame fallback sets a partialReason', typeof result6.partialReason === 'string' && result6.partialReason.length > 0);

  // --- 7) a frame reports result: null -> partial is pinned true.
  // plan 016 landed: probed live against Chrome 148 and confirmed this is a
  // real failure shape (a script-blocked sandboxed frame reports exactly
  // this), so the predicate keeps treating it as partial.
  reset();
  tabUrlQueue = ['https://example.com'];
  allFramesFilesOutcome = {
    kind: 'resolve',
    value: [
      { frameId: 0, result: undefined },
      { frameId: 7, result: null },
    ],
  };
  funcRunOutcome = { kind: 'resolve', value: [{ result: rawResult }] };
  const result7 = await runAudit(7);
  ok('a non-top frame reporting result: null marks the audit partial (current predicate)', result7.partial === true);

  // --- 8) a frame reports result: undefined -> now ALSO marks partial.
  // plan 016 landed: the live probe never reproduced undefined as a failure
  // shape (successful frames returned `true`, the file's completion value),
  // but a `files:` injection's completion value is inherently shape-
  // dependent, so a future axe.js bundle could complete `undefined` on
  // success too. The predicate now treats undefined on a non-top frame as a
  // failure signal anyway: overstating audit coverage is worse than an
  // occasional false "partial".
  reset();
  tabUrlQueue = ['https://example.com'];
  allFramesFilesOutcome = {
    kind: 'resolve',
    value: [
      { frameId: 0, result: undefined },
      { frameId: 7, result: undefined },
    ],
  };
  funcRunOutcome = { kind: 'resolve', value: [{ result: rawResult }] };
  const result8 = await runAudit(8);
  ok('a non-top frame reporting result: undefined now also marks the audit partial (plan 016)', result8.partial === true);

  // --- 8b) a frame reports an `error` property (not present in the
  // installed @types/chrome for chrome.scripting.InjectionResult, and never
  // observed live in Chrome 148 for this API — but checked as defense in
  // depth via a structural cast in case a future Chrome version adds it).
  reset();
  tabUrlQueue = ['https://example.com'];
  allFramesFilesOutcome = {
    kind: 'resolve',
    value: [
      { frameId: 0, result: undefined },
      { frameId: 7, error: 'Frame was detached before injection completed.' },
    ],
  };
  funcRunOutcome = { kind: 'resolve', value: [{ result: rawResult }] };
  const result8b = await runAudit(13);
  ok('a non-top frame reporting an error property marks the audit partial (plan 016)', result8b.partial === true);

  // --- 8c) the single-frame happy path (top frame only, result: undefined)
  // must stay partial: false — frameId 0 is exempt from the per-frame check
  // exactly as before plan 016.
  reset();
  tabUrlQueue = ['https://example.com'];
  allFramesFilesOutcome = { kind: 'resolve', value: [{ frameId: 0, result: undefined }] };
  funcRunOutcome = { kind: 'resolve', value: [{ result: rawResult }] };
  const result8c = await runAudit(14);
  ok('a single top-frame result: undefined is still NOT flagged partial (top frame exempt)', result8c.partial === false);

  // --- 9) both injections fail with generic (unclassifiable) errors ---
  reset();
  tabUrlQueue = ['https://example.com'];
  allFramesFilesOutcome = { kind: 'reject', error: new Error('Frame with ID 42 was removed.') };
  topFrameFilesOutcome = { kind: 'reject', error: new Error('Something else broke entirely.') };
  let err9: Error | undefined;
  try {
    await runAudit(9);
  } catch (e) {
    err9 = e as Error;
  }
  ok("both injections failing with generic errors reports the couldn't-load message", !!err9 && /couldn't load on this page/.test(err9.message));

  // --- 10) the func-run never settles; the 45s audit timeout fires ---
  reset();
  tabUrlQueue = ['https://example.com'];
  allFramesFilesOutcome = { kind: 'resolve', value: [{ frameId: 0, result: undefined }] };
  funcRunOutcome = { kind: 'never' };
  const realSetTimeout = globalThis.setTimeout;
  let err10: Error | undefined;
  try {
    (globalThis as unknown as { setTimeout: typeof setTimeout }).setTimeout = ((
      fn: (...args: unknown[]) => void,
      delay?: number,
      ...args: unknown[]
    ) => {
      // Fire timers >= the audit timeout immediately; let shorter ones (if any)
      // run on the real clock so we isolate exactly the 45s watchdog.
      const effectiveDelay = (delay ?? 0) >= 45_000 ? 0 : delay;
      return realSetTimeout(fn as (...a: unknown[]) => void, effectiveDelay, ...args);
    }) as typeof setTimeout;
    await runAudit(10);
  } catch (e) {
    err10 = e as Error;
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  ok('a runner that never resolves rejects with the too-large-to-scan timeout message', !!err10 && /too large to finish scanning/.test(err10.message));

  // --- 11) empty url is re-read after a successful injection ---
  reset();
  tabUrlQueue = ['', 'https://example.com/re-read'];
  allFramesFilesOutcome = { kind: 'resolve', value: [{ frameId: 0, result: undefined }] };
  funcRunOutcome = { kind: 'resolve', value: [{ result: rawResult }] };
  const result11 = await runAudit(11);
  ok('an empty initial url is re-read once injection succeeds', result11.url === 'https://example.com/re-read');

  // --- 12) the runner returns no result at all -> the empty-result fallback ---
  reset();
  tabUrlQueue = ['https://example.com'];
  allFramesFilesOutcome = { kind: 'resolve', value: [{ frameId: 0, result: undefined }] };
  funcRunOutcome = { kind: 'resolve', value: [{ result: undefined }] };
  const result12 = await runAudit(12);
  ok('a missing runner result resolves with the empty fallback rather than throwing', result12.issues.length === 0 && result12.totalChecks === 0);

  let pass = 0;
  for (const [name, cond] of checks) {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
    if (cond) pass++;
  }
  console.log(`\n${pass}/${checks.length} checks passed`);
  process.exit(pass === checks.length ? 0 : 1);
}

void main();
