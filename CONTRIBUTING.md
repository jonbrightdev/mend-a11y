# Contributing to Mend

Thanks for helping. The most valuable contribution you can make is a docs entry,
so that's what most of this document is about.

## Writing docs entries

The docs corpus is what makes Mend Mend. Anyone can run a scanner; the value we
add is a clear, human explanation of each issue and a real example of the fix.

### How it works

The engine flags roughly 100 rules. For each one, we want a `DocsEntry`: a
fix-first summary, a short plain-language explanation, and at least one
before/after example. Entries live in `src/docs/index.ts`, keyed by the rule id
(`image-alt`, `color-contrast`, and so on).

v1 ships hand-written entries for the most common rules. Everything else falls
back to the scanner's own failure summary, shown with a clear "we haven't
written a guide for this rule yet, the scanner said:" label so users know it
isn't our voice. Adding an entry for a rule replaces that fallback with the real
thing. Picking any rule off the fallback list and documenting it is a perfect
first PR.

### The voice

Write for a working engineer who is mid-task and wants to move on:

- **Lead with the fix.** The first sentence answers "what do I change?" Not
  "WCAG 1.1.1 requires that..."
- **Plain English.** "A screen reader reads out the file name instead of
  anything useful" beats "non-text content lacks a text alternative."
- **Show real code.** Examples are runnable, not pseudocode. `before` is the
  broken version, `after` is the fix.
- **Name the nuance, briefly.** A decorative image takes `alt=""`; a functional
  one describes the action. Don't pretend every case is identical, but don't
  write an essay either.
- **Respect the reader.** No "Great question!", no hedging, no padding. Two or
  three short paragraphs, then code. If you need more, the rule has sub-cases
  that each deserve their own example.

One link, and only one, in `references`: the canonical WCAG criterion. People
who want the formal spec can follow it; everyone else never has to.

### Adding an entry

1. Pick a rule id (from a fallback you saw in the panel, or from the engine's
   rule list upstream).
2. Add a key to the `DOCS` record in `src/docs/index.ts`.
3. Fill in `summary`, `explanation`, `examples`, and a single WCAG `reference`.
4. Run `npm run typecheck`. The issue detail view picks it up automatically;
   there's no wiring to do.

Match the shape and tone of the existing entries. Here's the bar:

```ts
'image-alt': {
  summary: `Add an alt attribute that describes the image, or alt="" if it's purely decorative.`,
  explanation: [
    `A screen reader can't see an image. With no alt attribute, it falls back to reading the file name, so someone hears "logo-final-v2 dot png" instead of "Acme Corp." That's noise, not information.`,
    `The right text depends on the job the image is doing. If it carries meaning, describe the meaning, not the picture. If it's purely decorative, give it alt="" so screen readers skip it. The one thing that's always wrong is leaving the attribute off.`,
  ].join('\n\n'),
  examples: [
    {
      label: 'Informative vs decorative',
      before: '<img src="logo.png">\n<img src="divider.png">',
      after: '<img src="logo.png" alt="Acme Corp">\n<img src="divider.png" alt="">',
    },
  ],
  references: [
    { label: 'WCAG 1.1.1 Non-text Content', url: 'https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html' },
  ],
},
```

## Code contributions

- `npm run typecheck` must pass. The build runs in strict mode with
  `noUncheckedIndexedAccess` and `noUnusedLocals`; treat type errors as build
  failures.
- The extension makes no network requests. Don't add `fetch`, analytics,
  remote fonts, or any outbound call. This is a hard product constraint, not a
  preference.
- The panel must keep passing its own audit: real `<button>`/`<a>` elements,
  labels on inputs, `aria-*` where roles need it, visible focus, and AA
  contrast in both themes.
- No CSS framework, no UI library, no state library. Hand-written CSS with the
  design tokens in `src/styles/panel.css`.

## Reporting bugs

Open an issue with the page you audited (or a minimal reproduction), what you
expected, and what happened. Screenshots of the panel help.

## Code of conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md).
