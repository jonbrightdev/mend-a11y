// Focus-order visualizer. Injected on demand into the audited tab via
// chrome.scripting.executeScript({ func }), it draws a numbered badge and a ring
// on every element in the page's keyboard tab order, so a developer can see the
// focus path at a glance and spot illogical ordering or unreachable controls.
// Like the highlight overlay this is a manual visual check, not an automated
// rule: whether the order "makes sense" is a human judgment no engine can make.
//
// The injected functions run in the extension's ISOLATED world (shared across
// injections into the same tab, so window state persists between calls) and must
// be self-contained: no imports, no closures over module scope, only
// JSON-serializable arguments.

export const FOCUS_ORDER_ACCENT = '#c4502c';

interface FocusOrderState {
  container: HTMLDivElement | null;
  onResize: (() => void) | null;
}

/**
 * Computes the visible tab-order sequence and draws a numbered badge plus a ring
 * on each stop. Idempotent: re-running rebuilds the overlay in place. Badges are
 * positioned in document coordinates so they scroll with the page; positions are
 * recomputed on resize.
 */
export function showFocusOrderInPage(accent: string): void {
  const w = window as unknown as { __mendFocusOrder?: FocusOrderState };
  const state: FocusOrderState = (w.__mendFocusOrder ??= { container: null, onResize: null });

  const SELECTOR = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    'summary',
    'iframe',
    'audio[controls]',
    'video[controls]',
    '[contenteditable=""]',
    '[contenteditable="true"]',
    '[tabindex]',
  ].join(',');

  const tabIndexOf = (el: Element): number => {
    const raw = el.getAttribute('tabindex');
    if (raw == null) return 0;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? 0 : n;
  };

  const isVisible = (el: Element): boolean => {
    const he = el as HTMLElement;
    if (he.hidden) return false;
    if ((he as HTMLInputElement).disabled) return false;
    if (he.closest('[inert]')) return false;
    const rect = he.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(he);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    return true;
  };

  const build = (): void => {
    // Tab order: positive tabindex first, ascending and stable, then everything
    // with tabindex 0 (or natively focusable) in DOM order. Close enough to the
    // browser's real algorithm for a visual check. Negative tabindex is skipped.
    const candidates = Array.from(document.querySelectorAll(SELECTOR))
      .map((el, domIndex) => ({ el, domIndex, ti: tabIndexOf(el) }))
      .filter((c) => c.ti >= 0 && isVisible(c.el));
    const positive = candidates
      .filter((c) => c.ti > 0)
      .sort((a, b) => a.ti - b.ti || a.domIndex - b.domIndex);
    const natural = candidates.filter((c) => c.ti === 0);
    const ordered = [...positive, ...natural];

    state.container?.remove();
    const container = document.createElement('div');
    container.setAttribute('data-mend-focus-order', '');
    Object.assign(container.style, {
      position: 'absolute',
      top: '0px',
      left: '0px',
      width: '0px',
      height: '0px',
      margin: '0px',
      padding: '0px',
      border: '0px',
      pointerEvents: 'none',
      zIndex: '2147483647',
    } as Partial<CSSStyleDeclaration>);

    ordered.forEach((c, i) => {
      const rect = c.el.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const left = rect.left + window.scrollX;

      const ring = document.createElement('div');
      Object.assign(ring.style, {
        position: 'absolute',
        top: `${top}px`,
        left: `${left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        boxSizing: 'border-box',
        border: `2px solid ${accent}`,
        borderRadius: '3px',
        pointerEvents: 'none',
      } as Partial<CSSStyleDeclaration>);

      const badge = document.createElement('div');
      badge.textContent = String(i + 1);
      Object.assign(badge.style, {
        position: 'absolute',
        top: `${top}px`,
        left: `${left}px`,
        transform: 'translate(-55%, -55%)',
        minWidth: '18px',
        height: '18px',
        padding: '0 4px',
        boxSizing: 'border-box',
        background: accent,
        color: '#ffffff',
        font: '600 11px/18px ui-sans-serif, system-ui, -apple-system, sans-serif',
        textAlign: 'center',
        borderRadius: '9px',
        boxShadow: '0 1px 3px rgba(20, 16, 12, 0.45)',
        pointerEvents: 'none',
      } as Partial<CSSStyleDeclaration>);

      container.appendChild(ring);
      container.appendChild(badge);
    });

    (document.body ?? document.documentElement).appendChild(container);
    state.container = container;
  };

  build();

  // Document-anchored badges don't move on scroll, but layout changes shift the
  // elements, so recompute on resize (throttled to a frame).
  if (state.onResize) window.removeEventListener('resize', state.onResize);
  let scheduled = false;
  const onResize = (): void => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      build();
    });
  };
  window.addEventListener('resize', onResize);
  state.onResize = onResize;
}

export function clearFocusOrderInPage(): void {
  const w = window as unknown as { __mendFocusOrder?: FocusOrderState };
  const state = w.__mendFocusOrder;
  if (!state) return;
  if (state.onResize) {
    window.removeEventListener('resize', state.onResize);
    state.onResize = null;
  }
  state.container?.remove();
  state.container = null;
}

/** Whether the focus-order overlay is currently present in the page. */
export function isFocusOrderActiveInPage(): boolean {
  const w = window as unknown as { __mendFocusOrder?: FocusOrderState };
  return w.__mendFocusOrder?.container != null;
}
