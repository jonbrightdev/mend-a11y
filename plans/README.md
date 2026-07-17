# Animation plans

Empty by design. The six plans from the `improve-animations` pass at `834f519` were all applied in
commit `0acb7a7` and deleted once verified. This file is what's left: the parts that still have a
future.

To read a deleted plan in full: `git show 0acb7a7:plans/004-modal-enter-exit.md` (and so on for
`001-motion-tokens`, `002-highlight-raf-performance`, `003-toast-interruptibility`,
`005-scope-reduced-motion`, `006-progress-bar-easing`).

## What shipped

Applied 2026-07-17, all six re-verified against the source before deletion:

| Plan | Change | Verified at |
| --- | --- | --- |
| 001 | Motion tokens (`--ap-ease-out`, `--ap-ease-drawer`, `--ap-duration-fast\|base\|slow`) | `panel.css:31-37` |
| 002 | Highlight overlay writes `transform`, skips redundant frames | `highlight.ts:78-108` |
| 003 | Toast keyed by message; single timer held in a ref | `App.tsx:232-240`, `App.tsx:628-632` |
| 004 | Sheets enter/exit on a drawer curve via `[data-state='closing']` | `panel.css:883-926`, `App.tsx:52-64` |
| 005 | Reduced motion scoped to movement, not all feedback | `panel.css:1287-1329` |
| 006 | Indeterminate progress bar loops `linear` | `panel.css:366` |

Plus one follow-up found while auditing the above and fixed in the same pass — see below.

## Outstanding feel checks

**None of the six were ever feel-checked.** They are verified-by-construction, not verified-by-eye —
motion can be mechanically correct and still feel wrong. Highest value first:

1. **Rapid sheet open/close** — open a sheet (Settings, Filters, Outline, Vision) and close-then-reopen
   it inside 250ms. Watch for the sheet being stranded, or a flash of the open sheet on close. The
   snap-to-dismissed bug this would have caught is fixed (below), but the check still stands.
2. **Highlight double-offset** — open an issue detail for an element far down a long page and confirm
   the overlay lands exactly on it. 002 changed `top`/`left` to `transform`; if any offset were
   double-applied the error would be largest here.
3. **Toast sideways lurch** — DevTools → Animations at 10% playback, trigger a toast. It must rise
   straight up while staying centered. Drift means a keyframe lost its `translate(-50%, …)`.

## Fixed: sheets snapped to fully-dismissed when reopened mid-close

`useSheet` (`App.tsx:52-64`) flips `data-state` between `open` and `closing`, and the CSS swapped the
*animation name* (`sheet-in` ⇄ `sheet-out`). CSS keyframes restart from their `0%` step rather than
retargeting, so reopening a part-dismissed sheet snapped it to fully-offscreen first. Measured in
Chrome before the fix — one frame after the reopen the sheet sat at exactly `translateY(100%)`:

```
100ms into close:  translateY(276px)
reopen +1 frame:   translateY(300px)   ← snapped fully offscreen
```

Now a `transform`/`opacity` transition, which retargets from wherever the sheet is, with
`@starting-style` supplying the entry a transition can't run on mount (`panel.css:883-926`). Verified
in Chrome against the real stylesheet: reopening mid-close recovers from the current position instead
of snapping, and under `prefers-reduced-motion` the sheet never translates at any point while opacity
still animates.

`@starting-style` is Chrome 117+; the manifest sets no `minimum_chrome_version` and the side panel API
already requires 114+. The degradation across that gap is graceful — the sheet appears in place rather
than sliding — so it was not worth pinning the manifest.

## Missed opportunities

Additive, not corrective. Each needs its own plan:

- **The PASS stamp never stamps** (`panel.css:836-864`, `PassScreen.tsx:30`). An SVG-turbulence-masked
  eroded ink border, pre-rotated `-8deg`, shown once per clean audit — a rare, high-emotion moment with
  none of the delight budget it's entitled to. An overshoot-and-settle stamp-down is the obvious move.
- **Route changes teleport** (`App.tsx:517-574`). `empty → running → results → detail` all hard-cut.
  Detail is a drill-down from a row — spatially connected UI with nothing explaining where it came
  from. Any fix stays under ~200ms; detail is opened often.
- **Severity tile counts pop in** (`ResultsScreen.tsx:99-117`). Four counts landing at once after a
  scan; a 30–80ms stagger would sequence the reveal without blocking interaction.

## Already correct — don't "fix" these

- No `transition: all`, no `scale(0)`, and no `ease-in` anywhere in the codebase.
- `highlight.ts:72-73` correctly branches `scrollIntoView` on `prefers-reduced-motion`.
- `.outline-spinner` (`panel.css:1157`) uses `linear` for constant rotation — correct.
- `.float`'s `ease-in-out` (`panel.css:270`) is correct: Pip's idle float is a symmetric
  back-and-forth, not a loop with a seam.
- Sheets are edge-anchored and animate on Y, so `transform-origin` needs no fixing.
