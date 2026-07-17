# 003 — Fix toasts silently swapping and dismissing each other early

- **Status**: TODO
- **Commit**: 834f519
- **Severity**: MEDIUM
- **Category**: Interruptibility
- **Estimated scope**: 2 files (`src/sidepanel/App.tsx`, `src/styles/panel.css`), ~15 lines changed

## Problem

Two defects, both visible when a second toast arrives while one is showing.

**1. The entrance never replays.** The toast is rendered without a `key`:

```tsx
// src/sidepanel/App.tsx:593 — current
      {toast && <div class="toast" role="status">{toast}</div>}
```

Preact reuses the same DOM node when only the text changes. CSS `@keyframes` run on element **insertion**, so `animation: fade 0.15s ease` (`src/styles/panel.css:1073`) fires exactly once — the first toast fades in, and every subsequent message hard-swaps its text in place with no animation. The user gets no signal that anything new happened.

**2. Timers stack and cancel the wrong toast.** `showToast` sets a timeout but never clears the previous one:

```tsx
// src/sidepanel/App.tsx:206-209 — current
  const showToast = useCallback((msg: string, ms = 1400) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), ms);
  }, []);
```

Every call schedules an independent `setTimeout`, and each one blindly clears whatever toast is current when it fires. So a default 1400ms toast followed shortly by a deliberately-long error toast — `showToast(res.error, 5000)` at `src/sidepanel/App.tsx:419`, commented *"Long enough to actually read a sentence-length error"* — results in the error being wiped at the **earlier** timer's deadline. The one message the code explicitly wanted readable is the one that gets cut short.

There is also no exit: the toast unmounts instantly. Given how brief and peripheral it is, an exit fade is in scope here (it is cheap once the element is keyed).

## Target

**`src/sidepanel/App.tsx`** — key the toast by message so each new message is a genuinely new element, and hold the timer in a ref so each call cancels the last:

```tsx
/* target — replaces the showToast callback at lines 206-209 */
  const toastTimer = useRef<number | null>(null);
  const showToast = useCallback((msg: string, ms = 1400) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = window.setTimeout(() => {
      toastTimer.current = null;
      setToast(null);
    }, ms);
  }, []);
```

```tsx
/* target — replaces line 593 */
      {toast && (
        <div class="toast" role="status" key={toast}>
          {toast}
        </div>
      )}
```

**`src/styles/panel.css`** — give the toast its own entrance keyframe instead of sharing the generic `fade`:

```css
/* target — replaces .toast's `animation: fade 0.15s ease;` at line 1073 */
  animation: toast-in var(--ap-duration-base) var(--ap-ease-out);
```

```css
/* target — new keyframe, added next to the other @keyframes blocks after `rise` (line 1091) */
@keyframes toast-in {
  from {
    opacity: 0;
    transform: translate(-50%, 6px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}
```

**The `-50%` is load-bearing and must not be dropped.** `.toast` is centered with `transform: translateX(-50%)` (`src/styles/panel.css:1065`). Any keyframe that animates `transform` overrides that centering for the animation's duration. The existing `fade` keyframe is safe only because it touches `opacity` alone. If you write `transform: translateY(6px)` here, the toast will jump to the right by half its width while animating and snap back at the end. Both keyframe steps must carry `translate(-50%, …)`.

Two toasts in a row with different text now each mount fresh and each play `toast-in` — which is the correct behavior: a new message should announce itself.

### On the exit

Deliberately **not** added. An exit fade requires a closing state and an unmount delay, and `role="status"` announcements interact badly with elements that linger after their content is logically gone. The toast is 1400ms and peripheral; a missing 150ms exit is a far smaller defect than the two bugs above. If an exit is wanted later, it belongs in its own plan with a screen-reader check. Do not improvise one here.

## Repo conventions to follow

- Timers in this file are stored in refs and cleaned up explicitly — see the `activeIdForRun` ref pattern at `src/sidepanel/App.tsx:288-290` and the effect cleanup at `src/sidepanel/App.tsx:112-120`. Follow it.
- `useRef` is already imported at `src/sidepanel/App.tsx:2` — no import change needed.
- Keyframes live together at the bottom of the component section they serve, `src/styles/panel.css:1076-1096`. Add `toast-in` there, after `rise`.
- Motion tokens (`--ap-duration-base`, `--ap-ease-out`) are defined by **plan 001, which must run first**. If `grep -n "ap-duration-base" src/styles/panel.css` returns nothing, STOP — plan 001 has not been applied.

## Steps

1. In `src/sidepanel/App.tsx`, replace the `showToast` callback (lines 206-209) with the Target version, including the `toastTimer` ref declared immediately above it.
2. In `src/sidepanel/App.tsx`, replace the toast render (line 593) with the keyed Target version.
3. In `src/styles/panel.css`, change `.toast`'s `animation` (line 1073) to `animation: toast-in var(--ap-duration-base) var(--ap-ease-out);`.
4. In `src/styles/panel.css`, add the `@keyframes toast-in` block immediately after the `rise` keyframe (which ends at line 1091) and before `@keyframes spin`.
5. Leave the generic `@keyframes fade` (lines 1076-1083) in place — `.modal-backdrop` still uses it.

## Boundaries

- Do NOT add an exit animation (see "On the exit" above).
- Do NOT change `role="status"` or any `announce()` call — screen-reader behavior is out of scope.
- Do NOT change the toast's position, colors, or `z-index`.
- Do NOT touch `.modal` / `.modal-backdrop` — plan 004 owns those.
- Do NOT change the call sites' durations, in particular the `5000` at `src/sidepanel/App.tsx:419`.
- Do NOT add dependencies.
- If the code does not match the excerpts above (drift since commit 834f519), STOP and report.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm run test:unit` passes. `npm run build` succeeds.
- **Feel check**: load the unpacked extension from `dist/` and confirm:
  - Trigger any toast (e.g. toggle text spacing on a page where it fails, or use the dashboard Save button). It fades and rises ~6px into place, then disappears after ~1.4s.
  - **The stacking bug**: trigger a toast, then trigger a *different* toast about one second later. The second must play its own fade-and-rise (not a silent text swap), and must last its **own** full duration — the first toast's timer must not cut it off.
  - **The regression this guards**: in DevTools → Animations, set playback speed to 10% and trigger a toast. It must animate straight up from 6px below its resting spot, staying horizontally centered the whole time. Any sideways lurch means a `translate(-50%, …)` step lost its `-50%`.
  - Toggle `prefers-reduced-motion: reduce` (DevTools → Rendering) and confirm the toast still appears and still disappears on schedule — it should just arrive without the rise.
- **Done when**: consecutive toasts each animate in, each survives its own full duration, the toast never drifts horizontally, and typecheck/tests/build are green.
