import type { AuditResult } from '../../lib/types';
import { CheckIcon, RefreshIcon, ShieldIcon, UploadIcon } from '../components/Icon';
import { Pip } from '../components/Pip';
import type { SaveState } from './ResultsScreen';

const PASSED_AREAS = [
  'Structure',
  'Contrast',
  'Forms',
  'Keyboard',
  'Images',
  'Names & roles',
];

export function PassScreen({
  result,
  onRerun,
  onSave,
  saveState = 'idle',
}: {
  result: AuditResult;
  onRerun: () => void;
  /** Present only when dashboard sync is configured; a clean pass is worth recording too. */
  onSave?: () => void;
  saveState?: SaveState;
}) {
  return (
    <div class="center-stage">
      <Pip variant="pass" class="pip--pass" />
      <span class="stamp">PASSED</span>
      <p class="lede">
        No automated WCAG issues found across {result.totalChecks.toLocaleString()} checks. A clean
        automated pass is a great sign; remember some criteria still need a human eye.
      </p>
      <div class="pass-pills">
        {PASSED_AREAS.map((a) => (
          <span class="pass-pill" key={a}>
            {a}
          </span>
        ))}
      </div>
      <button class="btn block" onClick={onRerun} style={{ maxWidth: '200px' }}>
        <RefreshIcon />
        Re-run
      </button>
      {onSave && (
        <button
          class="btn block"
          onClick={onSave}
          disabled={saveState !== 'idle'}
          style={{ maxWidth: '200px' }}
          aria-label={
            saveState === 'saved' ? 'Saved to your dashboard' : 'Save this audit to your dashboard'
          }
        >
          {saveState === 'saved' ? <CheckIcon /> : <UploadIcon />}
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save to dashboard'}
        </button>
      )}
      <span class="reassure">
        <ShieldIcon />
        {onSave ? 'Sent only when you press Save' : 'Nothing left your machine'}
      </span>
    </div>
  );
}
