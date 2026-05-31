import { useEffect, useState } from 'preact/hooks';

const PHASES = [
  'Reading the page',
  'Checking structure & landmarks',
  'Inspecting color & contrast',
  'Testing forms & controls',
  'Reviewing names & roles',
];

const TICK_MS = 280;

/**
 * `done` flips true when the real audit returns. The ticker advances through
 * cosmetic phases on a timer but never reports "done" before the audit has
 * actually finished; when it finishes, remaining phases flush immediately.
 */
export function RunningScreen({ done }: { done: boolean }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (done) return;
    const id = window.setInterval(() => {
      setActive((i) => Math.min(i + 1, PHASES.length - 1));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [done]);

  return (
    <div class="center-stage">
      <h1 class="hero-title">Auditing…</h1>
      <div class="progress-track" style={{ maxWidth: '260px' }}>
        <div class="progress-bar" />
      </div>
      <ul class="phase-list">
        {PHASES.map((label, i) => {
          const state = done || i < active ? 'done' : i === active ? 'active' : '';
          return (
            <li class={`phase-row ${state}`} key={label}>
              <span class="phase-dot" />
              {label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
