import type { AuditResult } from '../../lib/types';
import { RefreshIcon, ShieldIcon } from '../components/Icon';
import { Pip } from '../components/Pip';

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
}: {
  result: AuditResult;
  onRerun: () => void;
}) {
  return (
    <div class="center-stage">
      <Pip class="pip--pass" />
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
      <span class="reassure">
        <ShieldIcon />
        Nothing left your machine
      </span>
    </div>
  );
}
