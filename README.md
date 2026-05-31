# Mend

**Find what's broken on your page, and exactly how to fix it.**

A friendly accessibility auditor for Chrome. Mend scans the active tab against
WCAG, then tells you what's wrong, where it lives, and how to fix it, in plain
language with copy-paste examples.

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![No telemetry](https://img.shields.io/badge/telemetry-none-success)
![Manifest V3](https://img.shields.io/badge/manifest-v3-informational)

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

## Under the hood

Mend is the friendly layer. The rules engine underneath is
[axe-core](https://github.com/dequelabs/axe-core) by Deque Systems, vendored as
a single file and run locally. We keep its name out of the product UI on
purpose, but credit is due: see [NOTICE](./NOTICE) and
[licenses/MPL-2.0.txt](./licenses/MPL-2.0.txt).

## Install

### From the Chrome Web Store

Coming soon.

### From source (unpacked)

```bash
npm install
npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load
unpacked**, and select the `dist/` folder. Click the Mend toolbar button (or
press `Ctrl+Shift+A` / `Cmd+Shift+A`) to open the side panel.

## Development

```bash
npm install      # also vendors the engine via the postinstall hook
npm run dev       # Vite dev server with HMR
```

Load `dist/` unpacked as above. The build is incremental; reload the extension
from `chrome://extensions` after changes to the service worker or content
script. To confirm a reload took effect, bump the version in `package.json` and
check it in the service worker console.

## Build

```bash
npm run build     # typecheck, then production build into dist/
npm run typecheck # types only
npm run sync-axe  # re-copy the vendored engine after a version bump
```

## Testing

```bash
npm run test:unit   # pipeline, timeout, and docs-corpus checks (no browser)
npm run test:smoke  # loads the built extension and checks the panel renders
```

`test:unit` runs three fast suites with `tsx`: the normalization pipeline
(sorting, grouping, settings-to-tags), the audit timeout and watchdog logic, and
a corpus guard that fails if any v1 rule is undocumented or malformed. Build
first, then `test:smoke` loads `dist/` into Chrome via Puppeteer and verifies the
side panel mounts without throwing. CI runs all of this on every push and pull
request (see `.github/workflows/ci.yml`) and uploads the packaged `dist/` as a
build artifact.

## How it works

Three runtime contexts feed a Preact side panel:

- **Service worker** orchestrates audits, owns settings (`chrome.storage.local`)
  and the per-tab session cache (`chrome.storage.session`), and routes
  highlight messages.
- **In-page runner** is injected into the page's main world, runs the engine,
  computes page-position order for the flagged elements, and returns
  JSON-serializable results.
- **Content script** draws the highlight overlay and keeps it glued to the
  target during smooth scroll via a `requestAnimationFrame` loop.

Results are normalized into a single issue model, sorted by severity then page
order, and grouped by rule so twelve contrast failures read as one expandable
row, not twelve.

## Project status

v1 ships hand-written docs for the most common rules; every other rule falls
back to the engine's own summary. Adding a docs entry for a fallback rule is the
single highest-value contribution. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

Mend's own code is licensed under the [MIT License](./LICENSE). The bundled
axe-core engine is licensed separately under the Mozilla Public License 2.0; see
[NOTICE](./NOTICE) for the full third-party breakdown and compliance notes.
