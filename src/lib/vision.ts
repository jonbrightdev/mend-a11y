// Vision-deficiency simulation. Injected on demand into the audited tab via
// chrome.scripting.executeScript({ func }), it applies a whole-page SVG filter
// that approximates how the page looks to someone with a color-vision deficiency
// or low vision, then removes it again. Like the focus-order and text-spacing
// helpers this is a manual visual aid, not an automated verdict: it shows what a
// page might look like, it does not decide whether anything passes.
//
// The injected functions run in the extension's ISOLATED world and must be
// self-contained: no imports, no closures over module scope, only
// JSON-serializable arguments. The filter markup is built here, in module scope
// (so it is unit-testable), and passed in as strings.
//
// Colour model. The dichromacy matrices are Machado, Oliveira & Fernandes (2009)
// at full severity, the same family Chrome DevTools uses, which is more
// defensible for an accessibility tool than the older approximations. They model
// the deficiency in linear light, so the colour-vision filters are evaluated
// with color-interpolation-filters="linearRGB" (the browser linearises sRGB,
// applies the matrix, then re-encodes). The low-vision blur is evaluated in
// sRGB, where a Gaussian reads as natural defocus rather than the bright bloom
// linear-light blurring produces.

export type VisionMode =
  | 'protanopia'
  | 'deuteranopia'
  | 'tritanopia'
  | 'achromatopsia'
  | 'lowVision';

/** The <filter> element's id, referenced by the injected style. */
export const VISION_FILTER_ID = 'mend-vision';
/** The injected <svg> container that holds the filter. */
export const VISION_DEFS_ID = 'mend-vision-defs';
/** The injected <style> that applies the filter to the document root. */
export const VISION_STYLE_ID = 'mend-vision-style';

export const VISION_MODES: VisionMode[] = [
  'protanopia',
  'deuteranopia',
  'tritanopia',
  'achromatopsia',
  'lowVision',
];

export const VISION_LABELS: Record<VisionMode, string> = {
  protanopia: 'Protanopia (red-blind)',
  deuteranopia: 'Deuteranopia (green-blind)',
  tritanopia: 'Tritanopia (blue-blind)',
  achromatopsia: 'Achromatopsia (no colour)',
  lowVision: 'Low vision (blur and reduced contrast)',
};

type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

// Row-major 3x3 RGB transforms. Achromatopsia uses the Rec. 709 linear-luminance
// weights (correct in the linearRGB pipeline above).
const MATRICES: Record<Exclude<VisionMode, 'lowVision'>, Mat3> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
  achromatopsia: [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722],
};

/** Expand a 3x3 RGB matrix to the 20-value feColorMatrix string (identity alpha). */
function toFeMatrix(m: Mat3): string {
  return [
    m[0], m[1], m[2], 0, 0,
    m[3], m[4], m[5], 0, 0,
    m[6], m[7], m[8], 0, 0,
    0, 0, 0, 1, 0,
  ].join(' ');
}

function filterFor(mode: VisionMode): string {
  if (mode === 'lowVision') {
    // Defocus plus a mild contrast reduction (compress [0,1] toward mid-grey).
    return (
      `<filter id="${VISION_FILTER_ID}" color-interpolation-filters="sRGB">` +
      `<feGaussianBlur stdDeviation="2.2"/>` +
      `<feComponentTransfer>` +
      `<feFuncR type="linear" slope="0.85" intercept="0.075"/>` +
      `<feFuncG type="linear" slope="0.85" intercept="0.075"/>` +
      `<feFuncB type="linear" slope="0.85" intercept="0.075"/>` +
      `</feComponentTransfer>` +
      `</filter>`
    );
  }
  return (
    `<filter id="${VISION_FILTER_ID}" color-interpolation-filters="linearRGB">` +
    `<feColorMatrix type="matrix" values="${toFeMatrix(MATRICES[mode])}"/>` +
    `</filter>`
  );
}

/**
 * The serializable inputs for a mode: the hidden SVG (containing the filter) and
 * the CSS that points the document root at it. Built here and passed to the
 * injected function so the page-side code stays generic.
 */
export function visionMarkup(mode: VisionMode): { svg: string; css: string } {
  return {
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" ` +
      `style="position:absolute;width:0;height:0;overflow:hidden;pointer-events:none">` +
      `${filterFor(mode)}</svg>`,
    css: `:root{filter:url(#${VISION_FILTER_ID}) !important}`,
  };
}

/**
 * Inserts the filter defs and the root-level style. Idempotent: any previous
 * Mend vision filter is removed first. Applying the filter to the document root
 * is a deliberate trade-off; it can establish a containing block that affects
 * position: fixed / sticky elements, which is why the panel flags this as an aid.
 */
export function applyVisionInPage(
  svgHtml: string,
  css: string,
  defsId: string,
  styleId: string,
): void {
  document.getElementById(defsId)?.remove();
  document.getElementById(styleId)?.remove();

  const holder = document.createElement('div');
  holder.innerHTML = svgHtml;
  const svg = holder.firstElementChild;
  if (svg) {
    svg.id = defsId;
    document.documentElement.appendChild(svg);
  }

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = css;
  (document.head ?? document.documentElement).appendChild(style);
}

export function removeVisionInPage(defsId: string, styleId: string): void {
  document.getElementById(defsId)?.remove();
  document.getElementById(styleId)?.remove();
}

/** Whether a Mend vision filter is currently applied to the page. */
export function isVisionActiveInPage(styleId: string): boolean {
  return document.getElementById(styleId) != null;
}
