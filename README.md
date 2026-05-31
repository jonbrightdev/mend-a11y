# Mend

**Find what's broken on your page, and exactly how to fix it.**

A friendly accessibility auditor for Chrome. Mend scans the active tab against
WCAG, then tells you what's wrong, where it lives, and how to fix it, in plain
language with copy-paste examples.

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![No telemetry](https://img.shields.io/badge/telemetry-none-success)

## What makes Mend different

- **The fix comes first.** Every issue opens with what to change, not a lecture
  on what's wrong.
- **Plain-language docs, written by hand.** No rule IDs or spec jargon thrown at
  you. Each documented issue has its own explanation and a before/after example.
  Rules we haven't written up yet fall back to the scanner's own wording,
  clearly marked as such, so nothing is ever fabricated.
- **Everything runs on your machine.** No network requests, no accounts, no API
  keys. Your pages and results never leave the browser.
- **It holds itself to the same bar.** The panel is built to pass the same
  accessibility checks it reports: real semantics, keyboard support, visible
  focus, shape-plus-color severity, and AA contrast in both themes.

## Privacy

Mend makes zero outbound network requests. There's no telemetry, no analytics,
nothing remote. The only links in the product are the "Read the formal spec"
links in issue detail, which open the official WCAG page in a new tab when you
click them. Open the network tab during an audit and check for yourself.

## Install

**Chrome Web Store** — coming soon.

## Using Mend

Open Mend from the toolbar button, or press **Ctrl+Shift+A** (**Cmd+Shift+A** on
Mac). Mend audits the page in your active tab and lists issues in the side panel.
Select an issue to see where it is on the page, read the fix, and jump to the
element.

## Coverage

v1 includes hand-written fix guides for the most common rules. Other findings
use clear, scanner-provided summaries until a dedicated guide is added.

## Under the hood

Mend is the friendly layer. The rules engine underneath is
[axe-core](https://github.com/dequelabs/axe-core) by Deque Systems, vendored as
a single file and run locally. We keep its name out of the product UI on
purpose, but credit is due: see [NOTICE](./NOTICE) and
[licenses/MPL-2.0.txt](./licenses/MPL-2.0.txt).

## License

Mend's own code is licensed under the [MIT License](./LICENSE). The bundled
axe-core engine is licensed separately under the Mozilla Public License 2.0; see
[NOTICE](./NOTICE) for the full third-party breakdown and compliance notes.
