export type Impact = 'critical' | 'serious' | 'moderate' | 'minor';

export type Category =
  | 'structure'
  | 'contrast'
  | 'forms'
  | 'keyboard'
  | 'images'
  | 'aria'
  | 'other';

export interface NormalizedIssue {
  /** Stable id: hash of ruleId + selector + frameUrl. */
  id: string;
  ruleId: string;
  impact: Impact;
  category: Category;
  /** Sorted, de-duplicated WCAG success criteria, e.g. ['1.1.1', '4.1.2']. */
  wcag: string[];
  title: string;
  /** Our plain-language explanation, or the engine's cleaned summary as a fallback. */
  description: string;
  /** True when description came from our docs corpus rather than the engine. */
  documented: boolean;
  helpUrl?: string;
  /** CSS selector, joined with ' > '. */
  selector: string;
  /** outerHTML, truncated. */
  html: string;
  failureSummary?: string;
  frameUrl?: string;
  /** Page-position index; lower means earlier on the page. */
  domOrder: number;
}

export interface AuditResult {
  url: string;
  startedAt: number;
  durationMs: number;
  issues: NormalizedIssue[];
  /** passes + violations + incomplete + inapplicable. */
  totalChecks: number;
  partial: boolean;
  partialReason?: string;
}

export interface IssueGroup {
  ruleId: string;
  impact: Impact;
  category: Category;
  wcag: string[];
  title: string;
  helpUrl?: string;
  documented: boolean;
  firstDomOrder: number;
  occurrences: NormalizedIssue[];
}

export interface Settings {
  theme: 'auto' | 'light' | 'dark';
  wcagVersion: '2.0' | '2.1' | '2.2';
  conformanceLevel: 'A' | 'AA' | 'AAA';
  thoroughness: 'quick' | 'standard' | 'deep';
  experimentalRules: boolean;
  highlightStyle: 'outline' | 'overlay';
  /** Portal origin for the optional dashboard, e.g. https://mend.example. Empty = sync off. */
  dashboardUrl: string;
  /** API key from the portal's account page. Empty = sync off. */
  dashboardApiKey: string;
}

export interface DocsExample {
  label?: string;
  before: string;
  after: string;
}

export interface DocsEntry {
  /** One or two sentence, fix-oriented opening. */
  summary: string;
  /** Two or three short paragraphs of plain-language why. */
  explanation: string;
  examples: DocsExample[];
  references?: { label: string; url: string }[];
}
