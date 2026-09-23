import type { AuditResult, NormalizedIssue, Settings } from './types';

// Client for the optional Harpoon dashboard. Nothing is
// ever sent unless the user has connected an account (portal URL + API key in
// settings); with a key present, audits upload automatically after each run
// unless the auto-save setting is off, in which case the Save button sends
// them. The payload shape here is the contract the portal's /api/ingest
// endpoint validates.

/**
 * One affected element. Everything that describes the *rule* rather than the
 * element lives in `IngestRule` and is sent once — see CONTRACT_VERSION 2 in
 * test/contract/README.md.
 */
export interface IngestIssue {
  ruleId: string;
  selector: string;
  html: string;
  failureSummary?: string;
  domOrder: number;
}

/** The per-rule half of an issue, sent once per distinct `ruleId`. */
export interface IngestRule {
  impact: string;
  category: string;
  wcag: string[];
  title: string;
  description: string;
  helpUrl?: string;
}

export interface IngestPayload {
  url: string;
  pageTitle: string;
  startedAt: number;
  durationMs: number;
  totalChecks: number;
  partial: boolean;
  rules: Record<string, IngestRule>;
  issues: IngestIssue[];
}

export interface SyncOutcome {
  /** True when the portal had already stored this exact audit. */
  duplicate: boolean;
  /** How many issues were actually uploaded. */
  sent: number;
  /** How many the audit found. Greater than `sent` when the run was trimmed. */
  found: number;
}

/**
 * The portal's own ceilings, mirrored so a page that exceeds them is trimmed
 * here rather than refused there. Kept slightly under the server's 2,000,000
 * so a payload built to fit can't lose a race with a header or a re-encode.
 *
 * These are a *contract* copy, not a guess: if the portal raises them, these
 * move in the same commit that bumps CONTRACT_VERSION.
 */
export const MAX_SYNC_ISSUES = 1000;
export const MAX_BODY_CHARS = 1_900_000;

/**
 * Never trim below this, however big the individual issues are. A run this
 * small that still won't fit is pathological (one enormous selector or
 * snippet), and sending 25 issues the user can act on beats sending none.
 */
const MIN_SYNC_ISSUES = 25;

const IMPACT_RANK: Record<string, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

/**
 * Upload failure with the portal's own words plus enough structure for the UI
 * to decide whether a retry can help. `AUDIT_CAP` (the plan's saved-audit
 * limit) is the one refusal that retrying can never fix — the run stays
 * well-formed and keeps being refused until the user frees space or upgrades.
 */
export class SyncError extends Error {
  /** Machine code from the portal, e.g. 'AUDIT_CAP'; undefined when it sent none. */
  readonly code?: string;
  /** True when sending the same audit again could succeed (network, 429, 500). */
  readonly retryable: boolean;

  constructor(message: string, opts: { code?: string; retryable: boolean }) {
    super(message);
    this.name = 'SyncError';
    this.code = opts.code;
    this.retryable = opts.retryable;
  }
}

/** Sync is on only when the user has provided both a portal URL and a key. */
export function syncConfigured(settings: Settings): boolean {
  return settings.dashboardUrl.trim() !== '' && settings.dashboardApiKey.trim() !== '';
}

/** Portal origin with any trailing slashes dropped, or null if not http(s). */
export function normalizeDashboardUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/\S+$/i.test(trimmed)) return null;
  return trimmed;
}

/**
 * Builds the upload body, trimming until it is one the portal will accept.
 *
 * Two things make a big page fit. The rules map removes the duplication —
 * a page with 1,224 issues over ~10 rules used to repeat each rule's title,
 * description, helpUrl, category and WCAG list on every single issue, which
 * on dailymail.com's homepage was 478 KB of a 1.27 MB body. What is left is
 * then trimmed by count, worst-first, so an enormous page uploads its most
 * severe findings instead of being refused whole.
 *
 * The result is that this function cannot produce a payload the portal
 * refuses for size — which is the property the previous version lacked, and
 * why a real page could dead-end on "Payload too large" with nothing the user
 * could do about it.
 */
export function buildIngestPayload(result: AuditResult, pageTitle: string): IngestPayload {
  // Worst first, so every trim below drops the least severe issues. The audit
  // pipeline already sorts this way; re-sorting here keeps the guarantee a
  // property of the upload rather than of whoever last touched sortIssues.
  const ranked = [...result.issues].sort(
    (a, b) =>
      (IMPACT_RANK[a.impact] ?? 99) - (IMPACT_RANK[b.impact] ?? 99) || a.domOrder - b.domOrder,
  );

  let keep = Math.min(ranked.length, MAX_SYNC_ISSUES);
  let payload = assemble(result, pageTitle, ranked, keep);

  // Shrink until it fits. Geometric, so a pathologically heavy page converges
  // in a handful of passes rather than one issue at a time.
  while (JSON.stringify(payload).length > MAX_BODY_CHARS && keep > MIN_SYNC_ISSUES) {
    keep = Math.max(MIN_SYNC_ISSUES, Math.floor(keep * 0.8));
    payload = assemble(result, pageTitle, ranked, keep);
  }

  return payload;
}

function assemble(
  result: AuditResult,
  pageTitle: string,
  ranked: NormalizedIssue[],
  keep: number,
): IngestPayload {
  const kept = ranked.slice(0, keep);

  // Only the rules still represented — a map covering trimmed-away issues
  // would put back some of the weight the trim just removed.
  const rules: Record<string, IngestRule> = {};
  for (const issue of kept) {
    if (rules[issue.ruleId]) continue;
    rules[issue.ruleId] = {
      impact: issue.impact,
      category: issue.category,
      wcag: issue.wcag,
      title: issue.title,
      description: issue.description,
      helpUrl: issue.helpUrl,
    };
  }

  return {
    url: result.url,
    pageTitle,
    startedAt: result.startedAt,
    durationMs: result.durationMs,
    totalChecks: result.totalChecks,
    // Trimming is incomplete coverage in exactly the sense this flag already
    // means, so the dashboard needs no second concept for it.
    partial: result.partial || kept.length < ranked.length,
    rules,
    issues: kept.map(toIngestIssue),
  };
}

function toIngestIssue(issue: NormalizedIssue): IngestIssue {
  return {
    ruleId: issue.ruleId,
    selector: issue.selector,
    html: issue.html,
    failureSummary: issue.failureSummary,
    domOrder: issue.domOrder,
  };
}

/**
 * What to show when the portal refused but sent no readable `error` — a proxy
 * or gateway in front of it, most often. The portal's own wording wins
 * whenever it sends any, since the contract keeps it panel-ready.
 *
 * 413 and 400 get real sentences rather than a bare status because they are
 * the two the user can act on, and because a naked "HTTP 413" is exactly the
 * dead end this whole change exists to remove.
 */
function fallbackMessage(status: number): string {
  if (status === 413) {
    return 'This page produced more data than the dashboard accepts in one upload. Update Mend to the latest version, which trims very large pages before sending.';
  }
  if (status === 400) {
    return "The dashboard couldn't read this audit. Update Mend to the latest version — this usually means the extension and the dashboard disagree about the payload format.";
  }
  return `The dashboard returned an error (HTTP ${status}).`;
}

/**
 * POST the audit to the portal. Resolves with the outcome, or throws a
 * SyncError whose message is safe to show in the panel as-is.
 */
export async function uploadAudit(
  settings: Settings,
  result: AuditResult,
  pageTitle: string,
): Promise<SyncOutcome> {
  const base = normalizeDashboardUrl(settings.dashboardUrl);
  if (!base) {
    throw new SyncError(
      'The dashboard URL in settings must start with https:// (or http:// for local testing).',
      { retryable: false },
    );
  }
  const key = settings.dashboardApiKey.trim();
  const payload = buildIngestPayload(result, pageTitle);

  let response: Response;
  try {
    response = await fetch(`${base}/api/ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new SyncError(
      "Couldn't reach the dashboard. Check the URL in settings and your connection.",
      { retryable: true },
    );
  }

  if (response.status === 401) {
    throw new SyncError(
      'Harpoon rejected this connection key. Reconnect Mend by Harpoon to the website project.',
      { retryable: false },
    );
  }
  if (!response.ok) {
    let detail = '';
    let code: string | undefined;
    try {
      const body = (await response.json()) as { error?: string; code?: string };
      detail = body.error ?? '';
      code = body.code;
    } catch {
      /* non-JSON error body; fall through to the generic message */
    }
    // Retryable: 429 after Retry-After, and 5xx (a stored earlier attempt makes
    // the retry a 200 duplicate). Not retryable: the plan cap (403 AUDIT_CAP)
    // and client-fix statuses (400/413) — resending the same audit cannot help.
    const retryable = response.status === 429 || response.status >= 500;
    throw new SyncError(detail || fallbackMessage(response.status), { code, retryable });
  }

  const body = (await response.json()) as { duplicate?: boolean; issues?: number };
  return {
    duplicate: body.duplicate === true,
    // The portal reports what it stored, which is authoritative — it applies
    // the same 1000-issue ceiling this side already trimmed to, so the two
    // agree unless one of them is out of date. A duplicate carries no count,
    // and nothing new was stored, so the payload's own figure stands in.
    sent: body.issues ?? payload.issues.length,
    found: result.issues.length,
  };
}
