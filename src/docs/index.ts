import type { DocsEntry } from '../lib/types';

const wcag = (criterion: string, slug: string): { label: string; url: string } => ({
  label: `WCAG ${criterion}`,
  url: `https://www.w3.org/WAI/WCAG21/Understanding/${slug}.html`,
});

/**
 * Entries are keyed by rule id. Rules without an entry fall back to the
 * scanner's own summary, clearly marked as such. See CONTRIBUTING.md for the
 * voice and how to add one.
 */
export const DOCS: Record<string, DocsEntry> = {
  'image-alt': {
    summary: `Add an alt attribute that describes the image, or alt="" if it's purely decorative.`,
    explanation: [
      `A screen reader can't see an image. With no alt attribute, it falls back to reading the file name, so someone hears "logo-final-v2 dot png" instead of "Acme Corp." That's noise, not information.`,
      `The right text depends on the job the image is doing. If it carries meaning, describe the meaning, not the picture: "Revenue rose 40% in Q3", not "line chart". If it's purely decorative and the page reads fine without it, give it an empty alt="" so screen readers skip it. The one thing that's always wrong is leaving the attribute off, which just leaves the reader guessing.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Informative vs decorative',
        before: '<img src="logo-final-v2.png">\n<img src="swirl-divider.png">',
        after: '<img src="logo-final-v2.png" alt="Acme Corp">\n<img src="swirl-divider.png" alt="">',
      },
      {
        label: 'Image used as a link',
        before: '<a href="/cart"><img src="cart.svg"></a>',
        after: '<a href="/cart"><img src="cart.svg" alt="View cart"></a>',
      },
    ],
    references: [wcag('1.1.1 Non-text Content', 'non-text-content')],
  },

  'color-contrast': {
    summary: 'Increase the contrast between the text and its background until it meets the ratio.',
    explanation: [
      `Low-contrast text is hard to read for anyone in bright light, on a cheap screen, or with reduced vision. The rule asks for a contrast ratio of at least 4.5 to 1 for normal text, and 3 to 1 for large text (roughly 24px, or 19px bold).`,
      `Fixing it usually means darkening the text or lightening the background, not both. Reach for a contrast checker rather than eyeballing it, since the ratio is rarely where you'd guess. Pale grey placeholder text and "subtle" link colors on white are the usual offenders.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Too light, then fixed',
        before: '.note { color: #b9b9b9; background: #ffffff; } /* 1.9:1 */',
        after: '.note { color: #595959; background: #ffffff; } /* 7:1 */',
      },
    ],
    references: [wcag('1.4.3 Contrast (Minimum)', 'contrast-minimum')],
  },

  label: {
    summary: 'Give the input a label so people know what to type and screen readers can announce it.',
    explanation: [
      `A bare input is a mystery to a screen reader: it announces "edit text" with no hint of what it's for. A visible <label> tied to the input fixes that, and as a bonus it makes the label clickable, which gives everyone a bigger target.`,
      `Connect them with for and id. If your design has no room for a visible label, a placeholder is not a substitute (it disappears on focus and fails contrast); use aria-label instead, but a real visible label is almost always better.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Visible label (preferred)',
        before: '<input type="email" placeholder="Email">',
        after: '<label for="email">Email</label>\n<input id="email" type="email">',
      },
      {
        label: 'No visible label by design',
        before: '<input type="search">',
        after: '<input type="search" aria-label="Search products">',
      },
    ],
    references: [wcag('4.1.2 Name, Role, Value', 'name-role-value')],
  },

  'link-name': {
    summary: 'Give the link text that describes where it goes.',
    explanation: [
      `Screen reader users often pull up a list of all links on a page to navigate. A link that reads "click here" or has no text at all (an icon-only link) is useless in that list, since there's no context.`,
      `Put the destination in the link text. If the link is just an icon, add an aria-label, or include visually hidden text. Avoid repeating "read more" across a dozen links; make each one say what it leads to.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Icon-only link',
        before: '<a href="/profile"><svg>...</svg></a>',
        after: '<a href="/profile" aria-label="Your profile"><svg aria-hidden="true">...</svg></a>',
      },
      {
        label: 'Vague text',
        before: '<a href="/report.pdf">Click here</a>',
        after: '<a href="/report.pdf">Download the annual report (PDF)</a>',
      },
    ],
    references: [wcag('2.4.4 Link Purpose', 'link-purpose-in-context')],
  },

  'button-name': {
    summary: 'Give the button text or an accessible label so its purpose is announced.',
    explanation: [
      `A button with no text, common when it's just an icon, gives a screen reader nothing to announce beyond "button". The user has no idea whether it closes, deletes, or submits.`,
      `If the button shows text, you're done. If it's an icon, add an aria-label describing the action, and hide the decorative icon from the accessibility tree with aria-hidden="true".`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Icon button',
        before: '<button><svg>...</svg></button>',
        after: '<button aria-label="Close dialog"><svg aria-hidden="true">...</svg></button>',
      },
    ],
    references: [wcag('4.1.2 Name, Role, Value', 'name-role-value')],
  },

  'heading-order': {
    summary: "Don't skip heading levels; step down one at a time (h2 after h1, not h4).",
    explanation: [
      `Headings are the table of contents a screen reader user navigates by. When levels jump around, the document outline stops making sense, like a book that goes from chapter 1 straight to section 1.3.4.`,
      `Pick heading levels by structure, not by how big you want the text to look. If you need a smaller heading visually, keep the correct level and style it with CSS.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Skipped level',
        before: '<h1>Pricing</h1>\n<h4>Starter plan</h4>',
        after: '<h1>Pricing</h1>\n<h2>Starter plan</h2>',
      },
    ],
    references: [wcag('1.3.1 Info and Relationships', 'info-and-relationships')],
  },

  'empty-heading': {
    summary: 'Either give the heading text, or remove the heading tag.',
    explanation: [
      `An empty <h2> still shows up in the screen reader's heading list, as a blank entry that leads nowhere. It's usually left behind by a layout tweak or an icon that replaced the text.`,
      `If the heading is meaningful, give it words. If it was only there for spacing or an icon, use a <div> with CSS instead so it doesn't pollute the outline.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Empty, then fixed',
        before: '<h2></h2>\n<h2><svg>...</svg></h2>',
        after: '<h2>Latest articles</h2>\n<div class="icon"><svg aria-hidden="true">...</svg></div>',
      },
    ],
    references: [wcag('1.3.1 Info and Relationships', 'info-and-relationships')],
  },

  'html-has-lang': {
    summary: 'Add a lang attribute to the <html> element.',
    explanation: [
      `The lang attribute tells screen readers which language to speak the page in. Without it, a French page might be read aloud with English pronunciation rules, which can be unintelligible.`,
      `Set it once on the root element using a valid code: en for English, en-GB for British English, fr for French, and so on.`,
    ].join('\n\n'),
    examples: [
      {
        before: '<html>',
        after: '<html lang="en">',
      },
    ],
    references: [wcag('3.1.1 Language of Page', 'language-of-page')],
  },

  'document-title': {
    summary: 'Give the page a unique, descriptive <title>.',
    explanation: [
      `The title is the first thing a screen reader announces when a page loads, and it's what labels the browser tab and bookmark. A missing or generic title ("Untitled", "React App") leaves users unsure of where they are.`,
      `Lead with the specific page, then the site: "Checkout - Acme" rather than "Acme - Checkout". Make each page's title distinct.`,
    ].join('\n\n'),
    examples: [
      {
        before: '<title>React App</title>',
        after: '<title>Checkout - Acme</title>',
      },
    ],
    references: [wcag('2.4.2 Page Titled', 'page-titled')],
  },

  region: {
    summary: 'Wrap the main content in landmark regions so users can jump straight to it.',
    explanation: [
      `Screen reader users navigate by landmarks the way sighted users scan a page. When content sits outside any landmark, it can't be reached that way, and the user has to wade through everything linearly.`,
      `Use the semantic elements: <header>, <nav>, <main>, <footer>. At minimum, put the primary content inside a single <main>. These also replace a pile of <div>s with meaning.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Divs, then landmarks',
        before: '<div class="content">\n  <div class="articles">...</div>\n</div>',
        after: '<main>\n  <section class="articles">...</section>\n</main>',
      },
    ],
    references: [wcag('1.3.1 Info and Relationships', 'info-and-relationships')],
  },

  list: {
    summary: 'Put only <li> elements directly inside <ul> and <ol>.',
    explanation: [
      `Screen readers announce "list, 5 items" so users know what they're getting into. That count breaks when something other than an <li> (a stray <div>, or a wrapper) sits directly inside the list.`,
      `Keep the structure clean: the direct children of <ul>/<ol> should be <li> elements. Move wrappers and other markup inside the <li>, not between the list and its items.`,
    ].join('\n\n'),
    examples: [
      {
        before: '<ul>\n  <div class="item">One</div>\n  <div class="item">Two</div>\n</ul>',
        after: '<ul>\n  <li class="item">One</li>\n  <li class="item">Two</li>\n</ul>',
      },
    ],
    references: [wcag('1.3.1 Info and Relationships', 'info-and-relationships')],
  },

  listitem: {
    summary: "Wrap the <li> in a <ul> or <ol> so it's recognized as a list item.",
    explanation: [
      `An <li> that isn't directly inside a <ul> or <ol> has no list to belong to. Screen readers may not announce it as a list item at all, and the "list, 3 items" context that helps users orient is lost.`,
      `The fix is structural: make sure every <li> has a <ul> or <ol> as its direct parent. This usually creeps in when a wrapper element lands between the list and its items, or when an <li> gets used on its own for its bullet styling. If you only want the look, style a different element instead.`,
    ].join('\n\n'),
    examples: [
      {
        before: '<div class="menu">\n  <li>Home</li>\n  <li>About</li>\n</div>',
        after: '<ul class="menu">\n  <li>Home</li>\n  <li>About</li>\n</ul>',
      },
    ],
    references: [wcag('1.3.1 Info and Relationships', 'info-and-relationships')],
  },

  'nested-interactive': {
    summary: "Pull the inner control out so interactive elements aren't nested inside each other.",
    explanation: [
      `Putting one interactive element inside another, like a <button> inside an <a>, or a checkbox inside a button, confuses both the browser and assistive tech. Screen readers can't tell which control they're on, and keyboard focus and activation become unpredictable.`,
      `Keep one interactive element per control. If two actions need to sit near each other, make them siblings rather than nesting them. A common offender is a clickable card (a link) that also holds a button; split them so neither lives inside the other.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Button inside a link',
        before: '<a href="/post/1">\n  Read post\n  <button>Save</button>\n</a>',
        after: '<div class="card">\n  <a href="/post/1">Read post</a>\n  <button>Save</button>\n</div>',
      },
    ],
    references: [wcag('4.1.2 Name, Role, Value', 'name-role-value')],
  },

  'landmark-one-main': {
    summary: "Wrap the page's primary content in a single <main> element.",
    explanation: [
      `Screen reader users jump straight to the main content with a "skip to main" shortcut that targets the <main> landmark. With no <main>, that shortcut has nowhere to go, so they have to tab past the header and navigation on every page.`,
      `Give the page exactly one <main>, around the primary content but not the header, nav, or footer. One per page is the rule: zero leaves users without the shortcut, and more than one makes "the main content" ambiguous.`,
    ].join('\n\n'),
    examples: [
      {
        before: '<body>\n  <header>...</header>\n  <div id="content">...</div>\n</body>',
        after: '<body>\n  <header>...</header>\n  <main>...</main>\n</body>',
      },
    ],
    references: [wcag('1.3.1 Info and Relationships', 'info-and-relationships')],
  },

  'aria-required-attr': {
    summary: "Add the ARIA attributes that the element's role requires.",
    explanation: [
      `Some ARIA roles are incomplete without certain attributes. A role="checkbox" with no aria-checked, or a role="slider" with no aria-valuenow, leaves a screen reader unable to announce the control's state, so the user can't tell whether the box is ticked or where the slider sits.`,
      `When you take on a role, add the attributes it depends on, and keep them current as the state changes. Often the simpler fix is to use the native element (<input type="checkbox">), which carries all of this for free, rather than rebuilding it with ARIA.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Custom checkbox',
        before: '<div role="checkbox">Subscribe</div>',
        after: '<div role="checkbox" aria-checked="false" tabindex="0">Subscribe</div>',
      },
    ],
    references: [wcag('4.1.2 Name, Role, Value', 'name-role-value')],
  },

  'aria-valid-attr-value': {
    summary: 'Correct the ARIA attribute value so it matches what the attribute expects.',
    explanation: [
      `ARIA attributes have defined value types: a set of allowed tokens, a true/false, or a reference to another element's id. When the value doesn't fit, assistive tech ignores it, so the information you meant to convey silently disappears. A frequent case is aria-labelledby pointing at an id that doesn't exist.`,
      `Check two things: that the value is the right type for that attribute, and that any id you reference actually exists and is spelled the same. A mistyped id is the difference between a labeled control and an unlabeled one.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Broken label reference',
        before: '<span id="lbl">Email</span>\n<input aria-labelledby="label">',
        after: '<span id="lbl">Email</span>\n<input aria-labelledby="lbl">',
      },
    ],
    references: [wcag('4.1.2 Name, Role, Value', 'name-role-value')],
  },

  'duplicate-id': {
    summary: 'Make every id on the page unique so references resolve to the right element.',
    explanation: [
      `When two elements share an id, anything that points at it, a <label for>, an aria-labelledby, an aria-describedby, or an in-page link, resolves to only the first match. The second element silently gets the wrong association or none at all.`,
      `Give each element its own id. This tends to slip in through copy-pasted components or repeated templates, so it's worth checking anywhere the same markup renders more than once on a page.`,
    ].join('\n\n'),
    examples: [
      {
        before:
          '<label for="name">First</label>\n<input id="name">\n<label for="name">Last</label>\n<input id="name">',
        after:
          '<label for="first">First</label>\n<input id="first">\n<label for="last">Last</label>\n<input id="last">',
      },
    ],
    references: [wcag('4.1.2 Name, Role, Value', 'name-role-value')],
  },

  'meta-viewport': {
    summary: 'Remove user-scalable=no (and any low maximum-scale) so people can zoom the page.',
    explanation: [
      `A viewport meta tag with user-scalable=no, or a maximum-scale of 1, stops people pinch-zooming. Anyone who relies on magnification to read small text is locked out, which hurts most on the small screens where zoom matters.`,
      `Let users scale the page. Keep width=device-width, drop user-scalable=no, and don't cap maximum-scale below 2. If the layout breaks when zoomed, that's a responsive-design fix, not a reason to disable zoom.`,
    ].join('\n\n'),
    examples: [
      {
        before: '<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">',
        after: '<meta name="viewport" content="width=device-width, initial-scale=1">',
      },
    ],
    references: [wcag('1.4.4 Resize Text', 'resize-text')],
  },

  'frame-title': {
    summary: 'Add a title attribute to the <iframe> describing what it contains.',
    explanation: [
      `Screen reader users can pull up a list of frames to move between them, the same way they do with links and headings. A frame with no title shows up as "frame" with no hint of what's inside, so an embedded video, map, or form is just an unlabeled box.`,
      `Give each iframe a short, specific title saying what it holds. If a frame is genuinely empty or purely decorative and carries no content, removing it is better than titling it.`,
    ].join('\n\n'),
    examples: [
      {
        before: '<iframe src="/map"></iframe>',
        after: '<iframe src="/map" title="Map of our office location"></iframe>',
      },
    ],
    references: [wcag('4.1.2 Name, Role, Value', 'name-role-value')],
  },

  tabindex: {
    summary: 'Remove positive tabindex values and let the DOM order define focus order.',
    explanation: [
      `A tabindex above 0 yanks an element to the front of the tab sequence, ahead of everything with tabindex 0 or none. A single positive value reorders the whole page's keyboard navigation, and it almost never matches the visual order, so keyboard users end up jumping around unpredictably.`,
      `Use tabindex="0" to make a custom element focusable in its natural place, and tabindex="-1" to make something focusable only from script. If the tab order is wrong, fix it by reordering the DOM, not by assigning positive values.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Positive tabindex, then fixed',
        before: '<input tabindex="3">\n<input tabindex="1">\n<input tabindex="2">',
        after: '<input>\n<input>\n<input>',
      },
    ],
    references: [wcag('2.4.3 Focus Order', 'focus-order')],
  },
};
