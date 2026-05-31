import { PlayIcon, AlertIcon, ShieldIcon } from '../components/Icon';
import { Pip } from '../components/Pip';

export function EmptyScreen({
  error,
  host,
  allSites,
  onRun,
  onGrantAndRun,
}: {
  error: string | null;
  host?: string | null;
  allSites: boolean;
  onRun: () => void;
  onGrantAndRun: () => void;
}) {
  return (
    <div class="center-stage">
      {error && (
        <div class="warning-banner" role="alert">
          <AlertIcon />
          <span>{error}</span>
        </div>
      )}
      <Pip class="pip--hero float" />
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
      {!allSites && (
        <button class="link-btn opt-in" onClick={onGrantAndRun}>
          Audit any tab without clicking the icon each time
        </button>
      )}
      <span class="reassure">
        <ShieldIcon />
        Nothing leaves your machine
      </span>
    </div>
  );
}
