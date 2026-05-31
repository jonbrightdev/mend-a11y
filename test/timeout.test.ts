// Validates the shared withTimeout util and the panel's Promise.race watchdog.
// Run with: tsx test/timeout.test.ts
import { withTimeout } from '../src/lib/async';

const sleep = <T>(ms: number, val?: T) => new Promise<T>((r) => setTimeout(() => r(val as T), ms));
const checks: [string, boolean][] = [];
const ok = (name: string, cond: boolean) => checks.push([name, cond]);

// 1) resolves before timeout -> value passes through
const a = await withTimeout(sleep(20, 'done'), 200, () => new Error('TIMED_OUT'));
ok('resolves before timeout returns value', a === 'done');

// 2) exceeds timeout -> rejects with friendly, engine-agnostic error
let timedOut = false;
let msg = '';
try {
  await withTimeout(sleep(200, 'late'), 30, () => new Error('This page was too large to finish scanning in time.'));
} catch (e) {
  timedOut = true;
  msg = (e as Error).message;
}
ok('exceeding timeout rejects', timedOut);
ok('timeout error is friendly + engine-agnostic', /too large to finish scanning/.test(msg) && !/axe/i.test(msg));

// 3) underlying rejection propagates (timer does not swallow it)
let propagated = false;
try {
  await withTimeout(Promise.reject(new Error('boom')), 200, () => new Error('TIMED_OUT'));
} catch (e) {
  propagated = (e as Error).message === 'boom';
}
ok('underlying rejection propagates', propagated);

// 4) panel watchdog pattern: a stalled worker loses to the watchdog
const watchdog = (workerMs: number, dogMs: number) =>
  Promise.race([
    sleep(workerMs, { ok: true }),
    new Promise((_, rej) => setTimeout(() => rej(new Error("didn't finish in time")), dogMs)),
  ]);

let dogFired = false;
try {
  await watchdog(120, 30);
} catch (e) {
  dogFired = /finish in time/.test((e as Error).message);
}
ok('panel watchdog fires when worker stalls', dogFired);

const winner = (await watchdog(10, 200)) as { ok: boolean };
ok('panel watchdog lets a fast worker through', winner.ok === true);

let pass = 0;
for (const [name, cond] of checks) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (cond) pass++;
}
console.log(`\n${pass}/${checks.length} checks passed`);
process.exit(pass === checks.length ? 0 : 1);
