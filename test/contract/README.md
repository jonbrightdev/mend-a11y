CONTRACT_VERSION: 2

# Ingest payload contract

This is the wire contract between the extension's `buildIngestPayload`
(`mend-a11y/src/lib/sync.ts`) and the portal's `parsePayload`
(`mend-website/src/lib/ingest-payload.ts`). It exists as a versioned,
shared artifact because nothing else mechanically links the two: a field
rename on either side ships green through both repos' CI and only fails
when a real user clicks Save.

## Endpoint

`POST /api/ingest`

- `content-type: application/json`
- `authorization: Bearer <api key>` (or a same-origin session cookie —
  the extension always uses the bearer key, since its request is
  cross-origin and can't carry the site's cookie)
- Body must be ≤ 2,000,000 UTF-16 units.

## Payload

`buildIngestPayload` produces this shape; `parsePayload` validates it.

| field | type | server behaviour |
|---|---|---|
| `url` | string, http(s), ≤ 2000 chars | reject otherwise |
| `pageTitle` | string ≤ 500 chars | optional; falls back to `url`; truncates |
| `startedAt` | epoch ms (number) | reject if > now + 24h or < 2020-01-01 |
| `durationMs` | number | optional; out-of-range (negative, non-finite, or > 1e9) → dropped |
| `totalChecks` | number | optional; out-of-range (negative, non-finite, or > 1e9) → dropped |
| `partial` | boolean | only `=== true` counts as true; the server may also *set* it — see truncation below |
| `rules` | object keyed by ruleId, ≤ 1000 entries | optional (v2); reject if not a plain object, or an entry isn't a plain object |
| `rules[id].impact` / `.category` / `.wcag` / `.title` / `.description` / `.helpUrl` | as the `issues[]` rows below | defaults for every issue with that `ruleId` |
| `issues[]` | array | over 1000 entries → **truncated**, not rejected |
| `issues[].ruleId` | string ≤ 200 chars, non-empty | reject otherwise; never defaultable |
| `issues[].impact` | `critical \| serious \| moderate \| minor` | reject otherwise; defaultable |
| `issues[].title` | string ≤ 500 chars | required (issue or rule); truncates; defaultable |
| `issues[].selector` | string ≤ 2000 chars | required; truncates |
| `issues[].category` | string ≤ 200 chars | optional; truncates; defaultable |
| `issues[].description` | string ≤ 2000 chars | optional; truncates; defaultable |
| `issues[].html` | string ≤ 5000 chars | optional; truncates |
| `issues[].failureSummary` | string ≤ 5000 chars | optional; truncates |
| `issues[].helpUrl` | string ≤ 2000 chars | optional; over-long → dropped (not truncated, to avoid storing a broken link); defaultable |
| `issues[].wcag` | string[] | non-string entries dropped; entries > 200 chars dropped; only the first 25 kept; defaultable |
| `issues[].domOrder` | number, 0..1,000,000 | out-of-range or missing → falls back to the issue's array index |

**The general principle**: identifiers reject (a truncated `ruleId` or
`url` would silently point at the wrong thing), display content truncates
(a real page can hold a legitimately huge element, and losing the tail of
a snippet beats dropping the whole audit).

### Per-rule defaults (`rules`) — new in v2

Six of the `issues[]` fields describe the *rule*, not the element that
broke it, and the server already collapses them per rule when it stores a
run (it reads them off the first issue in each group). A client repeating
them on every issue therefore sends the same strings hundreds of times.
On dailymail.com's homepage — 1,224 issues over ~10 distinct rules — the
`description` field alone was 478 KB of a 1.27 MB body, which is what
made that page unsyncable at the old 1 MB cap.

A **v2** client sends each of those six once, in `rules`, keyed by
`ruleId`, and omits them from the issues. A **v1** client repeats them
per issue and sends no `rules`. Both are accepted, indefinitely: installed
extensions update on the store's schedule and not on ours.

Resolution is per field: **the issue's own value wins**, falling back to
its rule's entry, so a payload carrying both is well-defined rather than
dependent on evaluation order. A field present in neither is treated as
absent, and the usual required/optional rule for that field applies —
so a missing `title` is still rejected, and the error still names the
issue index that needed it.

`ruleId`, `selector`, `html`, `failureSummary` and `domOrder` are
per-element and are never read from `rules`.

### Truncation

`issues[]` over 1000 entries is **truncated to the 1000 most severe**
(impact rank, then `domOrder`) and the stored run is flagged
`partial: true`. It used to be rejected outright with
`400 too many issues (max 1000)`.

Rejecting made a genuinely broken page unauditable rather than partly
auditable: the client had no way to send dailymail.com at all, so the
user got nothing instead of most of it. Truncation follows the same rule
as every other cap here — volume degrades, identifiers reject.

The severity ordering is applied **server-side**, not trusted from the
payload, so both clients lose the same issues: the extension emits
severity order, the monitor scanner emits axe's rule order, and neither
gets to decide what survives. Clients are still expected to trim first
(the extension caps at 1000 before sending); this is the backstop that
makes an untrimmed client degrade instead of fail.

## Idempotency

Duplicate detection keys on `(userId, url, startedAt)` — the server's
`scannedAt` column is `startedAt` interpreted as a `Date`. A second POST
with the same three values for the same authenticated user is treated as
a resend of the same audit, not a new one.

## Responses

| status | body | when |
|---|---|---|
| `201` | `{ auditId, violations, issues, partial }` | new audit stored. `issues` is how many were *stored* (≤ 1000) and `partial` is true when the run has gaps — either the client said so, or the server truncated |
| `200` | `{ duplicate: true }` | same `(user, url, startedAt)` already stored |
| `400` | `{ error }` | body isn't JSON, or fails a `parsePayload` check above |
| `401` | `{ error }` | no valid API key or session |
| `403` | `{ error, code: "AUDIT_CAP" }` | storing this run would exceed the plan's saved-audit limit. **Never** returned for a duplicate `(user, url, startedAt)` — idempotency is checked first, so a resend of an already-stored run is still a `200` even at the cap |
| `413` | `{ error }` | body exceeds 2,000,000 UTF-16 units |
| `429` | `{ error }`, with a `Retry-After` header (seconds) | caller (by user id) exceeded their plan's per-minute rate (60/min on Free, 300/min on Pro) |
| `500` | `{ error }` | unexpected server failure while storing — safe to retry; a successful earlier attempt makes the retry a `200 duplicate` |

The extension shows the `error` string from the body verbatim in its
panel, so wording changes here are user-visible on that side too. That
applies to `403` in particular: its message names the cap and how to
clear it, and must stay readable as-is.

`403 AUDIT_CAP` is the only response that is **not** worth retrying —
the run is well-formed, and it will keep being refused until the user
frees space or upgrades. Every other non-2xx is either a client fix
(`400`/`401`/`413`) or safe to retry (`429` after `Retry-After`, `500`).

### Plan-dependent limits

The rate ceiling and the saved-audit cap come from the caller's plan,
not from a constant, so the same request can succeed for one user and
be refused for another. Free limits are additionally behind a server
env gate (`FREE_LIMITS_ENFORCED`) and are **off** until the billing UI
ships — an unenforced deployment stores audits without a cap. The
extension should treat both limits as server-owned and surface what it
is told, never predicting them client-side.

## The browser handoff (postMessage)

Separate from the wire contract above, and just as unlinked: three
messages passed on `window` between this site's pages and the
extension's content script. Nothing type-checks these across the two
repos — a renamed field silently stops matching, since every listener
filters on shape.

The **"Save audit" funnel** uses all three:

1. The extension's Save button opens `https://app.harpoon.solutions/connect`.
   Harpoon's AuthGuard carries that same safe in-app path through sign-in or
   account creation; no external redirect target is accepted.
2. `/connect` asks for a website project, mints a fresh project-scoped key and
   posts **`MEND_API_KEY`**. Existing Mend keys are never sent to Harpoon.
3. The content script stores the key and immediately `POST`s the pending
   audit to `/api/ingest` with it, then posts **`MEND_AUDIT_SAVED`**.
4. `/connect` reads the row back and moves the user on to the dashboard.

| message | direction | shape |
|---|---|---|
| `MEND_API_KEY` | website → extension | `{ source: "mend-website", type: "MEND_API_KEY", apiKey: string }` |
| `MEND_AUDIT_SAVED` | extension → website | `{ source: "mend-extension", type: "MEND_AUDIT_SAVED" }` |

**Origin discipline.** The website always posts to
`window.location.origin`, never `"*"` — the key is a bearer credential
and a wildcard would hand it to any listener on the page. The website
in turn ignores any inbound message whose `event.origin` isn't its own.

**`MEND_AUDIT_SAVED` is a hint, not data.** It carries no audit: it only
means "go look now". `/connect` still reads the audit back from the
server, so a page script forging the message can at most cause one
extra query against the user's own account. Any field added to it must
stay in that category — nothing this side would render or trust.

**It is also optional.** `/connect` polls for a newly stored audit
regardless, so an extension build that never sends the ack still
completes the funnel; it just takes up to a poll interval longer.
Neither side can assume the other is a matching version.

## Where this is enforced

- **Harpoon**: `apps/api/test/accessibility-ingest.test.ts` asserts the v1/v2
  fixtures, body caps, destination scoping, idempotency and credential lifecycle.
- **mend-a11y**: `test/contract.test.ts` builds the same synthetic audit
  that produced `fixtures/valid/canonical.json` and asserts
  `buildIngestPayload` still produces that exact fixture.

**Update protocol**: change Harpoon's `parseAccessibilityIngestPayload` or
`buildIngestPayload` → update the fixture copies in both repositories → bump
`CONTRACT_VERSION` above if any
previously-accepted shape changed (a new required field, a tightened
cap, a renamed field — not a cap that only got looser).

The `403 AUDIT_CAP` row did **not** bump `CONTRACT_VERSION`: the version
tracks the payload shape, and every payload accepted before is still
accepted and still parsed identically. A new refusal *reason* for an
unchanged payload is not a shape change under the rule above.

**v1 → v2** did bump it, and is worth reading as the example of when to.
Strictly, nothing here got stricter: `rules` is optional, the body cap
got looser, and an over-long `issues[]` degraded from rejection to
truncation, so every v1 payload the server accepted before is still
accepted and still parsed the same way. The bump is for the **other**
direction — a v2 payload sent to a v1 server is rejected with
`issues[0].title must be a string`, because that server knows nothing
about `rules`. The version is what lets each side detect that mismatch
instead of debugging it from a confusing 400.

That makes the rollout order load-bearing: **deploy Harpoon first**,
then ship the extension. The portal accepts both shapes, so it is safe
ahead of the store; the reverse is not. `dashboardUrl` is user-editable,
so a v2 extension can be pointed at a v1 portal (a local checkout, most
likely) — that combination is expected to fail, and the version line in
this file is how it is diagnosed.

## Fixtures

`fixtures/valid/`:
- `canonical.json` — generated from the extension's own
  `buildIngestPayload`, not hand-written, so it is by construction what
  the extension actually sends. **v2**, so it carries a `rules` map.
- `legacy-v1-flat.json` — what `canonical.json` was before v2: every
  per-rule field repeated on each issue, no `rules` key. Kept as a
  fixture, not as history — it is the shape installed extensions still
  send, and it must keep parsing for as long as any of them exist.
- `minimal.json` — only the required fields.
- `at-the-caps.json` — several fields sitting exactly at their limit.
  Also flat, which is the point: the caps apply per issue either way.

`fixtures/invalid/` — one payload per rejection reason, named for the
reason. `too-many-issues.json` is **not** among them and cannot be: an
over-long `issues[]` is truncated rather than rejected as of v2. The
website's test generates a 1001-issue payload inline and asserts the
truncation instead — see the note at the top of that test file.
