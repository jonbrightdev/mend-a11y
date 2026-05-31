import type { JSX } from 'preact';

/**
 * Pip, the Mend inspector. SVG artwork from the Mend design, used as drawn.
 * His body fill is parchment and strokes are the rust accent, so he reads well
 * on the dark side panel without recoloring. Decorative wrapper variants
 * (`float`) respect prefers-reduced-motion via CSS.
 */
export function Pip({ class: className, ...rest }: JSX.SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      class={`pip${className ? ` ${className}` : ''}`}
      viewBox="0 0 260 280"
      role="img"
      aria-labelledby="pipTitle pipDesc"
      {...rest}
    >
      <title id="pipTitle">Pip, the Mend inspector</title>
      <desc id="pipDesc">
        A small round character with big round glasses, holding a clipboard with a checklist.
      </desc>
      <g fill="#f8f1e3" stroke="#c4502c" stroke-width="5" stroke-linejoin="round">
        <ellipse cx="106" cy="252" rx="21" ry="13" />
        <ellipse cx="156" cy="252" rx="21" ry="13" />
      </g>
      <path
        d="M130 56 C 196 56 218 104 218 152 C 218 214 182 252 130 252 C 78 252 42 214 42 152 C 42 104 64 56 130 56 Z"
        fill="#f8f1e3"
        stroke="#c4502c"
        stroke-width="5"
        stroke-linejoin="round"
      />
      <g fill="none" stroke="#c4502c" stroke-width="5" stroke-linecap="round">
        <path d="M126 60 q 4 -20 22 -16" />
        <path d="M138 58 q 14 -10 26 -2" />
      </g>
      <g fill="#c4502c" opacity=".18">
        <circle cx="80" cy="148" r="12" />
        <circle cx="180" cy="148" r="12" />
      </g>
      <g fill="#ffffff" stroke="#c4502c" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="101" cy="120" r="30" />
        <circle cx="159" cy="120" r="30" />
      </g>
      <g fill="none" stroke="#c4502c" stroke-width="5" stroke-linecap="round">
        <path d="M128 116 q 2 -7 4 0" />
        <path d="M72 116 L 56 110" />
        <path d="M188 116 L 204 110" />
      </g>
      <g fill="#1d1a14">
        <circle cx="103" cy="124" r="7.5" />
        <circle cx="157" cy="124" r="7.5" />
      </g>
      <g fill="#ffffff">
        <circle cx="106" cy="121" r="2.4" />
        <circle cx="160" cy="121" r="2.4" />
      </g>
      <path d="M112 158 q 18 18 36 0" fill="none" stroke="#1d1a14" stroke-width="4.5" stroke-linecap="round" />
      <path d="M52 178 q -16 16 -6 34" fill="none" stroke="#c4502c" stroke-width="5" stroke-linecap="round" />
      <g transform="rotate(9 192 168)">
        <rect x="152" y="116" width="80" height="104" rx="11" fill="#ffffff" stroke="#c4502c" stroke-width="5" />
        <rect x="178" y="108" width="28" height="16" rx="5" fill="#f8f1e3" stroke="#c4502c" stroke-width="5" />
        <g stroke-linecap="round" stroke-linejoin="round" fill="none">
          <path d="M163 146 l 6 6 l 11 -13" stroke="#c4502c" stroke-width="4" />
          <path d="M163 172 l 6 6 l 11 -13" stroke="#c4502c" stroke-width="4" />
          <path d="M163 198 l 6 6 l 11 -13" stroke="#c4502c" stroke-width="4" />
        </g>
        <g stroke="#d6cdb6" stroke-width="5" stroke-linecap="round">
          <path d="M188 148 L 218 148" />
          <path d="M188 174 L 218 174" />
          <path d="M188 200 L 214 200" />
        </g>
      </g>
      <path d="M196 192 q 18 8 22 -6" fill="none" stroke="#c4502c" stroke-width="5" stroke-linecap="round" />
    </svg>
  );
}
