import type {
  Category,
  DocsEntry,
  Impact,
  IssueGroup,
  NormalizedIssue,
  Settings,
} from './types';

/** Shape returned by the in-page runner (see audit.ts). JSON-serializable. */
export interface RawNode {
  target: string[];
  html: string;
  failureSummary: string;
  domOrder: number;
}
export interface RawViolation {
  id: string;
  impact: string | null;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: RawNode[];
}
export interface RawRunnerResult {
  violations: RawViolation[];
  counts: { passes: number; violations: number; incomplete: number; inapplicable: number };
}

const IMPACT_ORDER: Record<Impact, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

const RULE_CATEGORY: Record<string, Category> = {
  'color-contrast': 'contrast',
  'link-in-text-block': 'contrast',
  'image-alt': 'images',
  'input-image-alt': 'images',
  'area-alt': 'images',
  'role-img-alt': 'images',
  'svg-img-alt': 'images',
  'object-alt': 'images',
  'image-redundant-alt': 'images',
  label: 'forms',
  'label-title-only': 'forms',
  'select-name': 'forms',
  'form-field-multiple-labels': 'forms',
  'autocomplete-valid': 'forms',
  'link-name': 'keyboard',
  'button-name': 'keyboard',
  'nested-interactive': 'keyboard',
  tabindex: 'keyboard',
  'scrollable-region-focusable': 'keyboard',
  'focus-order-semantics': 'keyboard',
  'heading-order': 'structure',
  'empty-heading': 'structure',
  'page-has-heading-one': 'structure',
  'p-as-heading': 'structure',
  region: 'structure',
  'landmark-one-main': 'structure',
  'landmark-unique': 'structure',
  'landmark-complementary-is-top-level': 'structure',
  list: 'structure',
  listitem: 'structure',
  'definition-list': 'structure',
  dlitem: 'structure',
  'duplicate-id': 'structure',
  'duplicate-id-active': 'structure',
  'duplicate-id-aria': 'structure',
  'document-title': 'structure',
  'html-has-lang': 'structure',
  'html-lang-valid': 'structure',
  'html-xml-lang-mismatch': 'structure',
  'valid-lang': 'structure',
  'meta-viewport': 'structure',
  'meta-viewport-large': 'structure',
  'frame-title': 'structure',
  'frame-title-unique': 'structure',
};

const TAG_CATEGORY: Record<string, Category> = {
  'cat.color': 'contrast',
  'cat.forms': 'forms',
  'cat.keyboard': 'keyboard',
  'cat.text-alternatives': 'images',
  'cat.structure': 'structure',
  'cat.semantics': 'structure',
  'cat.language': 'structure',
  'cat.aria': 'aria',
  'cat.name-role-value': 'aria',
};

function categorize(ruleId: string, tags: string[]): Category {
  const direct = RULE_CATEGORY[ruleId];
  if (direct) return direct;
  if (ruleId.startsWith('aria-')) return 'aria';
  for (const tag of tags) {
    const mapped = TAG_CATEGORY[tag];
    if (mapped) return mapped;
  }
  return 'other';
}

function wcagFromTags(tags: string[]): string[] {
  const set = new Set<string>();
  for (const tag of tags) {
    const m = /^wcag(\d)(\d)(\d+)$/.exec(tag);
    if (m && m[1] && m[2] && m[3]) {
      set.add(`${m[1]}.${m[2]}.${m[3]}`);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function toImpact(value: string | null): Impact {
  if (value === 'critical' || value === 'serious' || value === 'moderate' || value === 'minor') {
    return value;
  }
  return 'minor';
}

/** FNV-1a 32-bit, base36, for stable issue ids. */
function hashId(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Collapse the engine's multi-line failure text into a single readable line. */
function cleanSummary(text: string): string {
  return text
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function normalizeRunnerResult(
  raw: RawRunnerResult,
  docs: Record<string, DocsEntry>,
): NormalizedIssue[] {
  const issues: NormalizedIssue[] = [];
  for (const violation of raw.violations) {
    const impact = toImpact(violation.impact);
    const wcag = wcagFromTags(violation.tags);
    const category = categorize(violation.id, violation.tags);
    const entry = docs[violation.id];
    const documented = Boolean(entry);
    const helpUrl = entry?.references?.[0]?.url ?? (violation.helpUrl || undefined);

    for (const node of violation.nodes) {
      const selector = node.target.join(' > ');
      const description = entry
        ? entry.explanation
        : cleanSummary(node.failureSummary) || 'The scanner flagged this element but did not return a description.';
      issues.push({
        id: hashId(`${violation.id}|${selector}|${node.domOrder}`),
        ruleId: violation.id,
        impact,
        category,
        wcag,
        title: violation.help,
        description,
        documented,
        helpUrl,
        selector,
        html: node.html.slice(0, 500),
        failureSummary: node.failureSummary ? cleanSummary(node.failureSummary) : undefined,
        domOrder: node.domOrder,
      });
    }
  }
  return sortIssues(issues);
}

export function sortIssues(issues: NormalizedIssue[]): NormalizedIssue[] {
  return [...issues].sort((a, b) => {
    const di = IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact];
    if (di !== 0) return di;
    if (a.domOrder !== b.domOrder) return a.domOrder - b.domOrder;
    return a.ruleId.localeCompare(b.ruleId);
  });
}

export function groupByRule(issues: NormalizedIssue[]): IssueGroup[] {
  const map = new Map<string, IssueGroup>();
  for (const issue of issues) {
    const existing = map.get(issue.ruleId);
    if (existing) {
      existing.occurrences.push(issue);
      existing.firstDomOrder = Math.min(existing.firstDomOrder, issue.domOrder);
    } else {
      map.set(issue.ruleId, {
        ruleId: issue.ruleId,
        impact: issue.impact,
        category: issue.category,
        wcag: issue.wcag,
        title: issue.title,
        helpUrl: issue.helpUrl,
        documented: issue.documented,
        firstDomOrder: issue.domOrder,
        occurrences: [issue],
      });
    }
  }
  const groups = [...map.values()];
  for (const group of groups) {
    group.occurrences.sort((a, b) => a.domOrder - b.domOrder);
  }
  groups.sort((a, b) => {
    const di = IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact];
    if (di !== 0) return di;
    if (a.firstDomOrder !== b.firstDomOrder) return a.firstDomOrder - b.firstDomOrder;
    return a.ruleId.localeCompare(b.ruleId);
  });
  return groups;
}

export function axeRunOnlyTags(s: Settings): string[] {
  const tags = new Set<string>();
  tags.add('wcag2a');
  if (s.conformanceLevel === 'AA' || s.conformanceLevel === 'AAA') tags.add('wcag2aa');
  if (s.conformanceLevel === 'AAA') tags.add('wcag2aaa');

  if (s.wcagVersion === '2.1' || s.wcagVersion === '2.2') {
    tags.add('wcag21a');
    if (s.conformanceLevel !== 'A') tags.add('wcag21aa');
  }
  if (s.wcagVersion === '2.2') {
    tags.add('wcag22a');
    if (s.conformanceLevel !== 'A') tags.add('wcag22aa');
  }
  if (s.thoroughness !== 'quick') tags.add('best-practice');
  if (s.thoroughness === 'deep' || s.experimentalRules) tags.add('experimental');
  return [...tags];
}
