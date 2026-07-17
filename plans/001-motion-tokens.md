# 001 — Add motion tokens alongside the existing color tokens

- **Status**: DONE — applied 2026-07-17, uncommitted in the working tree. `npm run build` green. Feel check still outstanding (needs the extension loaded in Chrome).
- **Commit**: 834f519
- **Severity**: LOW (but blocking: plans 003–006 consume these tokens)
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file (`src/styles/panel.css`), ~15 lines added + 9 declarations rewritten

## Problem

`src/styles/panel.css` defines a rigorous color token system (`--ap-bg`, `--ap-fg`, `--ap-accent`, … at lines 8–55) but has **no motion tokens**. Every duration and curve is hand-typed at the call site, producing four near-identical durations and a bare `ease` everywhere:

```css
/* src/styles/panel.css:163 — current */
.btn { transition: background 0.12s ease, border-color 0.12s ease, transform 0.08s ease; }
/* src/styles/panel.css:200 — current */
.icon-btn { transition: background 0.12s ease, color 0.12s ease; }
/* src/styles/panel.css:440 — current */
.tile { transition: border-color 0.12s ease, transform 0.08s ease; }
/* src/styles/panel.css:593 — current */
.chevron { transition: transform 0.15s ease; }
/* src/styles/panel.css:879 — current */
.modal-backdrop { animation: fade 0.15s ease; }
/* src/styles/panel.css:890 — current */
.modal { animation: rise 0.18s ease; }
/* src/styles/panel.css:965 — current */
.switch { transition: background 0.15s ease, border-color 0.15s ease; }
/* src/styles/panel.css:980 — current */
.switch .knob { transition: transform 0.15s ease; }
/* src/styles/panel.css:1073 — current */
.toast { animation: fade 0.15s ease; }
```

It matters because motion is the one system in this file that isn't a system. Later plans need shared curves to apply consistently, and today there is nowhere to put them.

## Target

Add a motion token block to **both** the `:root, [data-theme='light']` and… **no** — motion tokens do not vary by theme. Add them **once**, in the `:root, [data-theme='light']` block only, since `:root` already applies globally and `[data-theme='dark']` only overrides colors.

```css
/* target — appended inside the :root, [data-theme='light'] block, before `color-scheme: light;` */

  /* motion: durations + curves. Not theme-dependent; defined once on :root. */
  --ap-ease-hover: ease;
  --ap-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ap-ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
  --ap-duration-fast: 120ms;
  --ap-duration-base: 160ms;
  --ap-duration-slow: 250ms;
```

Rationale for each, so the executor does not "improve" them:

- `--ap-ease-hover: ease` — hover and color changes correctly take the built-in `ease`. This is a token for consistency, not a change in behavior.
- `--ap-ease-out` — the strong ease-out for entrances and transforms. Built-in `ease-out` is too weak for deliberate motion.
- `--ap-ease-drawer` — the iOS-like drawer curve, used by plan 004 for the bottom sheet.
- `--ap-duration-fast: 120ms` — replaces the existing `0.12s` hover timings exactly.
- `--ap-duration-base: 160ms` — replaces the existing `0.15s` (a 10ms bump to land on a round scale value) and the `0.08s` press timings (80ms is below the 100–160ms press-feedback band and reads as instant).
- `--ap-duration-slow: 250ms` — for the modal/drawer, inside the 200–500ms modal band. Not used by this plan; plan 004 consumes it.

Then rewrite the nine declarations to consume the tokens:

```css
/* target */
.btn {
  transition: background var(--ap-duration-fast) var(--ap-ease-hover),
    border-color var(--ap-duration-fast) var(--ap-ease-hover),
    transform var(--ap-duration-base) var(--ap-ease-out);
}
.icon-btn {
  transition: background var(--ap-duration-fast) var(--ap-ease-hover),
    color var(--ap-duration-fast) var(--ap-ease-hover);
}
.tile {
  transition: border-color var(--ap-duration-fast) var(--ap-ease-hover);
}
.chevron {
  transition: transform var(--ap-duration-base) var(--ap-ease-out);
}
.switch {
  transition: background var(--ap-duration-base) var(--ap-ease-hover),
    border-color var(--ap-duration-base) var(--ap-ease-hover);
}
.switch .knob {
  transition: transform var(--ap-duration-base) var(--ap-ease-out);
}
```

Note `.tile` **loses its `transform` transition entirely** — see plan 006 for why (it is dead code; nothing sets a transform on `.tile`). If plan 006 has already run, `.tile` may already read this way; that is fine, leave it.

`.modal-backdrop` (line 879), `.modal` (line 890) and `.toast` (line 1073) are **left alone by this plan** — plans 003 and 004 rewrite them wholesale. Do not touch them here.

## Repo conventions to follow

- All design tokens live in the `:root, [data-theme='light']` block at `src/styles/panel.css:8-31`, are prefixed `--ap-`, and are grouped with a comment. Follow that prefix and placement exactly.
- Exemplar to imitate — the existing token block header style at `src/styles/panel.css:1-6` and the grouped severity tokens at `src/styles/panel.css:22-27`.
- This file uses 2-space indentation and lowercase hex. Durations elsewhere are written in seconds (`0.12s`); the new tokens use `ms` because the scale is clearer in whole numbers. Both are valid CSS; do not "normalize" the units.

## Steps

1. In `src/styles/panel.css`, inside the `:root, [data-theme='light']` block, immediately **before** the `color-scheme: light;` line (currently line 30), insert the six motion tokens with the `/* motion: ... */` comment exactly as written in the Target section.
2. Do **not** add motion tokens to the `[data-theme='dark']` block. They do not vary by theme.
3. Rewrite `.btn`'s `transition` (line 163) to the Target version.
4. Rewrite `.icon-btn`'s `transition` (line 200) to the Target version.
5. Rewrite `.tile`'s `transition` (line 440) to the Target version — dropping the `transform 0.08s ease` segment.
6. Rewrite `.chevron`'s `transition` (line 593) to the Target version.
7. Rewrite `.switch`'s `transition` (line 965) to the Target version.
8. Rewrite `.switch .knob`'s `transition` (line 980) to the Target version.
9. Grep the file for any remaining hand-typed timing: `grep -n "0\.0[0-9]s\|0\.1[0-9]s\|0\.2[0-9]s" src/styles/panel.css`. The only permitted survivors after this plan are the `animation:` shorthands on `.float` (259), `.progress-bar` (355), `.phase-row.active .phase-dot` (404), `.modal-backdrop` (879), `.modal` (890), `.toast` (1073), and `.outline-spinner` (1113). Anything else means a step was missed.

## Boundaries

- Do NOT touch `.modal-backdrop`, `.modal`, or `.toast` — plans 003 and 004 own those.
- Do NOT touch the `@keyframes` blocks (1076–1096) or the reduced-motion block (1243–1258) — plan 005 owns the latter.
- Do NOT touch `.float` (258), `.progress-bar` (355), the spinners (404, 1113), or `src/lib/highlight.ts`.
- Do NOT change any color token, markup, or component file. This plan is `panel.css` motion declarations only.
- Do NOT add dependencies.
- If a line does not match the excerpt above (drift since commit 834f519), STOP and report rather than improvising.

## Verification

- **Mechanical**: `npm run typecheck` passes (CSS is not typechecked, but this confirms nothing else broke). `npm run build` completes without CSS warnings. Grep from step 9 returns only the permitted lines.
- **Feel check**: load the extension side panel (`npm run dev`, then load `dist/` as an unpacked extension) and confirm:
  - Hovering a `.btn` and an `.icon-btn` still shows the same background fade as before — this plan must be **visually identical** on hover.
  - Pressing a `.btn` (the `translateY(1px)` at line 169) now settles slightly more softly than before, because press went from 80ms to 160ms with a strong ease-out. It should still feel immediate, not laggy. If it reads as sluggish, report back rather than silently retuning — the value came from the 100–160ms press-feedback band.
  - Toggling a `.switch` in Settings still slides its knob smoothly.
  - Expanding an issue group still rotates the chevron.
- **Done when**: every `transition` in `panel.css` references `var(--ap-duration-*)` and `var(--ap-ease-*)`, no hover behavior changed visually, and the build is clean.
