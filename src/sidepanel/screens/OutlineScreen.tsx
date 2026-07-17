import { useEffect, useState } from 'preact/hooks';
import { Modal } from '../components/Controls';
import { AlertIcon } from '../components/Icon';
import { sendToWorker, type OutlineResponse } from '../../lib/messages';
import type { OutlineData } from '../../lib/outline';

type State =
  | { status: 'loading' }
  | { status: 'ready'; data: OutlineData }
  | { status: 'error'; message: string };

/**
 * In-panel page-structure list, screen-reader-rotor style. Fetches the heading +
 * landmark outline once on open via a GET_OUTLINE round-trip, surfaces a few
 * plain-language advisories from the summary, and lists every heading (indented
 * by level, with skipped levels flagged) and landmark (role + accessible name).
 * Each row calls onLocate(selector) to highlight and scroll to that node.
 */
export function OutlineScreen({
  tabId,
  onClose,
  onLocate,
  closing,
}: {
  tabId: number | null;
  onClose: () => void;
  onLocate: (selector: string) => void;
  closing?: boolean;
}) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    if (tabId == null) {
      setState({ status: 'error', message: 'Open a normal website tab, then try again.' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    void sendToWorker<OutlineResponse>({ type: 'GET_OUTLINE', tabId })
      .then((res) => {
        if (cancelled) return;
        setState(
          res.ok ? { status: 'ready', data: res.data } : { status: 'error', message: res.error },
        );
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: "Mend couldn't read the page structure. Try reloading and again.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tabId]);

  return (
    <Modal title="Page outline" onClose={onClose} closing={closing}>
      {state.status === 'loading' && (
        <div class="outline-loading">
          <span class="outline-spinner" aria-hidden="true" />
          Reading the page structure…
        </div>
      )}
      {state.status === 'error' && (
        <div class="warning-banner" role="alert">
          <AlertIcon />
          <span>{state.message}</span>
        </div>
      )}
      {state.status === 'ready' && <OutlineBody data={state.data} onLocate={onLocate} />}
    </Modal>
  );
}

function advisories(summary: OutlineData['summary']): { tone: 'warn' | 'good'; text: string }[] {
  const notes: { tone: 'warn' | 'good'; text: string }[] = [];
  const { h1Count, hasSkips, mainCount } = summary;

  if (h1Count === 0) {
    notes.push({ tone: 'warn', text: 'No level-1 heading. Start the page with a single h1 that names it.' });
  } else if (h1Count > 1) {
    notes.push({
      tone: 'warn',
      text: `${h1Count} level-1 headings. A page should usually have exactly one h1.`,
    });
  }
  if (hasSkips) {
    notes.push({
      tone: 'warn',
      text: 'Heading levels skip a step. Keep the outline sequential so the structure reads cleanly.',
    });
  }
  if (mainCount === 0) {
    notes.push({ tone: 'warn', text: 'No main landmark. Wrap the primary content in main so it can be skipped to.' });
  } else if (mainCount > 1) {
    notes.push({ tone: 'warn', text: `${mainCount} main landmarks. Use exactly one per page.` });
  }
  if (notes.length === 0) {
    notes.push({
      tone: 'good',
      text: 'Structure looks sound: one h1, no skipped levels, and a single main region.',
    });
  }
  return notes;
}

function OutlineBody({
  data,
  onLocate,
}: {
  data: OutlineData;
  onLocate: (selector: string) => void;
}) {
  const notes = advisories(data.summary);

  return (
    <>
      <div class="outline-notes">
        {notes.map((n, i) => (
          <p key={i} class={`outline-note ${n.tone}`}>
            {n.text}
          </p>
        ))}
      </div>

      <div class="outline-section">
        <span class="field-label">Headings ({data.headings.length})</span>
        {data.headings.length === 0 ? (
          <p class="outline-empty">No headings on this page.</p>
        ) : (
          <div class="outline-list">
            {data.headings.map((h, i) => (
              <button
                key={i}
                class={`outline-row${h.skipped ? ' is-skip' : ''}`}
                style={{ paddingLeft: `${9 + (h.level - 1) * 14}px` }}
                title="Highlight this heading on the page"
                onClick={() => onLocate(h.selector)}
              >
                <span class="outline-level">H{h.level}</span>
                <span class={`outline-text${h.text ? '' : ' muted'}`}>
                  {h.text || '(empty heading)'}
                </span>
                {h.skipped && <span class="outline-skip-tag">skipped level</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div class="outline-section">
        <span class="field-label">Landmarks ({data.landmarks.length})</span>
        {data.landmarks.length === 0 ? (
          <p class="outline-empty">No landmarks on this page.</p>
        ) : (
          <div class="outline-list">
            {data.landmarks.map((l, i) => (
              <button
                key={i}
                class="outline-row"
                title="Highlight this landmark on the page"
                onClick={() => onLocate(l.selector)}
              >
                <span class="outline-role">{l.role}</span>
                <span class={`outline-text${l.name ? '' : ' muted'}`}>
                  {l.name || '(no accessible name)'}
                </span>
                <span class="outline-tag">{`<${l.tag}>`}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
