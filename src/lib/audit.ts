import type { AuditResult } from './types';
import type { RawNode, RawRunnerResult, RawViolation } from './normalize';
import { axeRunOnlyTags, normalizeRunnerResult } from './normalize';
import { DOCS } from '../docs';
import { getSettings, setCachedAudit } from './storage';
import { withTimeout } from './async';

/**
 * Runs in the page's MAIN world after the engine file is injected. Must be
 * fully self-contained: no imports, no closures over module scope, and only
 * JSON-serializable args and return values.
 */
export async function runAxeInPage(args: {
  runOnlyTags: string[];
  frameWaitTime: number;
}): Promise<RawRunnerResult> {
  const empty: RawRunnerResult = {
    violations: [],
    counts: { passes: 0, violations: 0, incomplete: 0, inapplicable: 0 },
  };

  const axe = (window as unknown as { axe?: any }).axe;
  if (!axe || typeof axe.run !== 'function') return empty;

  const result = await axe.run(document, {
    runOnly: { type: 'tag', values: args.runOnlyTags },
    resultTypes: ['violations'],
    // Bound how long the top frame waits on child frames (ad iframes,
    // sandboxed frames) before giving up. The engine default is 60s, which
    // stalls the whole audit on frame-heavy pages.
    frameWaitTime: args.frameWaitTime,
  });

  // Order only the elements that have violations, by document position.
  const elements = new Set<Element>();
  for (const v of result.violations) {
    for (const node of v.nodes) {
      const target = node.target;
      if (Array.isArray(target) && target.length === 1 && typeof target[0] === 'string') {
        try {
          const el = document.querySelector(target[0]);
          if (el) elements.add(el);
        } catch {
          /* invalid selector, skip */
        }
      }
    }
  }
  const ordered = [...elements].sort((a, b) => {
    const cmp = a.compareDocumentPosition(b);
    if (cmp & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (cmp & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
  const orderMap = new Map<Element, number>();
  ordered.forEach((el, i) => orderMap.set(el, i));

  const MAX = Number.MAX_SAFE_INTEGER;
  const violations: RawViolation[] = result.violations.map((v: any): RawViolation => {
    const nodes: RawNode[] = v.nodes.map((node: any): RawNode => {
      const target: string[] = Array.isArray(node.target)
        ? node.target.map((t: unknown) => String(t))
        : [String(node.target)];
      let domOrder = MAX;
      const sel = target.length === 1 ? target[0] : undefined;
      if (sel) {
        try {
          const el = document.querySelector(sel);
          if (el) {
            const idx = orderMap.get(el);
            if (idx !== undefined) domOrder = idx;
          }
        } catch {
          /* ignore */
        }
      }
      return {
        target,
        html: typeof node.html === 'string' ? node.html : '',
        failureSummary: typeof node.failureSummary === 'string' ? node.failureSummary : '',
        domOrder,
      };
    });
    return {
      id: String(v.id),
      impact: v.impact ?? null,
      help: typeof v.help === 'string' ? v.help : String(v.id),
      helpUrl: typeof v.helpUrl === 'string' ? v.helpUrl : '',
      tags: Array.isArray(v.tags) ? v.tags.map((t: unknown) => String(t)) : [],
      nodes,
    };
  });

  return {
    violations,
    counts: {
      passes: Array.isArray(result.passes) ? result.passes.length : 0,
      violations: result.violations.length,
      incomplete: Array.isArray(result.incomplete) ? result.incomplete.length : 0,
      inapplicable: Array.isArray(result.inapplicable) ? result.inapplicable.length : 0,
    },
  };
}

function assertAuditable(url: string): void {
  if (!url) {
    throw new Error("Mend can't read this tab. Open a normal website and try again.");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Mend can't audit this tab. Open a normal website and try again.");
  }
  const blocked = [
    'chrome:',
    'chrome-extension:',
    'edge:',
    'about:',
    'view-source:',
    'devtools:',
    'chrome-search:',
    'moz-extension:',
    'data:',
  ];
  if (blocked.includes(parsed.protocol)) {
    throw new Error(
      'Mend audits normal web pages, not browser or extension pages. Open a website tab and try again.',
    );
  }
  if (parsed.hostname === 'chromewebstore.google.com' || parsed.hostname === 'chrome.google.com') {
    throw new Error(
      "Chrome blocks extensions from running on the Web Store, so Mend can't audit this page. Try another tab.",
    );
  }
}

const AUDIT_TIMEOUT_MS = 45_000;
const FRAME_WAIT_MS = 15_000;

/** True when executeScript was denied host access (the activeTab grant is missing). */
function isPermissionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /cannot access|host permission|activeTab|extension manifest|no tab with id|chrome:\/\//i.test(
    msg,
  );
}

function needsInvocationError(): Error {
  return new Error(
    'Mend needs permission for this tab. Click the Mend icon in your toolbar to grant access to this page, then run the audit again.',
  );
}

export async function runAudit(tabId: number): Promise<AuditResult> {
  const tab = await chrome.tabs.get(tabId);
  const url = tab.url ?? '';
  assertAuditable(url);

  const settings = await getSettings();
  const runOnlyTags = axeRunOnlyTags(settings);
  const startedAt = Date.now();

  // 1) Inject the engine. Try every frame first so cross-frame results are
  // possible. Frame-heavy pages (many ad iframes) can reject the all-frames
  // call even when the top frame is fine, so on failure we fall back to the
  // top frame only and mark coverage partial rather than failing the audit.
  let partial = false;
  try {
    const injected = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: 'MAIN',
      files: ['vendor/axe.min.js'],
    });
    // A frame that errored shows up with a null result.
    if (injected.some((frame) => frame.result === null && frame.frameId !== 0)) {
      partial = true;
    }
  } catch (frameErr) {
    // If access was denied, this is the activeTab grant missing for this tab
    // (e.g. the user opened the panel on one tab then switched). Guide them to
    // re-grant rather than showing a dead-end error.
    if (isPermissionError(frameErr)) throw needsInvocationError();
    console.warn('[mend] all-frames injection failed; retrying top frame only.', frameErr);
    partial = true;
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        files: ['vendor/axe.min.js'],
      });
    } catch (topErr) {
      if (isPermissionError(topErr)) throw needsInvocationError();
      throw new Error("Mend couldn't load on this page. Try reloading the tab and running again.");
    }
  }

  // 2) Run the audit from the top frame, bounded by a timeout. Without this a
  // page with many unreachable frames stalls at the engine's frame-wait
  // ceiling and the panel never leaves the running state.
  const injection = await withTimeout(
    chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: runAxeInPage,
      args: [{ runOnlyTags, frameWaitTime: FRAME_WAIT_MS }],
    }),
    AUDIT_TIMEOUT_MS,
    () =>
      new Error(
        'This page was too large to finish scanning in time. Try setting depth to Quick in settings, or run Mend on a more specific page instead of the homepage.',
      ),
  );

  const raw = (injection[0]?.result as RawRunnerResult | undefined) ?? {
    violations: [],
    counts: { passes: 0, violations: 0, incomplete: 0, inapplicable: 0 },
  };

  const issues = normalizeRunnerResult(raw, DOCS);
  const { passes, violations, incomplete, inapplicable } = raw.counts;
  const totalChecks = passes + violations + incomplete + inapplicable;

  const result: AuditResult = {
    url,
    startedAt,
    durationMs: Date.now() - startedAt,
    issues,
    totalChecks,
    partial,
    partialReason: partial
      ? "Some areas of this page couldn't be checked, so a few issues may be missing."
      : undefined,
  };

  console.info(
    `[mend] audit finished in ${result.durationMs}ms: ${issues.length} issue(s), ${totalChecks} checks, partial=${partial}.`,
  );
  await setCachedAudit(tabId, result);
  return result;
}
