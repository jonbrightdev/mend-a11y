import { CloseIcon, ExternalIcon } from './Icon';

/**
 * Post-audit callout for keyless users: the top of the dashboard-adoption
 * funnel. "Save audit" stages the finished run tab-independently
 * (STAGE_PENDING_SAVE) and opens Harpoon's `/connect`; its AuthGuard preserves
 * that destination through sign-in. Once /connect
 * relays a key, the worker uploads the staged run and the open panel swaps
 * this callout for live sync without a reopen. Dismissal is one-time and
 * global (Settings keeps the evergreen path).
 */
export function AccountPrompt({
  onSave,
  onDismiss,
}: {
  onSave: () => void;
  onDismiss: () => void;
}) {
  return (
    <div class="account-prompt" role="note">
      <div class="account-prompt-text">
        <strong>Keep this audit?</strong> Save it to a free Harpoon website project and track
        fixes over time. Takes about a minute.
      </div>
      <div class="account-prompt-actions">
        <button class="btn small primary" onClick={onSave}>
          Save audit
          <ExternalIcon />
        </button>
        <button class="icon-btn" aria-label="Dismiss" onClick={onDismiss}>
          <CloseIcon size={15} />
        </button>
      </div>
    </div>
  );
}
