import type { Impact } from '../../lib/types';

const LABEL: Record<Impact, string> = {
  critical: 'Critical',
  serious: 'Serious',
  moderate: 'Moderate',
  minor: 'Minor',
};

/**
 * Non-color shape mark so severity survives monochrome / color blindness.
 * critical = octagon, serious = triangle, moderate = diamond, minor = circle.
 */
export function SevMark({ impact, size = 11 }: { impact: Impact; size?: number }) {
  const s = size;
  const c = s / 2;
  if (impact === 'critical') {
    // octagon
    const k = s * 0.29;
    const pts = [
      [k, 0],
      [s - k, 0],
      [s, k],
      [s, s - k],
      [s - k, s],
      [k, s],
      [0, s - k],
      [0, k],
    ]
      .map((p) => p.join(','))
      .join(' ');
    return (
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true" class="sev-mark">
        <polygon points={pts} fill="currentColor" />
      </svg>
    );
  }
  if (impact === 'serious') {
    // triangle
    return (
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true" class="sev-mark">
        <polygon points={`${c},0 ${s},${s} 0,${s}`} fill="currentColor" />
      </svg>
    );
  }
  if (impact === 'moderate') {
    // diamond
    return (
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true" class="sev-mark">
        <polygon points={`${c},0 ${s},${c} ${c},${s} 0,${c}`} fill="currentColor" />
      </svg>
    );
  }
  // minor = circle
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true" class="sev-mark">
      <circle cx={c} cy={c} r={c} fill="currentColor" />
    </svg>
  );
}

export function SeverityBadge({ impact }: { impact: Impact }) {
  return (
    <span class={`sev-badge ${impact}`}>
      <SevMark impact={impact} />
      {LABEL[impact]}
    </span>
  );
}

export function WcagBadge({ criteria }: { criteria: string[] }) {
  if (criteria.length === 0) return null;
  return <span class="wcag-badge">WCAG {criteria.join(', ')}</span>;
}

export function severityLabel(impact: Impact): string {
  return LABEL[impact];
}
