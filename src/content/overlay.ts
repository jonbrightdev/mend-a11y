import type { ContentMessage } from '../lib/messages';

let overlay: HTMLDivElement | null = null;
let rafId: number | null = null;
let currentSelector: string | null = null;

const ACCENT = '#c4502c';

function ensureOverlay(): HTMLDivElement {
  if (overlay) return overlay;
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
    border: `2px solid ${ACCENT}`,
    borderRadius: '3px',
    boxShadow: '0 0 0 9999px rgba(20, 16, 12, 0.25)',
    transition: 'none',
  } as Partial<CSSStyleDeclaration>);
  document.documentElement.appendChild(el);
  overlay = el;
  return el;
}

function stopTracking(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function removeOverlay(): void {
  stopTracking();
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  currentSelector = null;
}

function track(target: Element): void {
  const box = ensureOverlay();
  const step = (): void => {
    // The element vanished (removed or hidden): clean up the phantom box.
    if (!target.isConnected) {
      removeOverlay();
      return;
    }
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      removeOverlay();
      return;
    }
    box.style.top = `${rect.top}px`;
    box.style.left = `${rect.left}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    rafId = requestAnimationFrame(step);
  };
  step();
}

function highlight(selector: string): void {
  // Already tracking this exact element: nothing to do.
  if (selector === currentSelector && overlay && rafId !== null) return;

  let target: Element | null = null;
  try {
    target = document.querySelector(selector);
  } catch {
    target = null;
  }
  if (!target) {
    removeOverlay();
    return;
  }

  stopTracking();
  currentSelector = selector;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  track(target);
}

chrome.runtime.onMessage.addListener((message: ContentMessage) => {
  if (message && message.type === 'HIGHLIGHT') {
    highlight(message.selector);
  } else if (message && message.type === 'CLEAR_HIGHLIGHT') {
    removeOverlay();
  }
});
