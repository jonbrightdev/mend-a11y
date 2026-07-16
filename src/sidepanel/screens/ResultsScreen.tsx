import { useMemo, useState } from 'preact/hooks';
import type { AuditResult, Impact, NormalizedIssue } from '../../lib/types';
import { groupByRule } from '../../lib/normalize';
import { SevMark, severityLabel } from '../components/Severity';
import { RefreshIcon, ChevronRight, CheckIcon, FilterIcon, UploadIcon } from '../components/Icon';

export type SaveState = 'idle' | 'saving' | 'saved';

type SeverityFilter = 'all' | Impact;

const TILE_ORDER: Impact[] = ['critical', 'serious', 'moderate', 'minor'];

function relativeTime(from: number): string {
  const secs = Math.max(1, Math.round((Date.now() - from) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

export function ResultsScreen({
  result,
  onOpenIssue,
  onRerun,
  onOpenFilters,
  onSave,
  saveState = 'idle',
}: {
  result: AuditResult;
  onOpenIssue: (id: string) => void;
  onRerun: () => void;
  onOpenFilters: () => void;
  /** Present only when dashboard sync is configured in settings. */
  onSave?: () => void;
  saveState?: SaveState;
}) {
  const [filter, setFilter] = useState<SeverityFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const counts = useMemo(() => {
    const c: Record<Impact, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    for (const issue of result.issues) c[issue.impact]++;
    return c;
  }, [result]);

  const filtered = useMemo(
    () => (filter === 'all' ? result.issues : result.issues.filter((i) => i.impact === filter)),
    [result, filter],
  );

  const groups = useMemo(() => groupByRule(filtered), [filtered]);
  const ruleCount = groups.length;

  const toggle = (ruleId: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(ruleId)) next.delete(ruleId);
      else next.add(ruleId);
      return next;
    });
  };

  return (
    <div class="shell">
      <div class="results-head">
        <div class="url" title={result.url}>
          {result.url}
        </div>
        <div class="meta">
          audited {relativeTime(result.startedAt)} · {(result.durationMs / 1000).toFixed(1)}s ·{' '}
          {result.totalChecks.toLocaleString()} checks
        </div>
        <div class="head-actions">
          <button class="btn small" onClick={onRerun}>
            <RefreshIcon size={14} />
            Re-run
          </button>
          <button class="btn small" onClick={onOpenFilters}>
            <FilterIcon size={14} />
            Filters
          </button>
          {onSave && (
            <button
              class="btn small"
              onClick={onSave}
              disabled={saveState !== 'idle'}
              aria-label={
                saveState === 'saved' ? 'Saved to your dashboard' : 'Save this audit to your dashboard'
              }
            >
              {saveState === 'saved' ? <CheckIcon size={14} /> : <UploadIcon size={14} />}
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save'}
            </button>
          )}
        </div>
      </div>

      <div class="tiles">
        {TILE_ORDER.map((impact) => {
          const pressed = filter === impact;
          return (
            <button
              key={impact}
              class="tile"
              aria-pressed={pressed}
              onClick={() => setFilter(pressed ? 'all' : impact)}
            >
              <span class={`count`} style={{ color: `var(--ap-sev-${impact}-fg)` }}>
                <SevMark impact={impact} size={12} />
                {counts[impact]}
              </span>
              <span class="tile-label">{severityLabel(impact)}</span>
            </button>
          );
        })}
      </div>

      <div class="chip-row" role="group" aria-label="Filter by severity">
        <button class="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          All ({result.issues.length})
        </button>
        {TILE_ORDER.filter((i) => counts[i] > 0).map((impact) => (
          <button
            key={impact}
            class="chip"
            aria-pressed={filter === impact}
            onClick={() => setFilter(impact)}
          >
            {severityLabel(impact)}
          </button>
        ))}
      </div>

      <div class="list-header">
        {filtered.length} {filtered.length === 1 ? 'issue' : 'issues'} in {ruleCount}{' '}
        {ruleCount === 1 ? 'rule' : 'rules'} · severity, then page order
      </div>

      <ul class="issue-list">
        {groups.map((group) => {
          const multi = group.occurrences.length > 1;
          if (!multi) {
            const issue = group.occurrences[0] as NormalizedIssue;
            return (
              <li key={group.ruleId}>
                <button class={`row ${issue.impact}`} onClick={() => onOpenIssue(issue.id)}>
                  <span class="bar" />
                  <div class="row-main" style={{ paddingLeft: '4px' }}>
                    <div class="row-title">{group.title}</div>
                    <div class="row-sub">{issue.selector}</div>
                  </div>
                  <ChevronRight class="chevron" />
                </button>
              </li>
            );
          }

          const isOpen = expanded.has(group.ruleId);
          const panelId = `grp-${group.ruleId}`;
          return (
            <li key={group.ruleId}>
              <button
                class={`row ${group.impact}`}
                aria-expanded={isOpen}
                aria-controls={panelId}
                aria-label={`${group.title}, ${group.occurrences.length} occurrences, ${severityLabel(
                  group.impact,
                )}. ${isOpen ? 'Collapse' : 'Expand'}`}
                onClick={() => toggle(group.ruleId)}
              >
                <span class="bar" />
                <div class="row-main" style={{ paddingLeft: '4px' }}>
                  <div class="row-title">{group.title}</div>
                  <div class="row-sub">{group.ruleId}</div>
                </div>
                <span class="count-pill">{group.occurrences.length}</span>
                <ChevronRight class={`chevron ${isOpen ? 'open' : ''}`} />
              </button>
              {isOpen && (
                <ul class="children" id={panelId}>
                  {group.occurrences.map((issue) => (
                    <li key={issue.id}>
                      <button
                        class={`child-row ${issue.impact}`}
                        onClick={() => onOpenIssue(issue.id)}
                      >
                        <span class="bar" />
                        <span class="sel" style={{ paddingLeft: '4px' }} title={issue.selector}>
                          {issue.selector}
                        </span>
                        <ChevronRight class="chevron" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
