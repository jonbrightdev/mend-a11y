// Guards the dashboard sync client: URL normalization, the payload mapping the
// portal's /api/ingest validates, and upload outcome handling (created,
// duplicate, rejected key, server error, unreachable host).
// Run with: tsx test/sync.test.ts
import {
  MAX_BODY_CHARS,
  SyncError,
  buildIngestPayload,
  normalizeDashboardUrl,
  syncConfigured,
  uploadAudit,
} from '../src/lib/sync';
import { DEFAULT_SETTINGS } from '../src/lib/storage';
import type { AuditResult, NormalizedIssue, Settings } from '../src/lib/types';

const checks: [string, boolean][] = [];
const ok = (name: string, cond: boolean) => checks.push([name, cond]);

const issue = (over: Partial<NormalizedIssue> = {}): NormalizedIssue => ({
  id: 'abc123',
  ruleId: 'image-alt',
  impact: 'critical',
  category: 'images',
  wcag: ['1.1.1'],
  title: 'Images must have alternate text',
  description: 'Add an alt attribute.',
  documented: true,
  helpUrl: 'https://example.com/help',
  selector: 'img.hero',
  html: '<img class="hero">',
  failureSummary: 'Element has no alt',
  domOrder: 3,
  ...over,
});

const result: AuditResult = {
  url: 'https://site.test/page',
  startedAt: 1_752_000_000_000,
  durationMs: 812,
  issues: [issue(), issue({ id: 'def456', ruleId: 'label', selector: 'input#q', domOrder: 1 })],
  totalChecks: 950,
  partial: false,
};

const settings = (over: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  dashboardUrl: 'https://portal.test',
  dashboardApiKey: 'mend_key',
  ...over,
});

// Swap in a scripted fetch; each call shifts the next response (or throw).
type Scripted = { status: number; body?: unknown } | 'network-error';
let fetchCalls: { url: string; init: RequestInit }[] = [];
function scriptFetch(...responses: Scripted[]): void {
  fetchCalls = [];
  const queue = [...responses];
  (globalThis as { fetch: unknown }).fetch = async (url: string, init: RequestInit) => {
    fetchCalls.push({ url, init });
    const next = queue.shift();
    if (!next || next === 'network-error') throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status });
  };
}

async function rejects(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function rejectsWith(p: Promise<unknown>): Promise<SyncError | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof SyncError ? e : null;
  }
}

async function main(): Promise<void> {
  // --- configuration gate ---
  ok('defaults leave sync off', !syncConfigured(DEFAULT_SETTINGS));
  ok('url + key turn sync on', syncConfigured(settings()));
  ok('key alone is not enough', !syncConfigured(settings({ dashboardUrl: '  ' })));
  ok('auto-save defaults on', DEFAULT_SETTINGS.autoSync === true);
  ok('prompt dismissal does not affect the sync gate',
    syncConfigured(settings({ accountPromptDismissed: true })));

  // --- URL normalization ---
  ok('trailing slashes drop', normalizeDashboardUrl('https://a.test///') === 'https://a.test');
  ok('surrounding space drops', normalizeDashboardUrl('  http://localhost:3000 ') === 'http://localhost:3000');
  ok('non-http scheme rejected', normalizeDashboardUrl('ftp://a.test') === null);
  ok('bare host rejected', normalizeDashboardUrl('portal.test') === null);

  // --- payload mapping ---
  const payload = buildIngestPayload(result, 'My Page');
  ok('payload carries audit metadata',
    payload.url === result.url &&
      payload.startedAt === result.startedAt &&
      payload.durationMs === 812 &&
      payload.totalChecks === 950 &&
      payload.partial === false &&
      payload.pageTitle === 'My Page');
  ok('payload keeps one entry per element', payload.issues.length === 2);
  // Worst-first, then by document position; both issues here are critical, so
  // the domOrder-1 one leads. This order is what every trim below relies on.
  const first = payload.issues.find((i) => i.ruleId === 'image-alt')!;
  ok('per-element fields map through',
    first.ruleId === 'image-alt' &&
      first.selector === 'img.hero' &&
      first.html === '<img class="hero">' &&
      first.failureSummary === 'Element has no alt' &&
      first.domOrder === 3);
  // Contract v2: these six describe the rule, not the element, and are sent
  // once each. Repeating them per issue is what made a large page unsendable.
  ok('per-rule fields move to the rules map',
    payload.rules['image-alt']?.impact === 'critical' &&
      payload.rules['image-alt']?.category === 'images' &&
      payload.rules['image-alt']?.wcag.join(',') === '1.1.1' &&
      payload.rules['image-alt']?.title === 'Images must have alternate text' &&
      payload.rules['image-alt']?.description === 'Add an alt attribute.' &&
      payload.rules['image-alt']?.helpUrl === 'https://example.com/help');
  ok('per-rule fields are not repeated on the issue',
    !('impact' in first) && !('title' in first) && !('description' in first) &&
      !('category' in first) && !('wcag' in first) && !('helpUrl' in first));
  ok('one rules entry per distinct ruleId', Object.keys(payload.rules).sort().join(',') === 'image-alt,label');
  ok('panel-only fields are not sent',
    !('id' in first) && !('documented' in first) && !('frameUrl' in first));

  // --- large-page trimming ---
  // The failure this whole path exists for: dailymail.com's homepage produces
  // 1,224 issues, which the flat v1 payload encoded as 1.27 MB and the portal
  // refused with a bare "Payload too large".
  const many: AuditResult = {
    ...result,
    issues: [
      ...Array.from({ length: 1_400 }, (_, i) =>
        issue({ id: `m${i}`, ruleId: 'region', impact: 'minor', domOrder: i }),
      ),
      issue({ id: 'crit', ruleId: 'color-contrast', impact: 'critical', domOrder: 9_999 }),
    ],
  };
  const trimmed = buildIngestPayload(many, 'Huge Page');
  ok('trims to the portal ceiling rather than sending a doomed body',
    trimmed.issues.length === 1_000);
  ok('a trimmed run is flagged partial', trimmed.partial === true);
  ok('trimming keeps the most severe issue', trimmed.issues[0]?.ruleId === 'color-contrast');
  ok('the trimmed body fits what the portal accepts',
    JSON.stringify(trimmed).length <= MAX_BODY_CHARS);
  ok('rules map covers only the surviving issues',
    Object.keys(trimmed.rules).sort().join(',') === 'color-contrast,region');

  // A page whose individual issues are enormous can exceed the byte cap well
  // under 1,000 issues; count alone is not enough to guarantee a body fits.
  const heavy: AuditResult = {
    ...result,
    issues: Array.from({ length: 900 }, (_, i) =>
      issue({ id: `h${i}`, ruleId: `rule-${i}`, domOrder: i, selector: 'x'.repeat(2_000), html: 'y'.repeat(5_000) }),
    ),
  };
  const shrunk = buildIngestPayload(heavy, 'Heavy Page');
  ok('shrinks a heavy page by bytes, not just by count',
    JSON.stringify(shrunk).length <= MAX_BODY_CHARS && shrunk.issues.length < 900);
  ok('a byte-trimmed run is flagged partial', shrunk.partial === true);

  ok('an under-cap run is not flagged partial', payload.partial === false);

  // --- upload outcomes ---
  scriptFetch({ status: 201, body: { auditId: 'x', violations: 2 } });
  const created = await uploadAudit(settings(), result, 'My Page');
  ok('201 resolves as not duplicate', created.duplicate === false);
  ok('posts to /api/ingest on the portal', fetchCalls[0]?.url === 'https://portal.test/api/ingest');
  const headers = fetchCalls[0]?.init.headers as Record<string, string>;
  ok('sends the bearer key', headers.authorization === 'Bearer mend_key');
  ok('body is the ingest payload',
    (JSON.parse(fetchCalls[0]?.init.body as string) as { url: string }).url === result.url);

  scriptFetch({ status: 200, body: { duplicate: true } });
  const dup = await uploadAudit(settings(), result, 'My Page');
  ok('200 duplicate resolves as duplicate', dup.duplicate === true);

  scriptFetch({ status: 401, body: { error: 'Unauthorized' } });
  const unauth = await rejectsWith(uploadAudit(settings(), result, 'My Page'));
  ok('401 explains the connection key was rejected', unauth != null && /connection key/.test(unauth.message));
  ok('401 is not retryable', unauth != null && !unauth.retryable);

  scriptFetch({ status: 400, body: { error: 'url must be an http(s) URL' } });
  const badReq = await rejectsWith(uploadAudit(settings(), result, 'My Page'));
  ok('400 surfaces the server message', badReq?.message === 'url must be an http(s) URL');
  ok('400 is not retryable', badReq != null && !badReq.retryable);

  // The plan's saved-audit cap: message verbatim, code surfaced, never retried.
  scriptFetch({ status: 403, body: { error: 'Saved-audit limit reached. Free up space or upgrade.', code: 'AUDIT_CAP' } });
  const capped = await rejectsWith(uploadAudit(settings(), result, 'My Page'));
  ok('403 keeps the cap message verbatim',
    capped?.message === 'Saved-audit limit reached. Free up space or upgrade.');
  ok('403 carries the AUDIT_CAP code', capped?.code === 'AUDIT_CAP');
  ok('403 cap is not retryable', capped != null && !capped.retryable);

  scriptFetch({ status: 429, body: { error: 'Too many requests. Try again in a minute.' } });
  const limited = await rejectsWith(uploadAudit(settings(), result, 'My Page'));
  ok('429 surfaces the server message', limited?.message === 'Too many requests. Try again in a minute.');
  ok('429 is retryable', limited?.retryable === true);

  scriptFetch({ status: 500 });
  const server = await rejectsWith(uploadAudit(settings(), result, 'My Page'));
  ok('500 falls back to a generic message', server != null && /HTTP 500/.test(server.message));
  ok('500 is retryable', server?.retryable === true);

  scriptFetch('network-error');
  const offline = await rejectsWith(uploadAudit(settings(), result, 'My Page'));
  ok('network failure reads as unreachable', offline != null && /reach the dashboard/.test(offline.message));
  ok('network failure is retryable', offline?.retryable === true);

  const badUrl = await rejects(uploadAudit(settings({ dashboardUrl: 'portal.test' }), result, 'T'));
  ok('invalid URL fails before any request', badUrl != null && /https:\/\//.test(badUrl));

  let pass = 0;
  for (const [name, cond] of checks) {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
    if (cond) pass++;
  }
  console.log(`\n${pass}/${checks.length} checks passed`);
  process.exit(pass === checks.length ? 0 : 1);
}

void main();
