# 006 — Make the indeterminate progress bar loop without a hitch

- **Status**: TODO
- **Commit**: 834f519
- **Severity**: LOW
- **Category**: Easing & duration
- **Estimated scope**: 1 file (`src/styles/panel.css`), 1 line changed

## Problem

```css
/* src/styles/panel.css:350-364 — current */
.progress-bar {
  height: 100%;
  width: 40%;
  background: var(--ap-accent);
  border-radius: 4px;
  animation: indeterminate 1.1s ease-in-out infinite;
}
@keyframes indeterminate {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(320%);
  }
}
```

`ease-in-out` on a **looping, constant-motion** animation puts a deceleration at the end of every cycle and an acceleration at the start of the next. Because the loop's start and end positions are different (`-100%` → `320%`), the bar glides to a near-stop at `320%`, then instantly teleports back to `-100%` and accelerates away again. The result is a visible hitch once every 1.1 seconds, and a bar that repeatedly *looks* like it is finishing and then isn't.

Constant motion — marquees, indeterminate progress — takes `linear`. Under `linear`, the seam is still a jump, but it is a jump between two points moving at identical speed, which reads as continuous travel rather than a stutter.

This is the smallest finding in the set, and the one whose payoff is easiest to see: the bar is on screen for the whole audit.

## Target

```css
/* target — replaces line 355 */
  animation: indeterminate 1.1s linear infinite;
```

Everything else about the bar — the `1.1s` duration, the `40%` width, the `-100%` → `320%` travel, the keyframe itself — is unchanged.

Do **not** "fix" the seam by making the keyframe symmetric (e.g. returning to `-100%` at 100%), which would make the bar visibly reverse. A one-directional loop with a hard reset is the correct construction for an indeterminate bar; only the timing function is wrong.

## Repo conventions to follow

- Duration values inside `animation:` shorthands in this file are written in seconds (`1.1s`, `0.7s`, `4.2s`) — see `.float` (259), `.phase-row.active .phase-dot` (404), `.outline-spinner` (1113). Keep `1.1s` as-is; do not convert it to a token or to `ms`.
- Exemplar of a correct constant-motion animation already in this file: `.outline-spinner` at `src/styles/panel.css:1113` — `animation: spin 0.7s linear infinite;`. That is exactly the pattern this plan brings `.progress-bar` in line with.
- This plan has **no dependency on the motion tokens** from plan 001; `linear` is a keyword, not a curve token.

## Steps

1. In `src/styles/panel.css`, change `.progress-bar`'s `animation` (line 355) from `indeterminate 1.1s ease-in-out infinite` to `indeterminate 1.1s linear infinite`.

That is the entire change.

## Boundaries

- Do NOT modify the `@keyframes indeterminate` block (lines 357-364).
- Do NOT change the bar's `width`, `height`, `background`, `border-radius`, or the `.progress-track` rules (343-349).
- Do NOT touch `.phase-list`, `.phase-row`, or `.phase-dot`.
- Do NOT touch the reduced-motion `.progress-bar` override — plan 005 owns it, and it sets `animation: none`, so this change correctly has no effect under reduced motion.
- Do NOT touch `src/sidepanel/screens/RunningScreen.tsx`. The phase ticker's `TICK_MS = 280` is unrelated pacing and is out of scope.
- Do NOT add dependencies.
- If line 355 does not match the excerpt above (drift since commit 834f519), STOP and report.

## Verification

- **Mechanical**: `npm run build` succeeds. `grep -n "ease-in-out" src/styles/panel.css` returns only `.float` at line 259 (Pip's idle float, where `ease-in-out` is correct — it is a symmetric back-and-forth, not a loop with a seam).
- **Feel check**: load the unpacked extension from `dist/` and run an audit on any page to bring up the running screen. Then:
  - Watch the bar for several full cycles. It should travel at one constant speed all the way across, with no slow-down at the right edge.
  - In DevTools → Animations, set playback to 10% and watch the moment the bar exits right and re-enters left. Before this change, it visibly decelerates to a crawl before vanishing. After, it should leave at the same speed it entered. The reset itself is still instantaneous — that is expected and correct.
  - Honest caveat: at 100% speed the difference is subtle. If you cannot see it, trust the 10% playback check rather than concluding nothing changed.
  - If the audit finishes too fast to watch, set audit depth to a slower setting in Settings, or run it against a large, complex page.
- **Done when**: the bar's speed is visibly constant across the full cycle at 10% playback, and the only remaining `ease-in-out` in the file is `.float`.
