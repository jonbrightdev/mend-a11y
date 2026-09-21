# Chrome Web Store submission — Mend by Harpoon

Everything needed to publish Mend to the Chrome Web Store. Work top to bottom;
the checkboxes track what's done.

Reflects the v0.5.x permission model: `activeTab` + `scripting` + `storage` +
`sidePanel`, plus an **optional, opt-in** `<all_urls>` host permission. There is
no required `host_permissions`, so the extension installs with no broad-access
warning.

---

## Before you submit (validation)

- [ ] Push to GitHub and confirm CI is green (first real run of the Puppeteer
      smoke test).
- [ ] Run Lighthouse's accessibility audit on the side panel itself and get it
      to 100. This is the one core promise that has never been measured. Open
      the panel, open DevTools against it, run the Accessibility category.
- [ ] Test on several real sites (a docs site, an SPA, a form-heavy page) and
      confirm: single-tab audit works; the opt-in "audit any tab" flow grants
      and then audits without per-tab clicks; the Settings "Access all sites"
      toggle both grants and revokes; the highlight overlay disappears when the
      panel closes.
- [ ] Capture screenshots of real audits while testing (you need these below).

## Registration

- [ ] Register at the Chrome Web Store Developer Dashboard
      (https://chrome.google.com/webstore/devconsole) and pay the one-time
      $5 USD fee (covers up to 20 extensions).
- [ ] Use a dedicated Google account, not your personal one. A ban on the
      account takes its extensions with it.

## Build and package

For a new version, a bump does the whole thing. `npm version` requires a clean
working tree, so commit your changes first.

- [ ] `npm version patch` (or `minor` / `major`). This runs a production build
      and the unit tests first (preversion), so a broken tree is never tagged;
      then bumps `package.json` and the lockfile, commits, and tags `vX.Y.Z` to
      match the existing tags; then rebuilds at the new version and writes
      `mend-a11y-<version>.zip` to the repo root (postversion). The manifest
      version derives from `package.json`, so it follows automatically.
- [ ] `git push --follow-tags` to publish the commit and its tag.
- [ ] Upload that zip in the dashboard. Note: Chrome assigns its own production
      extension id and ignores the `key` field in the manifest; that's expected.

To rebuild the upload zip without bumping (a clean reinstall, or a build-only
fix), run `npm ci` then `npm run prod`. The package step puts `manifest.json` at
the zip root, refuses to ship a `key` field or a version that drifts from
`package.json`, and excludes source maps.

---

## Listing fields (paste-ready)

### Single purpose description

> Mend by Harpoon audits the web page in the active tab for accessibility (WCAG) issues and
> explains how to fix each one. It runs entirely on the user's device.

### Category

Developer Tools

### Description

> Mend by Harpoon finds accessibility issues on the page you're testing and tells you
> exactly how to fix them.
>
> Open the side panel, click Run audit, and Mend by Harpoon scans the active tab against
> WCAG. Issues are grouped by rule and sorted by severity, then by where they
> appear on the page. Each one opens with the fix first, in plain language, with
> a copy-paste before-and-after example. Click Highlight on page to see the
> exact element.
>
> Audits run entirely on your device and no account is required. Optionally,
> connect a free Harpoon account and choose a website project. Your audit results save to
> that project so you can track fixes over time — nothing is sent
> anywhere unless you set that up, and auto-save can be turned off in settings.
>
> Free and open source.

### Graphics

- [ ] Store icon 128x128 (already in the repo at `public/icons/`).
- [ ] At least one screenshot, 1280x800 or 640x400 (up to five). Use real audits.
- [ ] Optional small promo tile 440x280.
- [ ] Optional marquee 1400x560.

---

## Privacy practices tab

### Permission justifications

- **activeTab** — Mend audits the page only on the tab where the user actively
  invokes it, and only when they click Run audit. activeTab grants temporary
  access to that single tab on a user action, with no standing access to any
  website.
- **scripting** — Mend injects its audit engine into the page to analyze it
  locally, and injects a temporary highlight box when the user clicks Highlight
  on page. Required to run the analysis in the page being tested.
- **storage** — Mend saves the user's settings locally and caches the most
  recent audit per tab for the session. Nothing is transmitted off the device
  unless the user connects a dashboard account (below).
- **sidePanel** — Mend's entire interface is a side panel; this permission lets
  the extension open and display it.
- **content script on `https://app.harpoon.solutions/connect*`**, plus the
  temporary `mend-a11y.com/account*` and `/connect*` overlap paths — Runs only
  on first-party pages that hand out a connection key. It relays that key into
  extension settings so the user does not have to copy/paste it. It reads
  nothing else and runs nowhere else. The legacy matches are removed after the
  reconnect window in Plan 159.
- **optional host permission (`<all_urls>`)** — Optional and opt-in only. The
  user can choose to grant access to all sites so they can audit several tabs
  without re-invoking Mend on each one. It is requested at runtime with an
  explicit Chrome consent prompt, is not required to use Mend on a single tab,
  and is used solely to run the same local accessibility analysis.

### Data use

- [ ] Declare **Website content** collection: when (and only when) the user
      connects a Harpoon website project, finished audits upload to that
      project. An upload contains the audited page's URL and
      title, timing, and each issue found (rule, severity, WCAG references,
      selector, a truncated HTML snippet of the failing element). Auto-save
      can be turned off in settings, in which case audits are sent only when
      the user presses Save on a result. With no account connected, nothing is
      ever transmitted.
- [ ] Declare no other data types collected (no browsing history beyond the
      audited page's URL in an upload, no personal communications, no
      location, no telemetry).
- [ ] Certify: do not sell or transfer user data to third parties.
- [ ] Certify: do not use or transfer data for purposes unrelated to the single
      purpose.
- [ ] Certify: do not use or transfer data for creditworthiness or lending.

Everything here must match the privacy policy and the extension's actual
behavior, or the listing can be removed. The default remains local-only: with
no account connected, Mend collects nothing.

### Privacy policy URL

- [ ] Host the Privacy page from the Mend marketing site and paste its URL here.
      Required because activeTab and the optional host permission are
      data-access permissions.

Policy summary (full text lives on the marketing site): Mend reads page content
only when invoked, only to analyze it locally; stores settings and a
per-session audit cache on-device; makes no network requests and collects
nothing unless the user connects a Mend account, in which case audit results
upload to that user's own dashboard (automatically, or manually via Save if
auto-save is off); uses no third parties.

---

## Submit and review

- [ ] Submit for review.
- [ ] Expect automatic review plus a manual pass. Because broad host access is
      reachable (even though opt-in), review may sit slightly above a
      pure-activeTab extension, but more favorably than a required `<all_urls>`
      one. Plan for days, not minutes.

## After approval

- [ ] Push the release tag if you have not already (`git push --follow-tags`),
      and attach the `mend-a11y-<version>.zip` to the GitHub release.
- [ ] Add the published Chrome Web Store URL to `README.md` and the marketing
      site's "Add to Chrome" button.
