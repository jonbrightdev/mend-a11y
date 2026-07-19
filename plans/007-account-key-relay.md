# Plan 007: Relay the dashboard API key from the account page via a content script

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, fold a short summary into
> `plans/README.md` (the "What shipped" table) and delete this file, matching
> how plans 001–006 were retired.
>
> **Drift check (run first)**: `git diff --stat 8cfa119..HEAD -- manifest.config.ts src/lib/messages.ts src/lib/storage.ts src/background/service-worker.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding.
>
> **Companion plan**: this is the extension half of a two-repo feature. The
> website half — `../mend-website` broadcasting the key via
> `window.postMessage` right after generating it — is
> `../mend-website/plans/035-extension-key-postmessage.md`. Either half can
> land first: this listener is inert until the website broadcasts, and the
> website's broadcast is a no-op (postMessage with no listener) until this
> listener exists. You do not need the other repo's plan to land first, but
> read it if you want to see the exact message this listens for — it is
> reproduced below anyway, so you don't strictly need to.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW-MEDIUM (adds the extension's first standing content script;
  see "Why this needs a decision, not just code" below)
- **Depends on**: none (this repo only)
- **Category**: feature
- **Planned at**: commit `8cfa119`, 2026-07-18

## Why this matters

Today, connecting the extension to the dashboard requires the user to:
1. Generate a key on the website's `/account` page (shown once, plaintext).
2. Copy it.
3. Open the extension's side panel → Settings.
4. Paste it into the "Dashboard API key" field.

The website is adding (or has added — check the companion plan's status) a
`window.postMessage` broadcast of the freshly generated key, scoped to its own
origin, immediately after generating it
(`../mend-website/src/components/AccountClient.tsx`, `onGenerate`). This plan
adds the other end: a content script on the account page that receives that
message and stores the key directly, so steps 2–4 disappear for anyone with
the extension already installed.

## Why this needs a decision, not just code

`manifest.config.ts` currently has **no `content_scripts` entry at all**, and
says so deliberately:

```ts
// No host_permissions. Mend uses activeTab, so it has access to a page only
// when the user invokes it, and never any standing access to any site.
permissions: ['activeTab', 'scripting', 'storage', 'sidePanel'],
```

A `content_scripts` entry with a `matches` pattern is itself a form of standing
host access — Chrome grants it at install (or update) without a runtime
prompt, and it will appear in the Web Store listing's permission summary even
though it is scoped to exactly one origin (our own dashboard, not "sites you
visit"). That's a materially smaller grant than `<all_urls>`, and arguably
defensible for "the extension talks to its own companion site," but it is a
one-line-comment claim ("never any standing access to any site") going from
true to "true except our own domain" — worth being deliberate about, not
sneaking in as a side effect of a UX nicety.

**This plan proceeds on the assumption that scoping the content script to only
the dashboard's own origin is an acceptable exception.** If you disagree once
you're looking at the real manifest and Web Store listing implications, STOP
and raise it rather than shipping it — this is a judgment call about the
extension's stated privacy posture, not a bug to fix.

## Current state

Relevant files:

- `manifest.config.ts` — no `content_scripts` key present at all today (see
  the full file below).
- `src/lib/messages.ts` — the `PanelMessage` discriminated union and
  `sendToWorker` helper; today only the side panel sends these.
- `src/lib/storage.ts` — `getSettings()`/`setSettings()`, single
  `chrome.storage.local` key `'settings'`.
- `src/lib/types.ts:59-70` — `Settings`, including `dashboardUrl` (default
  `'https://mend-a11y.com'`) and `dashboardApiKey` (default `''`).
- `src/background/service-worker.ts:159-166` — the single
  `chrome.runtime.onMessage` listener, dispatching via `handleMessage()`.

`manifest.config.ts` today (full file):

```ts
import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'Mend: Accessibility Audit',
  version: pkg.version,
  description: 'Find accessibility issues on the active page and learn how to fix them.',
  permissions: ['activeTab', 'scripting', 'storage', 'sidePanel'],
  optional_host_permissions: ['<all_urls>'],
  icons: {
    '16': 'public/icons/icon-16.png',
    '32': 'public/icons/icon-32.png',
    '48': 'public/icons/icon-48.png',
    '128': 'public/icons/icon-128.png',
  },
  action: {
    default_title: 'Open Mend',
    default_icon: { '16': 'public/icons/icon-16.png', '32': 'public/icons/icon-32.png' },
  },
  side_panel: { default_path: 'src/sidepanel/index.html' },
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  commands: {
    _execute_action: {
      suggested_key: { default: 'Ctrl+Shift+A', mac: 'Command+Shift+A' },
      description: 'Open the Mend side panel',
    },
  },
  web_accessible_resources: [
    { matches: ['<all_urls>'], resources: ['vendor/axe.min.js'], use_dynamic_url: false },
  ],
});
```

`src/lib/messages.ts` today — the union and helper this plan extends:

```ts
export type PanelMessage =
  | { type: 'RUN_AUDIT'; tabId: number }
  // ...existing variants...
  | { type: 'SAVE_TO_DASHBOARD'; tabId: number };

export async function sendToWorker<T>(message: PanelMessage): Promise<T> {
  return (await chrome.runtime.sendMessage(message)) as T;
}
```

`src/background/service-worker.ts:159-166` today:

```ts
chrome.runtime.onMessage.addListener((message: PanelMessage, _sender, sendResponse) => {
  void handleMessage(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
  return true; // keep the channel open for the async response
});
```

`src/lib/storage.ts:17-24` today (why a new handler must merge, not overwrite):

```ts
export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const saved = stored[SETTINGS_KEY] as Partial<Settings> | undefined;
  const merged = { ...DEFAULT_SETTINGS, ...saved };
  if (!merged.dashboardUrl.trim()) merged.dashboardUrl = DEFAULT_SETTINGS.dashboardUrl;
  return merged;
}
```

**The exact message the website broadcasts** (from the companion plan, so you
don't need to cross-reference it):

```ts
window.postMessage(
  { source: "mend-website", type: "MEND_API_KEY", apiKey: key },
  window.location.origin,
);
```

## Commands you will need

| Purpose      | Command              | Expected on success |
|--------------|-----------------------|----------------------|
| Typecheck    | `npm run typecheck`  | exit 0               |
| Unit tests   | `npm run test:unit`  | all pass             |
| Build        | `npm run build`      | exit 0               |

## Scope

**In scope** (the only files you should modify):
- `manifest.config.ts`
- `src/lib/messages.ts`
- `src/background/service-worker.ts`
- `src/lib/storage.ts` (only if you need a small helper; prefer reusing
  `getSettings`/`setSettings` as-is)
- A new content script file, e.g. `src/content/dashboard-key-relay.ts`
- `test/` — a new unit test for the new message handler
- `plans/README.md` (fold in the summary once done, per the retirement
  convention)

**Out of scope** (do NOT touch, even though it looks related):
- `src/sidepanel/screens/SettingsScreen.tsx` — the manual paste field stays as
  the fallback; do not remove it or change its UI.
- `src/lib/sync.ts` — how the key is *used* against `/api/ingest` is unchanged;
  this plan only changes how the key gets *into* storage.
- `../mend-website` — the companion plan, executed as its own session in its
  own repo. Do not attempt to edit it from here.
- `optional_host_permissions: ['<all_urls>']` — unrelated, opt-in, leave as-is.

## Git workflow

- Match this repo's existing conventions (check recent `git log` for message
  style before committing).
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Add the content script to the manifest

In `manifest.config.ts`, add a `content_scripts` entry scoped to the
dashboard's own account page. Use the production `dashboardUrl` default
(`https://mend-a11y.com`) as the match pattern, and update the comment above
`permissions` so it no longer overclaims:

```ts
  // No host_permissions beyond one narrow content script (below). Mend uses
  // activeTab for the page it's invoked on, and never has standing access to
  // any site the user browses — except its own companion dashboard, where a
  // content script relays a freshly generated API key into extension storage
  // so the user doesn't have to copy/paste it. That script runs only on the
  // dashboard's own account page and does nothing else.
  permissions: ['activeTab', 'scripting', 'storage', 'sidePanel'],
  content_scripts: [
    {
      matches: ['https://mend-a11y.com/account*'],
      js: ['src/content/dashboard-key-relay.ts'],
      run_at: 'document_idle',
    },
  ],
```

**STOP condition**: if `https://mend-a11y.com` is not actually the production
website's real domain (check `../mend-website` for a canonical prod URL, e.g.
in its README, deploy config, or ask the operator) — do not guess a second
pattern. Report and confirm the domain before proceeding; a wrong `matches`
value silently means the feature never fires in production.

**Verify**: `npm run typecheck` → exit 0 (manifest config is typed).

### Step 2: Extend the message union and background handler

In `src/lib/messages.ts`, add a variant carrying the relayed key:

```ts
export type PanelMessage =
  | { type: 'RUN_AUDIT'; tabId: number }
  // ...existing variants unchanged...
  | { type: 'SAVE_TO_DASHBOARD'; tabId: number }
  | { type: 'RELAY_DASHBOARD_KEY'; apiKey: string };
```

In `src/background/service-worker.ts`, add a case in `handleMessage`. Merge
into existing settings (never overwrite the whole object), and also adopt the
sender's origin as `dashboardUrl` — the content script only runs on the real
dashboard origin, so this keeps a self-hosted or staging deployment working
without the user separately re-typing the URL:

```ts
chrome.runtime.onMessage.addListener(
  (message: PanelMessage, sender, sendResponse) => {
    void handleMessage(message, sender)
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  },
);

async function handleMessage(message: PanelMessage, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    // ...existing cases unchanged...
    case 'RELAY_DASHBOARD_KEY': {
      const settings = await getSettings();
      const origin = sender.origin ?? settings.dashboardUrl;
      await setSettings({ ...settings, dashboardApiKey: message.apiKey, dashboardUrl: origin });
      return { ok: true };
    }
  }
}
```

Adjust `handleMessage`'s existing call sites/signature only as needed for the
added `sender` parameter — do not restructure unrelated cases.

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Write the content script

Create `src/content/dashboard-key-relay.ts`:

```ts
// Runs only on the dashboard's own account page (see manifest.config.ts's
// content_scripts match). Listens for the API key the page broadcasts right
// after generating one, and relays it into extension storage so the user
// doesn't have to copy/paste it into Settings.
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data as unknown;
  if (
    typeof data !== 'object' ||
    data === null ||
    (data as Record<string, unknown>).source !== 'mend-website' ||
    (data as Record<string, unknown>).type !== 'MEND_API_KEY'
  ) {
    return;
  }
  const apiKey = (data as Record<string, unknown>).apiKey;
  if (typeof apiKey !== 'string' || !apiKey) return;

  chrome.runtime.sendMessage({ type: 'RELAY_DASHBOARD_KEY', apiKey }).catch((e: unknown) => {
    console.warn('[mend] key relay failed', e);
  });
});
```

**Verify**: `npm run typecheck` → exit 0, `npm run build` → exit 0 (confirms
crxjs picks up the new content script file without a separate manifest
listing beyond Step 1's `js` entry).

### Step 4: Tests

Add `test/dashboard-key-relay.test.ts` (or extend an existing background/
message-handling test file if one already covers `handleMessage`) following
this repo's plain-`tsx` test style (see `test/sync.test.ts` for the pattern
of mocking `chrome.*` APIs). Cover:

1. `RELAY_DASHBOARD_KEY` merges `apiKey` into settings without clobbering other
   fields (seed settings with a non-default `theme`/`wcagVersion`, send the
   message, assert those fields survive alongside the new `dashboardApiKey`).
2. `dashboardUrl` is set from `sender.origin` when provided.
3. The content-script listener (if testable outside a real DOM/jsdom — check
   what harness `test:unit` actually runs under; if it's plain Node with no
   DOM, this part may only be exercisable via `test:smoke`'s puppeteer flow,
   in which case note that in the test plan rather than forcing a Node-only
   test to simulate a browser `MessageEvent`) ignores messages from the wrong
   origin and wrong `source`/`type` shape.

**Verify**: `npm run test:unit` → all pass including new tests.

## Test plan

Covered in Step 4. Manual smoke check (do this even if automated coverage is
partial): install the unpacked extension, open the real (or local dev) account
page at the matched origin, generate a key, and confirm Settings → "Dashboard
API key" populates without pasting anything. Then confirm a key generated on
a *different* origin (not matching `content_scripts.matches`) does nothing —
the manual paste flow must still work unaffected.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run test:unit` exits 0, including new tests
- [ ] `npm run build` exits 0
- [ ] `grep -n "content_scripts" manifest.config.ts` → present, `matches`
      scoped to the dashboard origin only (never `<all_urls>` or a bare `*`)
- [ ] `grep -n "RELAY_DASHBOARD_KEY" src/lib/messages.ts src/background/service-worker.ts` → both present
- [ ] The new handler calls `getSettings()` then `setSettings({ ...settings, ... })`
      — never a raw `chrome.storage.local.set` that could drop other fields
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] Manual smoke check from "Test plan" performed and passed
- [ ] `plans/README.md` updated with a one-row summary, and this file deleted,
      per the retirement convention

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts.
- The production dashboard domain isn't confirmably `https://mend-a11y.com`
  (see Step 1's STOP condition) — do not guess.
- `npm run test:unit`'s harness (plain `tsx` running files directly) can't
  meaningfully simulate `window.addEventListener('message', ...)` without a
  real DOM — report what coverage is actually achievable rather than forcing
  a fake DOM shim into a repo that doesn't otherwise use one.
- You conclude the content-script/manifest privacy trade-off in "Why this
  needs a decision, not just code" should NOT be made unilaterally — stop and
  raise it instead of shipping around it (e.g. by using a broader `matches`
  "to be safe," or by silently dropping the manifest comment update).

## Maintenance notes

- The message shape `{ source: "mend-website", type: "MEND_API_KEY", apiKey }`
  is a cross-repo contract with
  `../mend-website/plans/035-extension-key-postmessage.md`. If either side's
  field names change, the relay silently stops matching — there's no shared
  type between repos to catch this at compile time, only the manual smoke
  check.
- If the dashboard is ever served from more than one origin (e.g. a staging
  environment users are expected to connect to), `content_scripts.matches` is
  a static list in the manifest — add each additional origin explicitly rather
  than trying to pattern-match broadly; broadening the match is exactly the
  privacy trade-off this plan was careful about.
