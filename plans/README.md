# Animation plans

Produced by an `improve-animations` audit at commit `834f519`. Every plan is self-contained: exact file paths, current-code excerpts, exact target values, and a feel check. Plans are read-only artifacts — they describe the change, they are not the change.

## Plans

| # | Title | Severity | Category | Status |
| --- | --- | --- | --- | --- |
| [001](001-motion-tokens.md) | Add motion tokens alongside the existing color tokens | LOW (blocking) | Cohesion & tokens | **DONE** |
| [002](002-highlight-raf-performance.md) | Stop the highlight overlay thrashing layout every frame | HIGH | Performance | **DONE** |
| [003](003-toast-interruptibility.md) | Fix toasts silently swapping and dismissing each other early | MEDIUM | Interruptibility | **DONE** |
| [004](004-modal-enter-exit.md) | Give the bottom sheet a real drawer curve and an exit animation | MEDIUM | Easing & duration | **DONE** (amended mid-flight) |
| [005](005-scope-reduced-motion.md) | Scope reduced motion to movement instead of nuking everything | MEDIUM | Accessibility | **DONE** (amended mid-flight) |
| [006](006-progress-bar-easing.md) | Make the indeterminate progress bar loop without a hitch | LOW | Easing & duration | **DONE** |

All six applied 2026-07-17. Mechanical verification green throughout (typecheck, build, 21/21 unit tests).

> **Feel checks are outstanding for all six.** They were never run — applying these required no browser, but judging them does. Motion can be mechanically correct and still feel wrong, so treat this set as verified-by-construction, not verified-by-eye. Each plan's Verification section lists exactly what to look for. Highest value, in order: **004**'s rapid open/close stranding test and its "no flash of the open sheet" check; **002**'s double-offset check (an element far down a long page, where the error is largest); **003**'s 10%-playback sideways-lurch check.

## Corrections made during execution

Both were errors in the plans, caught by the executor refusing to improvise around them. Recorded because they say something about where these plans were weakest:

- **004 step 8 was factually wrong.** It claimed the four screens each render their own `.modal-backdrop`/`.modal` markup and that the markup differed between them. Neither is true: one shared `Modal` in `Controls.tsx` owns it, and the four screens are its only callers. The step was written without reading those files. Amended — the real fix is smaller, threading `closing` through one component.
- **005 omitted the `.modal-backdrop` reduced-motion override.** The sheet faded at 120ms while the backdrop kept 004's 250ms, so the dim outlasted the sheet by 130ms on close. Opacity-only either way, so nothing broke, but it was unintentional. Amended.

Also worth knowing: **001 step 9's survivor list is stale by design.** It permits `.toast`, `.modal-backdrop` and `.modal` as hand-typed-timing survivors, but 003 and 004 tokenized all three. The sweep now returns zero — stricter than 001 anticipated, and the correct end state.

## Execution order

**001 → 002 → 003 → 004 → 005 → 006.** This order is not arbitrary — see the dependency graph below.

```
001 (tokens) ──┬──> 003 (toast) ──┐
               ├──> 004 (sheets) ─┼──> 005 (reduced motion)
               └──> 006 (progress bar, soft dep)

002 (highlight.ts) ── independent, any time
```

- **001 blocks 003, 004 and 005.** It defines `--ap-ease-out`, `--ap-ease-drawer`, `--ap-duration-fast|base|slow`. Those plans consume the tokens and will produce broken CSS without them. Each has a `grep` guard in its "Repo conventions" section that fails loudly if 001 hasn't run.
- **005 must run last of the CSS plans.** It rewrites the reduced-motion block in terms of the `toast-in` keyframe (from 003) and the `[data-state='closing']` hooks and `fade-out` keyframe (from 004). Running it early would reference selectors and keyframes that don't exist yet.
- **006 has only a soft dependency** on 001 — it swaps a keyword (`ease-in-out` → `linear`), not a token. It is ordered last because 005's reduced-motion override for `.progress-bar` interacts with it, but they don't conflict mechanically.
- **002 is fully independent.** It is the only plan touching `src/lib/highlight.ts`; every other plan touches `src/styles/panel.css`. It can run at any point, or in parallel with the rest.

Five of the six plans edit the same file (`src/styles/panel.css`), so **do not run them in parallel** — they will collide. Sequential, in the order above.

## Audit findings not covered by a plan

- **Dead `.tile` transform transition** (`panel.css:440`) — `transition: ..., transform 0.08s ease` with no rule anywhere setting a transform on `.tile`. Folded into **plan 001, step 5** rather than given its own plan, since 001 rewrites that exact declaration.

## Missed opportunities (not planned)

These are additive rather than corrective, and were left out of this pass. Each would need its own plan:

- **The PASS stamp never stamps** (`panel.css:825-853`). An SVG-turbulence-masked eroded ink border, pre-rotated `-8deg`, shown once per clean audit — a rare, high-emotion moment rendered with none of the delight budget it's entitled to. The obvious move is a quick overshoot-and-settle stamp-down.
- **Route changes teleport** (`App.tsx:487-542`). `empty → running → results → detail` all hard-cut. The detail view is a drill-down from a row — spatially connected UI with nothing explaining where it came from. Any fix must stay under ~200ms; detail is opened often.
- **Severity tile counts pop in** (`ResultsScreen.tsx:99-113`). Four counts landing at once after a scan; a 30–80ms stagger would sequence the reveal without blocking interaction.

## What the audit found to be already correct

Recorded so a later pass doesn't "fix" them:

- No `transition: all`, no `scale(0)`, and no `ease-in` anywhere in the codebase.
- `src/lib/highlight.ts:70-71` correctly branches `scrollIntoView` behavior on `prefers-reduced-motion`.
- `.outline-spinner` (`panel.css:1113`) already uses the correct `linear` for constant rotation — it is the exemplar plan 006 brings `.progress-bar` in line with.
- `.float`'s `ease-in-out` (`panel.css:259`) is correct: Pip's idle float is a symmetric back-and-forth, not a loop with a seam.
- The sheets are edge-anchored and animate on the Y axis, so `transform-origin` needs no fixing.
