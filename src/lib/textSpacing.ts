// Text-spacing emulation for WCAG 2.2 SC 1.4.12 (Text Spacing, Level AA).
//
// The criterion requires that content survives, with no clipping, overlap, or
// loss of functionality, when a user overrides text spacing to these minimums:
//   - line height (line spacing): at least 1.5x the font size
//   - spacing after paragraphs:   at least 2x  the font size
//   - letter spacing (tracking):  at least 0.12x the font size
//   - word spacing:               at least 0.16x the font size
// Source: https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html
//
// This is a visual check: there is no automated pass/fail, the developer
// applies the spacing and looks for text that is now cut off or overlapping.
// We inject these as a single !important stylesheet so it overrides the page,
// matching how a user stylesheet or accessibility bookmarklet would behave.
//
// Units: em is relative to each element's own font size, so 0.12em / 0.16em /
// 2em are exactly "times the font size" per element. Unitless 1.5 line-height
// is 1.5x the element's font size and inherits correctly. The page reverts
// completely when the style element is removed; nothing else is mutated.

export const TEXT_SPACING_STYLE_ID = 'mend-text-spacing-1412';

// `* :not(...)` would be safer against icon fonts, but the criterion is about
// the page surviving a blanket override, so we apply broadly and let the
// developer judge. Form controls are included; their reflow matters too.
export const TEXT_SPACING_CSS = [
  '*, *::before, *::after {',
  '  line-height: 1.5 !important;',
  '  letter-spacing: 0.12em !important;',
  '  word-spacing: 0.16em !important;',
  '}',
  'p {',
  '  margin-bottom: 2em !important;',
  '}',
].join('\n');

/**
 * Runs in the page via chrome.scripting.executeScript. Must be self-contained:
 * no imports, no closures over module scope, only serializable arguments.
 * Idempotent: re-applying updates the same style element.
 */
export function applyTextSpacingInPage(css: string, id: string): void {
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    style.setAttribute('data-mend', 'text-spacing');
  }
  style.textContent = css;
  // Append last so its !important rules win cascade order against page styles.
  (document.head ?? document.documentElement).appendChild(style);
}

export function removeTextSpacingInPage(id: string): void {
  document.getElementById(id)?.remove();
}

/** Returns whether the emulation stylesheet is currently present in the page. */
export function isTextSpacingActiveInPage(id: string): boolean {
  return document.getElementById(id) != null;
}
