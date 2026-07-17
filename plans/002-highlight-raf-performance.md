# 002 — Stop the highlight overlay thrashing layout every frame

- **Status**: TODO
- **Commit**: 834f519
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 1 file (`src/lib/highlight.ts`), ~25 lines changed

## Problem

The highlight overlay tracks the audited element with an unbounded `requestAnimationFrame` loop that, **on every single frame, forever**, writes four layout-triggering properties:

```ts
// src/lib/highlight.ts:76-92 — current
  const step = (): void => {
    if (!el.isConnected) {
      remove();
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      remove();
      return;
    }
    box.style.top = `${rect.top}px`;
    box.style.left = `${rect.left}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    state.raf = requestAnimationFrame(step);
  };
  step();
```

Three problems compound here:

1. `top`/`left`/`width`/`height` are layout properties. Animating them triggers layout + paint + composite instead of running on the GPU. Only `transform` and `opacity` should be animated.
2. The writes happen **unconditionally**, even when the element hasn't moved a pixel — which is the common case, since the user is reading an issue, not scrolling.
3. The loop never idles. It runs at 60fps for as long as the detail view is open.

This matters more than it would in a normal app: this code is injected into **the user's audited page**, not the extension panel. A tool that measures a page's quality should not degrade that page's performance while you inspect it.

## Target

Position the box with a GPU-composited `transform`, size it with `width`/`height` only when the size actually changes, and skip all writes when the rect is unchanged.

```ts
/* target — the created element's initial style */
    Object.assign(el.style, {
      position: 'fixed',
      top: '0px',
      left: '0px',
      width: '0px',
      height: '0px',
      pointerEvents: 'none',
      zIndex: '2147483647',
      border: `2px solid ${accent}`,
      borderRadius: '3px',
      boxShadow: '0 0 0 9999px rgba(20, 16, 12, 0.25)',
      transition: 'none',
      transform: 'translate(0px, 0px)',
      willChange: 'transform',
    } as Partial<CSSStyleDeclaration>);
```

```ts
/* target — the tracking loop */
  stop();
  const el = target;
  const box = state.box;
  // Skip redundant style writes: the element is usually stationary while the
  // user reads, and every write here costs layout on the audited page.
  let last: { top: number; left: number; width: number; height: number } | null = null;
  const step = (): void => {
    if (!el.isConnected) {
      remove();
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      remove();
      return;
    }
    if (
      last === null ||
      rect.top !== last.top ||
      rect.left !== last.left ||
      rect.width !== last.width ||
      rect.height !== last.height
    ) {
      // transform is composited; width/height still cost layout, so only write
      // them when the box actually resized.
      box.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
      if (last === null || rect.width !== last.width || rect.height !== last.height) {
        box.style.width = `${rect.width}px`;
        box.style.height = `${rect.height}px`;
      }
      last = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    }
    state.raf = requestAnimationFrame(step);
  };
  step();
```

Critical detail the executor must not get wrong: the element keeps `position: fixed; top: 0; left: 0` and is offset **purely by the transform**. Do not leave the old `box.style.top = ...` / `box.style.left = ...` writes in place alongside the transform — they would double-offset the box.

Second critical detail: when `highlightInPage` is called again for a **different** selector, the box element is reused (`state.box` persists on `window`). The `last` cache is a fresh local per call, so it correctly starts as `null` and forces a first write. Do not hoist `last` onto `state`.

## Repo conventions to follow

- This module runs in the ISOLATED world via `chrome.scripting.executeScript({ func })`, so per the header comment at `src/lib/highlight.ts:1-9` it must stay **self-contained**: no imports, no closures over module scope, only JSON-serializable arguments. The change above respects that — keep it that way.
- Cross-call state lives on `window.__mendHighlight` typed as `HighlightState` (`src/lib/highlight.ts:13-21`). If you needed to persist anything, that is where it goes — but this plan does not need to.
- The file explains *why* rather than *what* in comments (see lines 1-9, 94-95 of `App.tsx` for the house style). The two comments in the Target block match that register; keep them, they document a non-obvious performance constraint.

## Steps

1. In `src/lib/highlight.ts`, in the `Object.assign(el.style, {...})` call (lines 52-64), add `transform: 'translate(0px, 0px)'` and `willChange: 'transform'` to the style object, after `transition: 'none'`.
2. Replace the `step` function and its `last`-cache declaration (lines 74-92) with the Target version above. The `const el = target;` and `const box = state.box;` lines stay as they are.
3. Confirm no `box.style.top` or `box.style.left` assignment survives anywhere in the file: `grep -n "style.top\|style.left" src/lib/highlight.ts` must return nothing.
4. Leave `clearHighlightInPage` (lines 95-108) untouched — it removes the element entirely, so it needs no cache reset.

## Boundaries

- Do NOT touch `src/styles/panel.css` — this plan is `highlight.ts` only.
- Do NOT change the `scrollIntoView` reduced-motion branch at line 70-71. It is already correct.
- Do NOT change `HIGHLIGHT_ACCENT`, the `boxShadow` dimming, or the `zIndex`.
- Do NOT add an import, a dependency, or a module-scope helper — the ISOLATED-world constraint at lines 1-9 forbids it.
- Do NOT convert the rAF loop to a `ResizeObserver`/`IntersectionObserver`. That is a larger redesign; this plan is the targeted fix.
- If the code does not match the excerpts above (drift since commit 834f519), STOP and report.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm run test:unit` passes (nine suites). `npm run build` succeeds.
- **Feel check** — this one is genuinely measurable, so measure it rather than eyeballing:
  1. Load the unpacked extension from `dist/`, open the side panel on any content-heavy page, run an audit, and open an issue's detail view so the highlight appears.
  2. Confirm the highlight box still sits **exactly** on the target element. A double-offset bug (leftover `top`/`left` writes) shows as the box drifting toward the bottom-right, roughly doubling its distance from the viewport origin — check an element far down the page, where the error is largest.
  3. Scroll the page. The box must track the element smoothly with no lag or jitter.
  4. In DevTools → Performance, record ~3 seconds while the highlight is visible and the page is **stationary**. Before this change, every frame contains a "Recalculate Style" / "Layout" pair. After, the stationary frames should show effectively no layout work — that is the whole point of the plan.
  5. Resize the browser window while the highlight is visible; the box must resize to match.
  6. Click through to a different issue; the box must jump to the new element (this exercises the `last === null` reset path).
- **Done when**: the box tracks correctly in all four cases above (stationary, scrolling, resizing, selector change), and a stationary highlight produces no per-frame layout in a Performance recording.
