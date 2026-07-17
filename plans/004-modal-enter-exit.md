# 004 — Give the bottom sheet a real drawer curve and an exit animation

- **Status**: TODO — **amended 2026-07-17**, see "Amendment" below. Steps 1–7 unchanged; step 8 was rewritten because the original was based on a false claim about the markup.
- **Commit**: 834f519
- **Severity**: MEDIUM
- **Category**: Easing & duration / Missed opportunity
- **Estimated scope**: 3 files (`src/styles/panel.css`, `src/sidepanel/App.tsx`, `src/sidepanel/components/Controls.tsx`) + 4 one-line prop forwards, ~50 lines changed

## Amendment (2026-07-17)

The first version of this plan claimed the four sheet screens each render their own `.modal-backdrop`/`.modal` markup, and that "the surrounding markup is not identical across them". **That was wrong** — it was written without reading those files. An executor correctly refused to proceed on it.

The reality: there is exactly one `.modal-backdrop` in the entire source. All four screens delegate to a shared `Modal` component at `src/sidepanel/components/Controls.tsx:6-39`, whose only callers are those four screens (`grep -rn "modal-backdrop" src/` → `Controls.tsx:19` and `panel.css:883` only). The markup isn't "identical across screens" — there is only one copy of it.

This makes the change **smaller**, not bigger: `closing` threads through one component instead of four. Step 8 below has been rewritten accordingly. Steps 1–7 were verified against disk and are unaffected.

## Problem

Four surfaces render as a bottom sheet — Filters, Settings, Outline, Vision (`src/sidepanel/App.tsx:545-591`). All share `.modal-backdrop` / `.modal`:

```css
/* src/styles/panel.css:872-891 — current */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(20, 16, 12, 0.45);
  display: flex;
  align-items: flex-end;
  z-index: 100;
  animation: fade 0.15s ease;
}
.modal {
  background: var(--ap-surface);
  width: 100%;
  max-height: 90%;
  border-radius: 16px 16px 0 0;
  border-top: 1px solid var(--ap-border-strong);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: rise 0.18s ease;
}
```

```css
/* src/styles/panel.css:1084-1091 — current */
@keyframes rise {
  from { transform: translateY(12px); }
  to { transform: translateY(0); }
}
```

Three problems:

1. **Bare `ease` on an entrance.** Entering elements take a strong ease-out; `ease` is a weak general-purpose curve that starts slow, softening the exact moment the user is watching.
2. **`translateY(12px)` is a token gesture, not a drawer.** A sheet anchored to the bottom edge should travel its own height, so it reads as arriving *from offscreen*. 12px reads as a nudge.
3. **No exit whatsoever.** Every close path — `onClose={() => setShowFilters(false)}` and friends at `src/sidepanel/App.tsx:552, 563, 576, 588` — unmounts the component synchronously. The sheet and its backdrop **vanish mid-air**. A surface that slides in and teleports out is the single most conspicuous motion defect in the app: the enter animation makes a spatial promise that the exit breaks.

## Target

A sheet that slides up from the bottom edge on the iOS-like drawer curve, and slides back down on close.

**`src/styles/panel.css`** — replace the animations on `.modal-backdrop` and `.modal`, keyed off a `data-state` attribute:

```css
/* target — .modal-backdrop's animation line (879) becomes: */
  animation: fade var(--ap-duration-slow) var(--ap-ease-out);
}
.modal-backdrop[data-state='closing'] {
  animation: fade-out var(--ap-duration-slow) var(--ap-ease-out) forwards;
}
```

```css
/* target — .modal's animation line (890) becomes: */
  animation: sheet-in var(--ap-duration-slow) var(--ap-ease-drawer);
}
.modal[data-state='closing'] {
  animation: sheet-out var(--ap-duration-slow) var(--ap-ease-drawer) forwards;
}
```

```css
/* target — replaces `@keyframes rise` entirely (lines 1084-1091) */
@keyframes sheet-in {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
@keyframes sheet-out {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(100%);
  }
}
@keyframes fade-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
```

`translateY(100%)` is a percentage of the **element's own height**, so it works for all four sheets regardless of their content height, with no hardcoded pixel offsets. `forwards` on the closing animations holds the end state so there is no flash of the open sheet in the frame before unmount.

**`src/sidepanel/App.tsx`** — a small hook that defers unmount until the exit finishes. Add it near the other hooks, above the `App` component:

```tsx
/* target — new hook, placed after the `Route` type at line 43 */
const SHEET_EXIT_MS = 250; // keep in sync with --ap-duration-slow in panel.css

/**
 * Keeps a sheet mounted for the length of its exit animation. `open` drives the
 * request; `mounted` drives the render; `closing` drives the [data-state] the
 * CSS animates on.
 */
function useSheet(open: boolean): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    const id = window.setTimeout(() => setMounted(false), SHEET_EXIT_MS);
    return () => window.clearTimeout(id);
  }, [open, mounted]);
  return { mounted, closing: mounted && !open };
}
```

Then each sheet's render swaps `showX &&` for the hook. Filters, in full:

```tsx
/* target — replaces lines 545-556 */
      {filtersSheet.mounted && (
        <Suspense fallback={null}>
          <FiltersScreen
            initial={filters}
            closing={filtersSheet.closing}
            onApply={(state) => {
              setFilters(state);
              setShowFilters(false);
            }}
            onClose={() => setShowFilters(false)}
          />
        </Suspense>
      )}
```

with `const filtersSheet = useSheet(showFilters);` declared alongside the other hook calls (near line 71). The same shape applies to Settings, Outline, and Vision.

**The shared `Modal` component** (`src/sidepanel/components/Controls.tsx:6-39`) is the sole owner of the backdrop/modal markup. It takes a new optional `closing` prop and applies `data-state` to both elements:

```tsx
/* target — Controls.tsx: add `closing` to the props type and destructuring */
export function Modal({
  title,
  onClose,
  children,
  footer,
  closing = false,
}: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
  closing?: boolean;
}) {
```

```tsx
/* target — Controls.tsx: the two elements at lines 19-27. Add ONLY data-state;
   every existing prop, ref and handler stays exactly as it is. */
    <div class="modal-backdrop" data-state={closing ? 'closing' : 'open'} onClick={onClose}>
      <div
        class="modal"
        data-state={closing ? 'closing' : 'open'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
```

Leave `useFocusTrap(true, onClose)` (line 17) exactly as it is. The trap stays active during the 250ms exit; that is correct — focus must not escape to the page behind while the sheet is still visible.

**The four screens** each forward the prop down to `Modal`. Each already renders `<Modal …>` and takes an `onClose` prop, so this is one added prop to the type and one to the JSX, per file:

- `src/sidepanel/screens/FiltersScreen.tsx` — `<Modal>` opens at line 43 (multi-line, `onClose` at 45).
- `src/sidepanel/screens/SettingsScreen.tsx` — `<Modal title="Settings" onClose={onClose}>` at line 21.
- `src/sidepanel/screens/OutlineScreen.tsx` — `<Modal title="Page outline" onClose={onClose}>` at line 58.
- `src/sidepanel/screens/VisionScreen.tsx` — `<Modal title="Vision simulation" onClose={onClose}>` at line 29.

In each: add `closing?: boolean;` to the props type, add `closing,` to the destructuring, and add `closing={closing}` to the `<Modal>` element.

Note `OutlineScreen`'s close path also calls `clearHighlight()` (`src/sidepanel/App.tsx:574-577`). That must keep firing **immediately** on close, not after the exit delay — the page overlay should not linger for 250ms after the user dismisses the sheet. Leave that handler exactly as it is.

## Repo conventions to follow

- Sheets are lazy-loaded behind `Suspense` with `fallback={null}` (`src/sidepanel/App.tsx:30-41, 545-591`). Preserve that; the `mounted` check goes **outside** `Suspense`, exactly as `showFilters &&` does today.
- State-driven styling in this codebase uses ARIA attributes as selectors where one exists — `.tile[aria-pressed='true']` (`panel.css:445`), `.switch[aria-checked='true']` (968), `.segment .seg[aria-checked='true']` (946). There is no ARIA attribute for "animating closed", so `data-state` is the right escape hatch; match the lowercase-string style of those selectors.
- `useState`/`useEffect` are already imported at `src/sidepanel/App.tsx:2`.
- Motion tokens (`--ap-duration-slow`, `--ap-ease-drawer`, `--ap-ease-out`) come from **plan 001, which must run first**. If `grep -n "ap-ease-drawer" src/styles/panel.css` returns nothing, STOP.

## Steps

1. In `src/styles/panel.css`, replace `@keyframes rise` (lines 1084-1091) with the three Target keyframes (`sheet-in`, `sheet-out`, `fade-out`).
2. In `src/styles/panel.css`, update `.modal-backdrop`'s `animation` (line 879) and add the `[data-state='closing']` rule, per Target.
3. In `src/styles/panel.css`, update `.modal`'s `animation` (line 890) and add the `[data-state='closing']` rule, per Target.
4. Confirm nothing else references the deleted `rise` keyframe: `grep -rn "rise" src/` must return no `animation:` usage.
5. In `src/sidepanel/App.tsx`, add `SHEET_EXIT_MS` and the `useSheet` hook after the `Route` type (line 43).
6. In `src/sidepanel/App.tsx`, add four hook calls near line 71: `const filtersSheet = useSheet(showFilters);` and the equivalents for `showSettings`, `showOutline`, `showVision`.
7. In `src/sidepanel/App.tsx`, rewrite each of the four sheet renders (lines 545-591) to gate on `<x>Sheet.mounted` and pass `closing={<x>Sheet.closing}`. Leave every existing prop and handler intact — including `OutlineScreen`'s `clearHighlight()` call.
8. In `src/sidepanel/components/Controls.tsx`, add the `closing = false` prop (typed `closing?: boolean`) to the `Modal` component and put `data-state={closing ? 'closing' : 'open'}` on both the `.modal-backdrop` (line 19) and `.modal` (line 20) elements, per Target. Leave `useFocusTrap` and every existing prop untouched.
9. In each of `src/sidepanel/screens/FiltersScreen.tsx`, `SettingsScreen.tsx`, `OutlineScreen.tsx`, `VisionScreen.tsx`: add `closing?: boolean;` to the props type, add `closing,` to the destructuring, and pass `closing={closing}` to that file's `<Modal>` element. Do not add `data-state` in these files — `Modal` owns it.
10. Confirm the plumbing is complete: `grep -rn "closing" src/sidepanel/` should show the prop in App.tsx (the `useSheet` hook and four call sites), Controls.tsx (type, destructuring, two `data-state` uses), and all four screens.

## Boundaries

- Do NOT change any sheet's content, fields, layout, or close/apply logic. Motion and the `closing` prop only.
- Do NOT duplicate the backdrop/modal markup into the screens, and do NOT add `data-state` anywhere except inside `Modal`. `Controls.tsx` is the single owner of that markup — keep it that way.
- Do NOT touch `useFocusTrap` in `Controls.tsx:17`. The trap must stay active through the exit.
- Do NOT change `transform-origin`. These sheets are edge-anchored and animate on the Y axis; there is nothing to fix.
- Do NOT add drag-to-dismiss. Out of scope.
- Do NOT touch `.toast` — plan 003 owns it.
- Do NOT touch the reduced-motion block — plan 005 owns it and explicitly handles these sheets.
- Do NOT change `SHEET_EXIT_MS` to disagree with `--ap-duration-slow` (250ms). If you change one, change both.
- Do NOT add dependencies.
- If the code does not match the excerpts above (drift since commit 834f519), STOP and report.

## Verification

- **Mechanical**: `npm run typecheck` passes — this is the main guard on step 8, since a missed `closing` prop is a type error. `npm run test:unit` passes. `npm run build` succeeds.
- **Feel check**: load the unpacked extension from `dist/` and, **for each of the four sheets** (Filters, Settings, Outline, Vision):
  - Open it. The sheet slides up from the bottom edge — traveling its full height, not a 12px nudge — while the backdrop fades in. It should feel like it arrives from offscreen.
  - Close it. **This is the whole point of the plan**: the sheet must slide back down and the backdrop fade out, with no mid-air disappearance and no flash of the open sheet at the end.
  - In DevTools → Animations at 10% playback, confirm the sheet decelerates hard into place (the drawer curve is very front-loaded) rather than easing symmetrically.
  - Open and close rapidly, several times. It must not get stuck mounted or invisible. Note honestly: `@keyframes` restart from zero rather than retargeting, so an interrupted close *will* jump — acceptable here (a sheet is a deliberate, occasional surface, not a rapidly-toggled one), but if it looks broken rather than merely abrupt, report back rather than redesigning.
  - For **Outline** specifically: open it, click a row to highlight an element on the page, then close the sheet. The page highlight must clear **immediately**, not 250ms later.
  - Toggle `prefers-reduced-motion: reduce` and confirm the sheets still open and close correctly and stay dismissible. Plan 005 refines exactly what motion survives; here you are only checking nothing is stuck or unusable.
- **Done when**: all four sheets slide in and out, none can be left stranded by rapid toggling, the Outline highlight clears instantly, and typecheck/tests/build are green.
