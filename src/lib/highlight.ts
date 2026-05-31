// Highlight overlay, injected on demand into the audited tab via
// chrome.scripting.executeScript({ func }). This replaces the old declarative
// content script: under activeTab there is no standing content script, so the
// overlay is injected only on the tab the user has invoked Mend on.
//
// These functions run in the extension's ISOLATED world, which is shared across
// injections into the same tab, so state stored on `window` persists between
// calls. They must be self-contained: no imports, no closures over module
// scope, and only JSON-serializable arguments.

export const HIGHLIGHT_ACCENT = '#c4502c';

interface HighlightState {
  raf: number | null;
  box: HTMLDivElement | null;
  selector: string | null;
}

export function highlightInPage(selector: string, accent: string): void {
  const w = window as unknown as { __mendHighlight?: HighlightState };
  const state: HighlightState = (w.__mendHighlight ??= { raf: null, box: null, selector: null });

  const stop = (): void => {
    if (state.raf !== null) {
      cancelAnimationFrame(state.raf);
      state.raf = null;
    }
  };
  const remove = (): void => {
    stop();
    if (state.box) {
      state.box.remove();
      state.box = null;
    }
    state.selector = null;
  };

  let target: Element | null = null;
  try {
    target = document.querySelector(selector);
  } catch {
    target = null;
  }
  if (!target) {
    remove();
    return;
  }

  if (!state.box) {
    const el = document.createElement('div');
    el.setAttribute('data-mend-overlay', '');
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
    } as Partial<CSSStyleDeclaration>);
    document.documentElement.appendChild(el);
    state.box = el;
  }
  state.selector = selector;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });

  stop();
  const el = target;
  const box = state.box;
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
}

export function clearHighlightInPage(): void {
  const w = window as unknown as { __mendHighlight?: HighlightState };
  const state = w.__mendHighlight;
  if (!state) return;
  if (state.raf !== null) {
    cancelAnimationFrame(state.raf);
    state.raf = null;
  }
  if (state.box) {
    state.box.remove();
    state.box = null;
  }
  state.selector = null;
}
