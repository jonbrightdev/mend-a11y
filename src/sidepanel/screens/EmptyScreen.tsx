import { PlayIcon, AlertIcon, ShieldIcon } from '../components/Icon';

export function EmptyScreen({
  error,
  host,
  onRun,
}: {
  error: string | null;
  host?: string | null;
  onRun: () => void;
}) {
  return (
    <div class="center-stage">
      {error && (
        <div class="warning-banner" role="alert">
          <AlertIcon />
          <span>{error}</span>
        </div>
      )}
      <h1 class="hero-title">Mend</h1>
      <p class="lede">
        {host ? (
          <>
            Ready to audit <strong>{host}</strong> against WCAG 2.1 AA. Mend flags what's broken,
            where it lives, and how to fix it.
          </>
        ) : (
          <>
            Scan the active tab against WCAG 2.1 AA. Mend flags what's broken, where it lives, and
            how to fix it.
          </>
        )}
      </p>
      <button class="btn primary block" onClick={onRun} style={{ maxWidth: '220px' }}>
        <PlayIcon />
        Run audit
      </button>
      <span class="kbd-hint">
        or press <span class="kbd">Ctrl</span>
        <span class="kbd">Shift</span>
        <span class="kbd">A</span>
      </span>
      <span class="reassure">
        <ShieldIcon />
        Nothing leaves your machine
      </span>
    </div>
  );
}
