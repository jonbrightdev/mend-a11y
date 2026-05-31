import { useState } from 'preact/hooks';
import type { NormalizedIssue } from '../../lib/types';
import { DOCS } from '../../docs';
import { SeverityBadge, WcagBadge } from '../components/Severity';
import {
  ArrowLeft,
  TargetIcon,
  CopyIcon,
  ChevronLeft,
  ChevronRight,
  ExternalIcon,
  EyeOffIcon,
  CheckIcon,
} from '../components/Icon';
import { useAutoFocus } from '../hooks/a11y';

function CopyButton({ text, onCopied }: { text: string; onCopied: () => void }) {
  const [done, setDone] = useState(false);
  return (
    <button
      class="icon-btn"
      aria-label="Copy to clipboard"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          onCopied();
          window.setTimeout(() => setDone(false), 1200);
        });
      }}
    >
      {done ? <CheckIcon size={15} /> : <CopyIcon />}
    </button>
  );
}

const WCAG_SPEC_BASE = 'https://www.w3.org/WAI/WCAG21/quickref/#';

export function IssueDetailScreen({
  issue,
  position,
  total,
  onBack,
  onHighlight,
  onClearHighlight,
  onSuppress,
  onPrev,
  onNext,
  onToast,
}: {
  issue: NormalizedIssue;
  position: number;
  total: number;
  onBack: () => void;
  onHighlight: (selector: string) => void;
  onClearHighlight: () => void;
  onSuppress: (id: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onToast: (msg: string) => void;
}) {
  const backRef = useAutoFocus<HTMLButtonElement>();
  const entry = DOCS[issue.ruleId];

  return (
    <div class="shell">
      <div class="scroll">
        <div class="detail-head">
          <button class="btn small" ref={backRef} onClick={onBack}>
            <ArrowLeft size={14} />
            Back
          </button>
          <div class="detail-badges">
            <SeverityBadge impact={issue.impact} />
            <span class="wcag-badge">{issue.ruleId}</span>
            <WcagBadge criteria={issue.wcag} />
          </div>
          <h2 class="detail-title">{issue.title}</h2>
          <div class="detail-actions">
            <button class="btn primary small" onClick={() => onHighlight(issue.selector)}>
              <TargetIcon size={14} />
              Highlight on page
            </button>
            <button class="btn small" onClick={onClearHighlight}>
              Clear
            </button>
          </div>
        </div>

        {/* Fix first. */}
        {entry ? (
          <div class="section">
            <h3>The fix</h3>
            <p>{entry.summary}</p>
            {entry.examples.map((ex, idx) => (
              <div key={idx}>
                {ex.label && <div class="ex-label">{ex.label}</div>}
                <div class="code-wrap">
                  <div class="code-label before">Before</div>
                  <div class="copy-row">
                    <pre class="code">{ex.before}</pre>
                    <CopyButton text={ex.before} onCopied={() => onToast('Copied')} />
                  </div>
                </div>
                <div class="code-wrap">
                  <div class="code-label after">After</div>
                  <div class="copy-row">
                    <pre class="code">{ex.after}</pre>
                    <CopyButton text={ex.after} onCopied={() => onToast('Copied')} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div class="section">
            <h3>What the scanner found</h3>
            <div class="engine-note">We haven't written a guide for this rule yet. The scanner said:</div>
            <p>{issue.failureSummary || issue.description}</p>
          </div>
        )}

        {/* Why it failed. */}
        {entry && (
          <div class="section">
            <h3>Why it failed</h3>
            <p>{entry.explanation}</p>
          </div>
        )}

        {/* Where. */}
        <div class="section">
          <h3>Where</h3>
          <div class="code-label">Selector</div>
          <div class="copy-row">
            <pre class="code">{issue.selector}</pre>
            <CopyButton text={issue.selector} onCopied={() => onToast('Copied selector')} />
          </div>
          <div class="code-label" style={{ marginTop: '8px' }}>
            Element
          </div>
          <div class="copy-row">
            <pre class="code">{issue.html}</pre>
            <CopyButton text={issue.html} onCopied={() => onToast('Copied HTML')} />
          </div>
        </div>

        {/* One spec link, tucked away. */}
        <div class="section">
          <a
            class="spec-link"
            href={issue.helpUrl || `${WCAG_SPEC_BASE}${issue.ruleId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalIcon />
            Read the formal spec
          </a>
        </div>
      </div>

      <div class="detail-foot">
        <button
          class="icon-btn"
          aria-label="Suppress this issue"
          onClick={() => {
            onSuppress(issue.id);
            onToast('Issue suppressed');
          }}
        >
          <EyeOffIcon />
        </button>
        <span class="spacer" />
        <button class="icon-btn" aria-label="Previous issue" disabled={position <= 1} onClick={onPrev}>
          <ChevronLeft />
        </button>
        <span style={{ fontSize: '12px', color: 'var(--ap-fg-subtle)', minWidth: '52px', textAlign: 'center' }}>
          {position} / {total}
        </span>
        <button
          class="icon-btn"
          aria-label="Next issue"
          disabled={position >= total}
          onClick={onNext}
        >
          <ChevronRight />
        </button>
      </div>
    </div>
  );
}
