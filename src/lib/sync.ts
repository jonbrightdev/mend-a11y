import type { AuditResult, NormalizedIssue, Settings } from './types';

// Client for the optional Mend dashboard (the mend-website portal). Uploads are
// strictly opt-in: nothing is ever sent unless the user has entered a portal
// URL and API key in settings AND clicks Save on a result. The payload shape
// here is the contract the portal's /api/ingest endpoint validates.

/** One flat issue as /api/ingest expects it (one entry per affected element). */
export interface IngestIssue {
  ruleId: string;
  impact: string;
  category: string;
  wcag: string[];
  title: string;
  description: string;
  helpUrl?: string;
  selector: string;
  html: string;
  failureSummary?: string;
  domOrder: number;
}

export interface IngestPayload {
  url: string;
  pageTitle: string;
  startedAt: number;
  durationMs: number;
  totalChecks: number;
  partial: boolean;
  issues: IngestIssue[];
}

export interface SyncOutcome {
  /** True when the portal had already stored this exact audit. */
  duplicate: boolean;
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

export function buildIngestPayload(result: AuditResult, pageTitle: string): IngestPayload {
  return {
    url: result.url,
    pageTitle,
    startedAt: result.startedAt,
    durationMs: result.durationMs,
    totalChecks: result.totalChecks,
    partial: result.partial,
    issues: result.issues.map(toIngestIssue),
  };
}

function toIngestIssue(issue: NormalizedIssue): IngestIssue {
  return {
    ruleId: issue.ruleId,
    impact: issue.impact,
    category: issue.category,
    wcag: issue.wcag,
    title: issue.title,
    description: issue.description,
    helpUrl: issue.helpUrl,
    selector: issue.selector,
    html: issue.html,
    failureSummary: issue.failureSummary,
    domOrder: issue.domOrder,
  };
}

/**
 * POST the audit to the portal. Resolves with the outcome, or throws an Error
 * whose message is safe to show in the panel as-is.
 */
export async function uploadAudit(
  settings: Settings,
  result: AuditResult,
  pageTitle: string,
): Promise<SyncOutcome> {
  const base = normalizeDashboardUrl(settings.dashboardUrl);
  if (!base) {
    throw new Error('The dashboard URL in settings must start with https:// (or http:// for local testing).');
  }
  const key = settings.dashboardApiKey.trim();

  let response: Response;
  try {
    response = await fetch(`${base}/api/ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(buildIngestPayload(result, pageTitle)),
    });
  } catch {
    throw new Error("Couldn't reach the dashboard. Check the URL in settings and your connection.");
  }

  if (response.status === 401) {
    throw new Error('The dashboard rejected the API key. Generate a fresh one on your account page.');
  }
  if (!response.ok) {
    let detail = '';
    try {
      detail = ((await response.json()) as { error?: string }).error ?? '';
    } catch {
      /* non-JSON error body; fall through to the generic message */
    }
    throw new Error(detail || `The dashboard returned an error (HTTP ${response.status}).`);
  }

  const body = (await response.json()) as { duplicate?: boolean };
  return { duplicate: body.duplicate === true };
}
