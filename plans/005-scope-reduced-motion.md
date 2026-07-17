# 005 — Scope reduced motion to movement instead of nuking everything

- **Status**: TODO — **amended 2026-07-17**: the original omitted the `.modal-backdrop` override, leaving it at plan 004's 250ms while the sheet faded in 120ms, so the dim outlasted the sheet by 130ms on close. Both are opacity-only so nothing was broken, but the asymmetry was unintentional. Now overridden to match.
- **Commit**: 834f519
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 file (`src/styles/panel.css`), ~35 lines replaced

## Problem

```css
/* src/styles/panel.css:1243-1258 — current */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
  .progress-bar {
    width: 100%;
    animation: none;
  }
  .chevron {
    transition: none;
  }
}
```

This is the well-known "reduced motion reset", and the author clearly thought about it — `.progress-bar` and `.chevron` are deliberately special-cased, and `highlight.ts:70` branches `scrollIntoView` on the same query. But the blanket `*` selector is too broad: `transition-duration: 0.001ms !important` kills **every** transition, including the ones that carry no movement at all.

Concretely, a reduced-motion user loses:

- the button and icon-button hover fades (`panel.css:163, 200`) — pure `background`/`color`,
- the switch's background change when toggled (`panel.css:965`) — pure `background`/`border-color`,
- the tile's border-color hover (`panel.css:440`).

None of those move anything on screen. Reduced motion means *fewer and gentler* animations, not zero — position and scale changes should go, while transitions that aid comprehension should stay. The current block strips the app's feedback down to hard cuts for exactly the users least served by an unresponsive-feeling UI.

It also leaves the two spinners (`panel.css:404, 1113`) frozen at `0.001ms` with `iteration-count: 1` — a ring with a transparent right edge, stopped mid-rotation. That doesn't read as "loading"; it reads as a rendering bug.

## Target

Replace the whole block. Drop movement explicitly, per element; leave color and opacity alone.

```css
/* target — replaces lines 1243-1258 entirely */
/* ---------- reduced motion ---------- */
@media (prefers-reduced-motion: reduce) {
  /* Movement is dropped element-by-element below. Colour, background and
     opacity transitions are deliberately left at full speed: they carry no
     movement, and removing them costs feedback without reducing motion. */

  /* Pip's idle float is decorative. */
  .float {
    animation: none;
  }

  /* The indeterminate bar's travel becomes a static, filled track. */
  .progress-bar {
    width: 100%;
    animation: none;
  }

  /* Sheets fade in place rather than sliding up from the edge. The backdrop is
     shortened to match: it is opacity-only either way, but at its default 250ms
     it would outlast the sheet and leave the dim hanging over a sheet that has
     already gone. */
  .modal-backdrop {
    animation: fade var(--ap-duration-fast) var(--ap-ease-out);
  }
  .modal-backdrop[data-state='closing'] {
    animation: fade-out var(--ap-duration-fast) var(--ap-ease-out) forwards;
  }
  .modal {
    animation: fade var(--ap-duration-fast) var(--ap-ease-out);
  }
  .modal[data-state='closing'] {
    animation: fade-out var(--ap-duration-fast) var(--ap-ease-out) forwards;
  }

  /* The toast fades without the rise. */
  .toast {
    animation: fade var(--ap-duration-fast) var(--ap-ease-out);
  }

  /* The chevron flips to its open state instead of rotating through it. */
  .chevron {
    transition: none;
  }
}
```

Three judgment calls the executor must not "fix":

1. **The spinners keep spinning** (`.phase-row.active .phase-dot` at line 404, `.outline-spinner` at line 1113). They are small-area rotation, which is not a vestibular trigger the way large-area travel is, and they are the only signal that work is in progress. Freezing them — which is what the current code does — is strictly worse than letting them turn.
2. **`.switch .knob` keeps its slide** (line 980). The knob's travel *is* the affordance communicating on/off, not decoration layered on top of it. It stays at `--ap-duration-base`.
3. **`.btn:active`'s `translateY(1px)`** (line 169) stays. One pixel of press feedback is not motion in any meaningful sense, and removing it makes buttons feel dead.

If any of these seems wrong when you see it, report back — do not silently retune.

## Repo conventions to follow

- The reduced-motion block lives at the bottom of `src/styles/panel.css` under a `/* ---------- reduced motion ---------- */` banner, matching the section-comment style used throughout the file (e.g. `/* ---------- buttons ---------- */` at line 150). Keep the banner.
- Motion tokens come from **plan 001**; `fade-out`, `sheet-in`/`sheet-out` and the `[data-state]` hooks come from **plan 004**; the `toast-in` keyframe comes from **plan 003**. All three must run before this plan. Verify with `grep -n "ap-duration-fast\|fade-out\|toast-in" src/styles/panel.css` — all three must be present. If any is missing, STOP.

## Steps

1. In `src/styles/panel.css`, replace the entire `@media (prefers-reduced-motion: reduce)` block and its section banner (lines 1242-1258) with the Target block above.
2. Confirm no `!important` remains in the file: `grep -n "!important" src/styles/panel.css` should return nothing. (`src/styles/a11y.css:2` has one on `.sr-only`; that file is out of scope and its `!important` is correct.)
3. Confirm the `*` selector is gone from the media query — the new block targets named classes only.

## Boundaries

- Do NOT reintroduce a `*`-based reset in any form.
- Do NOT touch `src/lib/highlight.ts:70-71`. Its `scrollIntoView` reduced-motion branch is already correct and is out of scope.
- Do NOT touch `src/styles/a11y.css`.
- Do NOT add reduced-motion handling to the spinners, the switch knob, or the button press — see the three judgment calls above.
- Do NOT change any animation outside the media query. The default (non-reduced) motion is owned by plans 001–004 and 006.
- Do NOT add dependencies.
- If the code does not match the excerpt above (drift since commit 834f519), STOP and report.

## Verification

- **Mechanical**: `npm run build` succeeds. The two greps in steps 2 and 3 return as described.
- **Feel check**: load the unpacked extension from `dist/`, then turn on DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion: reduce". **With it on**, confirm:
  - Hovering a button still fades its background. Toggling a switch still fades its colour. **This is the entire point of the plan** — before it, both were hard cuts.
  - Pip (empty and pass screens) is completely still.
  - Running an audit shows a full, static progress bar — not a bar sliding across the track.
  - The phase dots and the outline spinner **still rotate**, and never sit frozen mid-turn showing a broken ring.
  - Opening a sheet fades it in with no upward slide; closing fades it out with no downward slide, and it still fully disappears.
  - A toast fades in with no rise.
  - Expanding an issue group snaps the chevron to 90° with no visible rotation.
  - The switch knob still slides — that one is intentional.
  - Now turn the emulation **off** and confirm every animation from plans 001–004 is back to normal: sheets slide, the toast rises, Pip floats, the progress bar travels.
- **Done when**: with reduced motion on, no element travels across the screen except the switch knob, while every colour/background/opacity transition still runs at normal speed and both spinners still turn.
