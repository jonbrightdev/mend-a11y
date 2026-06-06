// Heading + landmark outline extractor. Injected on demand into the audited tab
// via chrome.scripting.executeScript({ func }), it walks the page once and
// returns a screen-reader-rotor-style picture of the document structure: the
// heading sequence (with skipped levels flagged) and the landmark regions (role
// + accessible name). The panel renders this as an in-panel list, not an on-page
// overlay, so unlike the focus-order and text-spacing helpers nothing is drawn
// into the page and there is nothing to revert.
//
// extractOutlineInPage runs in the extension's ISOLATED world and must be
// self-contained: no imports, no closures over module scope, only a
// JSON-serializable return value. Every helper is defined inside it.

export interface OutlineHeading {
  /** 1-6. */
  level: number;
  /** Trimmed text content; '' for an empty heading. */
  text: string;
  /** CSS selector that locates the heading for highlight/scroll. */
  selector: string;
  /** True when this heading's level jumps more than one past the previous one. */
  skipped: boolean;
}

export interface OutlineLandmark {
  /** ARIA landmark role, e.g. 'navigation', 'main', 'region'. */
  role: string;
  /** Accessible name (aria-labelledby resolved, then aria-label); '' if none. */
  name: string;
  /** Lowercased element tag, e.g. 'nav', 'header'. */
  tag: string;
  /** CSS selector that locates the landmark for highlight/scroll. */
  selector: string;
}

export interface OutlineData {
  headings: OutlineHeading[];
  landmarks: OutlineLandmark[];
  summary: {
    h1Count: number;
    hasSkips: boolean;
    landmarkCount: number;
    mainCount: number;
  };
}

/**
 * Collects the page's headings and landmarks in document order. One combined
 * querySelectorAll, then each element is classified as a heading, a landmark, or
 * skipped. Heading levels come from the tag (or aria-level for role="heading");
 * a level is "skipped" when it is more than one deeper than the previous
 * heading. Landmark mapping follows the HTML-AAM defaults: header/footer are
 * banner/contentinfo only at the top level, and section/form are region/form
 * only when they have an accessible name.
 */
export function extractOutlineInPage(): OutlineData {
  const LANDMARK_ROLES = [
    'banner',
    'navigation',
    'main',
    'complementary',
    'contentinfo',
    'region',
    'form',
    'search',
  ];

  // header/footer are only banner/contentinfo when not scoped by sectioning
  // content. closest() also matches the element itself, but header/footer are
  // not in this list, so only ancestors can match.
  const SECTIONING = 'article,aside,main,nav,section';

  const SELECTOR = [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    '[role="heading"]',
    'header',
    'footer',
    'nav',
    'main',
    'aside',
    'section',
    'form',
    '[role="banner"]',
    '[role="navigation"]',
    '[role="main"]',
    '[role="complementary"]',
    '[role="contentinfo"]',
    '[role="region"]',
    '[role="form"]',
    '[role="search"]',
  ].join(',');

  const esc = (s: string): string => {
    const c = (window as unknown as { CSS?: { escape?: (v: string) => string } }).CSS;
    return c && typeof c.escape === 'function' ? c.escape(s) : s;
  };

  const accName = (el: Element): string => {
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const text = labelledby
        .split(/\s+/)
        .map((id) => {
          const ref = id ? document.getElementById(id) : null;
          return ref ? (ref.textContent ?? '').trim() : '';
        })
        .filter(Boolean)
        .join(' ')
        .trim();
      if (text) return text;
    }
    const label = el.getAttribute('aria-label');
    return label && label.trim() ? label.trim() : '';
  };

  // Selector: an id (anchored) if the element or an ancestor has one, otherwise
  // a stable nth-of-type path up to the nearest id ancestor or the root.
  const cssPath = (el: Element): string => {
    if (el.id) return `#${esc(el.id)}`;
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      if (node.id) {
        parts.unshift(`#${esc(node.id)}`);
        return parts.join(' > ');
      }
      const tag = node.tagName.toLowerCase();
      const parent: Element | null = node.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }
      let nth = 0;
      let found = false;
      const sibs = parent.children;
      for (let i = 0; i < sibs.length; i++) {
        const sib = sibs[i];
        if (!sib) continue;
        if (sib.tagName === node.tagName) {
          nth += 1;
          if (sib === node) {
            found = true;
            break;
          }
        }
      }
      parts.unshift(`${tag}:nth-of-type(${found ? nth : 1})`);
      node = parent;
    }
    return parts.join(' > ');
  };

  const headingLevel = (el: Element): number | null => {
    const tag = el.tagName;
    if (/^H[1-6]$/.test(tag)) return Number(tag.charAt(1));
    const role = (el.getAttribute('role') ?? '').trim().toLowerCase();
    if (role === 'heading') {
      const lvl = parseInt(el.getAttribute('aria-level') ?? '', 10);
      return Number.isNaN(lvl) ? 2 : lvl;
    }
    return null;
  };

  const landmarkRole = (el: Element): string | null => {
    const explicit = (el.getAttribute('role') ?? '').trim().toLowerCase();
    if (explicit) {
      if (!LANDMARK_ROLES.includes(explicit)) return null;
      if ((explicit === 'region' || explicit === 'form') && !accName(el)) return null;
      return explicit;
    }
    switch (el.tagName.toLowerCase()) {
      case 'nav':
        return 'navigation';
      case 'main':
        return 'main';
      case 'aside':
        return 'complementary';
      case 'header':
        return el.closest(SECTIONING) ? null : 'banner';
      case 'footer':
        return el.closest(SECTIONING) ? null : 'contentinfo';
      case 'section':
        return accName(el) ? 'region' : null;
      case 'form':
        return accName(el) ? 'form' : null;
      default:
        return null;
    }
  };

  const headings: OutlineHeading[] = [];
  const landmarks: OutlineLandmark[] = [];
  let prevLevel = 0;

  for (const el of Array.from(document.querySelectorAll(SELECTOR))) {
    const level = headingLevel(el);
    if (level !== null) {
      const skipped = level > prevLevel + 1;
      headings.push({
        level,
        text: (el.textContent ?? '').trim(),
        selector: cssPath(el),
        skipped,
      });
      prevLevel = level;
      continue;
    }
    const role = landmarkRole(el);
    if (role) {
      landmarks.push({
        role,
        name: accName(el),
        tag: el.tagName.toLowerCase(),
        selector: cssPath(el),
      });
    }
  }

  return {
    headings,
    landmarks,
    summary: {
      h1Count: headings.filter((h) => h.level === 1).length,
      hasSkips: headings.some((h) => h.skipped),
      landmarkCount: landmarks.length,
      mainCount: landmarks.filter((l) => l.role === 'main').length,
    },
  };
}
