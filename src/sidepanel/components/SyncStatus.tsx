import { AlertIcon, CheckIcon, RefreshIcon } from './Icon';

export type SyncPhase = 'uploading' | 'synced' | 'error';

/** One audit's dashboard-upload state, as the panel tracks it per audit key. */
export interface SyncInfo {
  phase: SyncPhase;
  /** True when the portal already had this exact audit stored. */
  duplicate?: boolean;
  /** The portal's message, shown verbatim (the contract keeps it readable). */
  error?: string;
  /** True when sending again could succeed; the chip offers Retry only then. */
  retryable?: boolean;
  /** Issues uploaded, and issues the audit found. Equal unless the page was trimmed. */
  sent?: number;
  found?: number;
}

/**
 * Live status chip for the automatic dashboard upload. Uploading and synced
 * are quiet statements; a retryable failure becomes a button, a permanent one
 * (rejected key, plan cap) stays a labelled notice whose full message the
 * toast has already shown.
 */
export function SyncStatus({ sync, onRetry }: { sync: SyncInfo; onRetry: () => void }) {
  if (sync.phase === 'uploading') {
    return (
      <span class="sync-chip uploading" role="status">
        <span class="sync-dot" aria-hidden="true" />
        Saving to dashboard…
      </span>
    );
  }
  if (sync.phase === 'synced') {
    // A page too big to upload whole is saved trimmed, worst issues first.
    // Saying so here is the difference between a partial save and one the
    // user believes is complete.
    const trimmed =
      sync.sent !== undefined && sync.found !== undefined && sync.sent < sync.found;
    return (
      <span
        class="sync-chip synced"
        role="status"
        title={
          trimmed
            ? `This page produced ${sync.found!.toLocaleString()} issues — too many to upload in one audit. The ${sync.sent!.toLocaleString()} most severe were saved.`
            : undefined
        }
      >
        <CheckIcon size={13} />
        {sync.duplicate
          ? 'Already on dashboard'
          : trimmed
            ? `Saved top ${sync.sent!.toLocaleString()} of ${sync.found!.toLocaleString()}`
            : 'Saved to dashboard'}
      </span>
    );
  }
  if (sync.retryable) {
    return (
      <button class="sync-chip error" onClick={onRetry} title={sync.error}>
        <RefreshIcon size={13} />
        Not saved — retry
      </button>
    );
  }
  return (
    <span class="sync-chip error" role="status" title={sync.error}>
      <AlertIcon size={13} />
      Not saved
    </span>
  );
}
