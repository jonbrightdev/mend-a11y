import type { AuditResult } from '../../lib/types';
import { CheckIcon, DownloadIcon, RefreshIcon, ShieldIcon, UploadIcon } from '../components/Icon';
import { Pip } from '../components/Pip';
import { SyncStatus, type SyncInfo } from '../components/SyncStatus';
import { AccountPrompt } from '../components/AccountPrompt';
import { PartialBanner } from '../components/PartialBanner';
import type { AccountPromptActions, SaveState } from './ResultsScreen';

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
  onExport,
  onSave,
  saveState = 'idle',
  sync,
  onRetrySync,
  prompt,
}: {
  result: AuditResult;
  onRerun: () => void;
  /** Always present -- local JSON export needs no dashboard account. */
  onExport: () => void;
  /** Present only when a key is configured but auto-save is turned off; a clean pass is worth recording too. */
  onSave?: () => void;
  saveState?: SaveState;
  /** Present when auto-save is on: this audit's live upload state. */
  sync?: SyncInfo;
  onRetrySync?: () => void;
  /** Present only when no key is configured and the callout isn't dismissed. */
  prompt?: AccountPromptActions;
}) {
  return (
    <div class="center-stage">
      <Pip variant="pass" class="pip--pass" />
      <span class="stamp">PASSED</span>
      <p class="lede">
        No automated WCAG issues found across {result.totalChecks.toLocaleString()} checks. A clean
        automated pass is a great sign; remember some criteria still need a human eye.
      </p>
      <PartialBanner result={result} />
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
      <button
        class="btn block"
        onClick={onExport}
        style={{ maxWidth: '200px' }}
        aria-label="Export this audit as JSON"
      >
        <DownloadIcon />
        Export JSON
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
      {sync && onRetrySync && <SyncStatus sync={sync} onRetry={onRetrySync} />}
      {prompt && <AccountPrompt onSave={prompt.onSave} onDismiss={prompt.onDismiss} />}
      {(sync || onSave) && (
        <span class="reassure">
          <ShieldIcon />
          {sync ? 'Audits save to your dashboard automatically' : 'Sent only when you press Save'}
        </span>
      )}
    </div>
  );
}
