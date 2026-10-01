# CLAUDE.md

Guidance for Claude (or any agent) working in this repo.

## What this is

Mend is a Manifest V3 Chrome extension (TypeScript + Preact, built with
Vite/crxjs) that audits the active tab for accessibility issues. Three
runtime contexts:

- **Service worker** (`src/background/service-worker.ts`) — orchestrates
  audits, owns settings and the per-tab session cache, routes highlight
  messages.
- **In-page MAIN-world runner + injected helpers** (`src/lib/audit.ts`,
  `highlight.ts`, `textSpacing.ts`, `focusOrder.ts`, `outline.ts`,
  `vision.ts`) — run the engine and page-side checks inside the audited tab.
- **Preact side panel** (`src/sidepanel/`) — the UI the user sees.

## Commands

- `npm` is the package manager. Never use `pnpm` or `yarn`.
- `npm run typecheck` — types only, no emit.
- `npm run build` — typecheck, then production build into `dist/`.
- `npm run test:unit` — chains standalone `tsx` suites; no test framework.
  Each suite is a script that prints `N/N checks passed` and exits non-zero
  on failure.
- `npm run test:smoke` — Puppeteer smoke test; build first (`npm run build`).
- `npm run sync-axe` — re-vendor `public/vendor/axe.js` after bumping
  `axe-core`. Also runs automatically as `postinstall`.

## Invariants

- **Egress**: the only outbound request anywhere in the codebase is the
  user-configured dashboard sync POST to `{dashboardUrl}/api/ingest` in
  `src/lib/sync.ts`, gated on an API key the user typed into settings. No
  telemetry, no analytics, no remote fonts, no other endpoint. Adding any
  other egress is a product decision, not something to slip in as a code
  change.
- The panel must pass its own audit: real semantics, labeled inputs, visible
  focus, and AA contrast in both themes.
- No CSS framework, no UI library, no state library. Hand-written CSS with
  the tokens in `src/styles/panel.css`.
- Never add a `key` field to the manifest. See the comment in
  `manifest.config.ts` and the guard in `scripts/package.mjs` — the Web Store
  rejects updates to a published item that has one.
- Functions injected into the page (`src/lib/highlight.ts` and siblings) must
  stay self-contained: no imports, no closures over module scope, only
  JSON-serializable arguments. See the header comment in
  `src/lib/highlight.ts`.

## Cross-repo contract

The ingest payload sent to the dashboard is duplicated with the
`mend-website` repo and pinned by fixtures in `test/contract/`. The update
protocol lives in `test/contract/README.md`. Never hand-edit the copied
fixtures here — they're owned by that protocol.

## Releasing

`npm run release:patch|minor|major` bumps the version (`preversion` gates on
build + `test:unit`; `postversion` packages the zip via `npm run prod`).
Push with `git push --follow-tags`. The zip is uploaded manually in the
Chrome Web Store dashboard. `SUBMISSION.md` is the disclosure/submission
checklist.

## Plans

`plans/README.md` is the advisor index of implementation plans. Executors
update their plan's status row there when done.
