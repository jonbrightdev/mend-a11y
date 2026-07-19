# Plan 008: Prompt keyless users to create an account after an audit

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, fold a short summary into
> `plans/README.md` (the "What shipped" table) and delete this file, matching
> how plans 001–007 were retired.
>
> **Drift check (run first)**:
> `grep -n "RELAY_DASHBOARD_KEY" src/lib/messages.ts src/background/service-worker.ts src/content/dashboard-key-relay.ts`
> All three must hit. This plan is the conversion funnel that ends in plan
> 007's key relay; if the relay isn't in the tree (committed or staged), land
> 007 first. Then compare the "Current state" excerpts below against the live
> code before proceeding.
>
> **Companion plan**: `../mend-website/plans/047-signup-extension-handoff.md`
> makes the website honor `?from=extension` on `/signup` (post-signup lands on
> `/account`, where key generation broadcasts to the relay). Either half can
> land first: this prompt's CTA opens `/signup?from=extension`, which is a
> valid signup page even before the website honors the param — the user just
> lands on `/dashboard` instead of `/account` and has to click through to
> Account manually. Full effect needs both.

## Status

- **Priority**: P2 — this is the top of the dashboard-adoption funnel
- **Effort**: M
- **Risk**: LOW (UI + one settings field; no new permissions, no new network
  calls, nothing sent anywhere)
- **Depends on**: plan 007 (key relay) present in the tree — see drift check
- **Category**: feature / growth
- **Planned at**: commit `8cfa119` + uncommitted 007 work, 2026-07-19

## Why this matters

The dashboard save funnel today is invisible to the users it needs most.
When no API key is configured, `App.tsx` passes `onSave={undefined}` and the
Save button simply doesn't render — a user who has never heard of the
dashboard finishes an audit and nothing tells them their results *could* be
kept. The only path to discovery is opening Settings and noticing the API key
field.

The rest of the funnel already exists:

1. Website `/signup` is live, free, and explicitly positions the account as
   optional (`../mend-website/src/routes/signup.tsx`).
2. `/account` generates a key and broadcasts it via `postMessage`
   (website plan 035, shipped at `a0f7690`).
3. The extension's content script on `/account` relays that key straight into
   settings (plan 007, in tree).

This plan adds the missing first step: after an audit, when there is no key,
show a small dismissible callout — "create a free account to keep this" — whose
button opens the signup page. Once the user signs up and generates a key, the
relay fills settings automatically, and (with Step 4 below) the open panel
swaps the callout for the real Save button without a reopen. The user never
copies anything.

## Design decisions (made — do not relitigate, but STOP if they prove wrong)

- **Trigger**: prompt renders only on the `results` and `pass` screens, only
  when `!syncConfigured(settings)`, and only when not dismissed. It never
  appears mid-run, on the empty screen, or as a modal/toast.
- **Dismissal is persistent and global**: one click on "No thanks" sets a new
  `Settings.accountPromptDismissed` flag and the prompt never returns (the
  Settings sheet's API key field remains the evergreen path). Non-intrusive
  means the user says no once, not once per tab.
- **CTA target**: `${normalizeDashboardUrl(settings.dashboardUrl)}/signup?from=extension`,
  opened with `chrome.tabs.create`. No new manifest permissions —
  `tabs.create` with a URL needs none.
- **The prompt also renders when a key exists but `dashboardUrl` is invalid**?
  No — `syncConfigured` requires both fields non-empty; a non-empty but
  malformed URL already produces a clear error on Save. Don't special-case it.

## Current state

- `src/lib/types.ts:59-70` — `Settings` ends at `dashboardApiKey: string`.
- `src/lib/storage.ts:3-12` — `DEFAULT_SETTINGS` (spread-merged in
  `getSettings`, so a new boolean field is backward-compatible for free):

```ts
export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  wcagVersion: '2.1',
  conformanceLevel: 'AA',
  thoroughness: 'standard',
  experimentalRules: false,
  highlightStyle: 'overlay',
  dashboardUrl: 'https://mend-a11y.com',
  dashboardApiKey: '',
};
```

- `src/sidepanel/App.tsx:102-117` — settings hydrate **once** on panel open
  (`GET_SETTINGS` inside a mount effect). There is no
  `chrome.storage.onChanged` listener anywhere in the repo (verified by grep),
  so a key relayed in while the panel is open is invisible until reopen.
- `src/sidepanel/App.tsx:436` — `const syncEnabled = syncConfigured(settings);`
- `src/sidepanel/App.tsx:528-545` — `ResultsScreen` and `PassScreen` get
  `onSave={syncEnabled ? () => void saveToDashboard() : undefined}`.
- `src/sidepanel/screens/ResultsScreen.tsx:64-97` — the `results-head` block;
  the Save button renders in `head-actions` only when `onSave` is set.
- `src/sidepanel/screens/PassScreen.tsx:46-63` — same pattern; note the
  `reassure` line already branches copy on `onSave` presence.
- `src/lib/sync.ts:39-48` — `syncConfigured` and `normalizeDashboardUrl`.

## Commands you will need

| Purpose      | Command              | Expected on success |
|--------------|----------------------|---------------------|
| Typecheck    | `npm run typecheck`  | exit 0              |
| Unit tests   | `npm run test:unit`  | all pass            |
| Build        | `npm run build`      | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `src/lib/types.ts` — add `accountPromptDismissed: boolean` to `Settings`
- `src/lib/storage.ts` — add the default (`false`)
- `src/sidepanel/App.tsx` — prompt wiring, `chrome.storage.onChanged` listener
- `src/sidepanel/screens/ResultsScreen.tsx`, `PassScreen.tsx` — render the callout
- `src/sidepanel/components/` — a new small `AccountPrompt` component (or
  inline it if under ~30 lines; your call)
- `src/styles/panel.css` — callout styles, reusing existing tokens
- `test/` — new/extended unit tests
- `plans/README.md` (fold in the summary once done)

**Out of scope** (do NOT touch):
- `manifest.config.ts` — no new permissions; `tabs.create` needs none
- `src/sidepanel/screens/SettingsScreen.tsx` — the manual key field stays
- `src/lib/sync.ts`, `src/content/dashboard-key-relay.ts` — funnel ends, not this step
- `../mend-website` — companion plan, its own session in its own repo

## Git workflow

Commit straight to `main` (repo convention — no branches, no PRs). Match
recent `git log` message style. Do NOT push unless the operator instructed it.

## Steps

### Step 1: Settings field

Add to `Settings` in `src/lib/types.ts`:

```ts
  /** True once the user has dismissed the post-audit "create an account" prompt. */
  accountPromptDismissed: boolean;
```

Add `accountPromptDismissed: false` to `DEFAULT_SETTINGS` in
`src/lib/storage.ts`. The `{ ...DEFAULT_SETTINGS, ...saved }` merge in
`getSettings` makes old stored settings pick it up automatically.

**Verify**: `npm run typecheck` → exit 0 (every `Settings` literal in tests
may need the new field; fix those too).

### Step 2: Prompt component and screen placement

Create the callout (suggested: `src/sidepanel/components/AccountPrompt.tsx`).
Content, tone-matched to the extension's privacy posture:

- One sentence: **"Keep this audit?"** + "Create a free account and save your
  results to a dashboard — only when you choose to."
- Primary action: **"Create free account"** → `onSignup`
- Quiet dismiss: **"No thanks"** (a `btn small`-styled ghost or an `×` with
  `aria-label="Dismiss"`) → `onDismiss`
- Wrap in a container with `role="note"` (it's informative, not an alert).

Placement:
- `ResultsScreen`: directly under the `results-head` block, above `tiles` —
  visible without scrolling, but below the actual results header so results
  stay primary.
- `PassScreen`: where the Save button would render (the `onSave &&` slot),
  since the screen is a centered stage with room.

Wire through props: both screens gain optional `prompt?: { onSignup: () => void; onDismiss: () => void }`,
rendered only when set. In `App.tsx`:

```ts
const showAccountPrompt = !syncEnabled && !settings.accountPromptDismissed;

const openSignup = useCallback(() => {
  const base = normalizeDashboardUrl(settings.dashboardUrl) ?? 'https://mend-a11y.com';
  void chrome.tabs.create({ url: `${base}/signup?from=extension` });
}, [settings.dashboardUrl]);

const dismissPrompt = useCallback(() => {
  updateSettings({ ...settings, accountPromptDismissed: true });
}, [settings, updateSettings]);
```

Pass `prompt={showAccountPrompt ? { onSignup: openSignup, onDismiss: dismissPrompt } : undefined}`
to both screens alongside the existing `onSave`.

Style in `panel.css` with existing tokens (`--ap-*`); keep it visually
quieter than the severity tiles — a bordered card, not a filled banner. Respect
the existing reduced-motion scoping if you animate anything (prefer not to).

**Verify**: `npm run typecheck` → exit 0.

### Step 3: React to the key arriving while the panel is open

In the `App.tsx` mount effect (the one that hydrates settings), add:

```ts
const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
  if (area === 'local' && changes['settings']) {
    void sendToWorker<SettingsResponse>({ type: 'GET_SETTINGS' }).then((s) => {
      if (!cancelled) setSettings(s.settings);
    });
  }
};
chrome.storage.onChanged.addListener(onStorage);
```

and remove the listener in the effect cleanup. Re-fetching via `GET_SETTINGS`
(rather than reading `changes.settings.newValue` raw) keeps the
default-merging in `getSettings` as the single source of truth.

This is what closes the loop: signup tab → key generated on `/account` →
plan 007 relay writes settings → this listener fires → `syncEnabled` flips →
the callout disappears and the Save button appears, live.

Note: `updateSettings` (panel-initiated writes) will also trigger this
listener; the re-fetch returns what was just written, so it's a harmless
no-op re-render. Don't add a guard unless a test proves a real loop.

**Verify**: `npm run typecheck` → exit 0, `npm run build` → exit 0.

### Step 4: Tests

The unit harness is plain `tsx` with no DOM, so test the logic, not the JSX:

1. Extend `test/dashboard-key-relay.test.ts` (it already mocks
   `chrome.storage`): assert `getSettings()` on a stored blob **without**
   `accountPromptDismissed` returns `false` (default merge), and that a blob
   with `accountPromptDismissed: true` survives a `RELAY_DASHBOARD_KEY`
   merge untouched.
2. Assert `syncConfigured` truth table still holds with the new field present
   (guards against someone later folding the dismissal into `syncConfigured`).

If you find yourself wanting jsdom to test the callout's render conditions,
don't add it — the render condition is one boolean expression in `App.tsx`;
cover the pieces (`syncConfigured`, the default) and rely on the manual check.

**Verify**: `npm run test:unit` → all pass.

## Test plan

Automated: Step 4. Manual smoke check (required):

1. Fresh profile (or clear extension storage), run an audit on any page →
   results screen shows the callout; pass screen (audit a clean page, e.g.
   `example.com`) shows it too.
2. Click "Create free account" → a new tab opens at
   `https://mend-a11y.com/signup?from=extension`.
3. With the panel still open, complete signup and generate a key on
   `/account` → back in the panel, the callout is gone and Save appears
   **without reopening the panel**.
4. Fresh storage again; click "No thanks" → callout gone; re-run the audit
   and reopen the panel → still gone.
5. Paste a key manually in Settings (old flow) → callout gone, Save present.
6. Keyboard-only pass over the callout: both actions reachable and labeled;
   screen-reader name for dismiss is meaningful. This is an accessibility
   tool — the prompt itself must pass.

## Done criteria

ALL must hold:

- [ ] `npm run typecheck`, `npm run test:unit`, `npm run build` all exit 0
- [ ] `grep -n "accountPromptDismissed" src/lib/types.ts src/lib/storage.ts src/sidepanel/App.tsx` → all present
- [ ] `grep -n "storage.onChanged" src/sidepanel/App.tsx` → present, with cleanup
- [ ] `grep -n "from=extension" src/sidepanel` → the CTA URL carries the param
- [ ] No `manifest.config.ts` diff (`git diff manifest.config.ts` → empty)
- [ ] Manual smoke checks 1–6 performed and passed
- [ ] `plans/README.md` updated, this file deleted

## STOP conditions

- Plan 007's relay is not in the tree (drift check fails) — land it first.
- `chrome.tabs.create` from the side panel is rejected without a `tabs`
  permission (it should not be — creating a tab with a URL requires none, and
  the panel already calls `chrome.runtime`/`chrome.permissions` directly). If
  Chrome disagrees in practice, report; do not add the `tabs` permission
  unilaterally — it changes the Web Store permission summary.
- The "Current state" excerpts don't match the live code.
- You conclude the prompt as specced is intrusive in practice (e.g. it pushes
  results below the fold at the panel's minimum width) — report with a
  screenshot rather than silently redesigning.

## Maintenance notes

- `?from=extension` is a cross-repo contract with
  `../mend-website/plans/047-signup-extension-handoff.md`: the website uses it
  to route post-signup to `/account` and to attribute extension-driven
  signups. Renaming the param breaks both silently.
- If a "remind me later" (temporary dismissal) is ever wanted, add a separate
  timestamp field rather than overloading `accountPromptDismissed`.
