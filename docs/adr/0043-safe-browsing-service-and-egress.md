# ADR-0043: Safe Browsing service & egress — direct to Google Safe Browsing v5, on by default, one settings switch to turn it off

- **Status:** Accepted (egress decision ratified; the local hash-prefix core, the `SafeBrowsingProvider` gate, the on-disk prefix store, the SB v5 full-hash + prefix-list clients incl. Rice-Golomb decoding, the refresh scheduler, the `SafeBrowsingService`, the `will-navigate` check + interstitial, the `DownloadTrustProvider` and the Settings switch are all shipped and unit-tested — the feature is **inert** pending a Google Safe Browsing API key as a release input; see Consequences)
- **Date:** 2026-09-01
- **Completes:** [ADR-0040](0040-download-trust-model.md) § 5 (the `DownloadTrustProvider` seam) · **refines** [ADR-0006](0006-policy-kernel-hitl.md) (deterministic Policy Kernel + HITL) · **accounts to** [ADR-0011](0011-vpn-network-privacy.md) (fail-closed kill switch — Safe Browsing is a named app-level egress)
- **Phase:** [Phase 1a — Walking-Skeleton MVP](../../phases/product/phase-1a-walking-skeleton-mvp.md) (minimal safe-browsing core) · [Phase 2c — Classic Browser Essentials & Downloads](../../phases/product/phase-2c-classic-browser-essentials.md), L10

## Context

The Safe Browsing v5 **local** half is done and its privacy property is structural, not promised:
`checkUrl(url, db)` in [`safe-browsing.ts`](../../packages/security-policy/src/safe-browsing.ts) takes
no transport and canonicalizes + hashes + truncates locally against Google's own spec vectors;
`resolveVerdict`'s fetcher is typed to receive four-byte prefixes and nothing else. What does **not**
exist: a service that holds a live prefix database, a scheduler that refreshes it, a client that
performs step 4 (full-hash resolution), a navigation-time check, and — from
[ADR-0040](0040-download-trust-model.md) § 5 — a real `DownloadTrustProvider` (today's
`unknownTrustProvider` returns `unknown` for every download, so nothing is ever auto-`blocked`).

Both phase DoDs above are held open by this. The open question is not the algorithm — it is **where
step 4's request egresses**. A four-byte prefix leaks far less than a URL (thousands of unrelated
URLs share each bucket), but it still goes to *someone*, and this product does not add a silent
third-party feed.

## Decision

**Full-hash resolution goes directly to the Google Safe Browsing v5 endpoint from the main process.
The protection is on by default and there is exactly one user control: a Settings switch that turns
the whole feature off. With it off, no prefix database is fetched, no request is made, and downloads
settle `unknown` exactly as they do today.**

### 1. One service in the main process

A `SafeBrowsingService` (new, in `apps/desktop/src/main` — Electron-bound; the pure parts stay in
`@tepegoz/security-policy`) owns four responsibilities and nothing else:

- **Prefix database** — a local, on-disk set of four-byte hash prefixes, refreshed on a bounded
  cadence (delta updates where the API offers them; a full refresh floor otherwise). Storage is a
  plain file under `userData`, not the SQLite journal — it is a cache, not an auditable fact.
- **Full-hash resolution** — `resolveVerdict`'s `FullHashFetcher`, implemented as an HTTPS call to
  Google Safe Browsing v5. The request carries the prefixes and the API key **only**: a bare client,
  **no cookies, no session, no `User-Agent` beyond a fixed product string, no identifiers**. The
  comparison stays local (`resolveVerdict` already does this).
- **Navigation check** — consulted on `will-navigate` / `will-redirect` for top-level http(s)
  navigations. A confirmed `unsafe` verdict shows a full-page interstitial with a category and a
  "go back" default; "proceed anyway" is a HITL confirm, journaled. `unknown` (offline, timeout,
  feature off) does **not** block — it fails open for navigation, because a hard block on every
  lookup failure would make the browser unusable offline.
- **Download-trust provider** — the `DownloadTrustProvider` from ADR-0040 § 5, checking the
  download's **source URL / origin**. `unsafe` → `blocked`; anything else → `unknown` (unchanged).
  This is the only place a Safe Browsing verdict is allowed to be *fail-closed*, because a blocked
  download is recoverable (the release gate) and a hostile file is not.

### 2. The Settings switch is the disclosure

`Privacy & security` gains **"Safe Browsing protection"**, a boolean, **on by default**, persisted in
`@tepegoz/preferences` (new key; en + tr strings in the owning package, ADR-0016). Its help text
states plainly that the feature contacts Google Safe Browsing. When it is **off**:

- the refresh scheduler does not run and any on-disk prefix DB is left to go stale (not deleted —
  turning it back on should not re-download from zero if a recent copy exists);
- `resolveVerdict` is never called; there is no network activity attributable to this feature;
- the navigation check is skipped; the download-trust provider returns `unknown` for everything —
  i.e. the exact behaviour shipping today.

There is **no** per-site, per-category, or "standard vs enhanced" tiering in v1. One switch.

### 3. Egress accounting (ADR-0011)

Safe Browsing traffic is an **app-level** egress, not tab traffic: it is not bound to any tab's
VPN / Tor route and does not appear on a route badge. But it is **named** — the kill switch's
`mayEgress` gate applies at the app scope, so when global egress is blocked, full-hash resolution
fails to `unknown` like any other offline case (§ 1). The threat model doc gains a row for this feed:
what leaves (prefixes + API key), to whom (Google), how often (refresh cadence + on cache-miss
navigations), and the switch that stops it.

### 4. The API key

Safe Browsing v5 requires a Google API key. This is a **free-tier API key** — a distinct dependency
KIND from the AI program's model-token spend (no model budget clears it) and from downloaded model
weights. The key is a build/release input, not a user secret: it ships in the app config, is not
per-user, and grants nothing but Safe Browsing list access. It is **not** stored in the credential
vault.

## Alternatives considered

- **Relay through a tepegöz-operated proxy.** Rejected for v1. It removes the direct Google
  dependency from the client but needs the Phase 3 backend to exist, adds infrastructure we must run
  and keep available, and inserts a party (us) that sees prefix traffic tied to an app instance —
  a worse privacy story than Google's k-anonymity, not a better one, unless the proxy is itself
  blinded, which is a research project. Revisit when the managed backend ships.
- **Bundled prefix list, no step 4 at all.** Rejected as the default, kept as the *degraded* mode.
  A prefix hit with no full-hash resolution must escalate straight to a warning, so every four-byte
  collision (common by design) becomes a false-positive interstitial. Staleness is bounded only by
  how often we ship an app update. This is effectively what "switch off" leaves you with minus the
  warnings, and it is not good enough to be the on-by-default experience.
- **Content-hash / download reputation** (Chrome's proprietary download-protection service).
  Out of scope, consistent with [ADR-0040](0040-download-trust-model.md): the public Safe Browsing
  API does not offer it and standing up our own is not a v1 bet.
- **Fail-closed navigation on `unknown`.** Rejected — it makes the browser unusable offline or when
  Google is unreachable. `unknown` blocks nothing on navigation; only a *confirmed* `unsafe` does.

## Consequences

**Positive.** One service, one settings switch, and the `DownloadTrustProvider` seam already exists
from ADR-0040 — wiring it changes one injected object, no call sites. The privacy property of the
local half is unchanged and still structural. The two phase DoD lines (1a "the network half",
2c "hash-checked against Safe Browsing") have a ratified design to build against.

**Negative / accepted.** The app gains a default-on network dependency on Google. A user who turns
the switch off loses navigation protection **and** download blocking together — there is no partial
mode — and the honest framing in the help text may lead some users to do exactly that. The API key
is a release-process dependency that must be provisioned before either phase line can be ticked.

**Shipped (2026-09-01, all unit-tested, feature inert):** `SafeBrowsingProvider` (the fail-open
navigation gate / fail-closed download gate, `enabled()` read every call); the on-disk `PrefixStore`
(I/O-injected, corrupt-file-as-absent, `null`-DB-as-`unknown`); the SB v5 `hashes:search` full-hash
client and `hashList` prefix-list client (bare injected `fetch`, prefixes + key only, no cookies,
`null` with no key); `SafeBrowsingRefreshScheduler` (immediate on first launch, 6 h cadence, capped
exponential backoff, idles while the switch is off); `SafeBrowsingService` composing all of it;
`SafeBrowsingNavGuard` + the `will-navigate` wiring + the self-contained `data:` interstitial with a
sentinel-fragment "proceed anyway"; the `DownloadTrustProvider` into `DownloadService.init()`; the
`safeBrowsingEnabled` preference (default on, `private`) and its Privacy & security toggle (en + tr).
Tests assert no URL / no cookie crosses the fetch boundary, `unknown` never blocks a navigation, and
the switch-off / no-key states start no scheduler and make no request.

**Owed, and stated rather than implied.** (1) **The Google Safe Browsing API key** — a release
input; until it is provisioned the full-hash and prefix-list fetchers are `null`, the scheduler never
starts, `database()` stays `null`, and every check resolves `unknown` (nothing blocked). (2) ~~Rice
decoding~~ — **done** (`decodeRiceDeltas` + the compressed `additionsFourBytes` branch in
`parseHashListResponse`). **Delta application against a stored list version** — still owed;
`parseHashListResponse` returns the additions only, so the scheduler does a full replace each refresh.
(3) The exact v5 list names, endpoints and wire shapes are marked in-code for verification against
current Google documentation. (4) ~~The threat-model row~~ — **done** (`docs/threat-model.md`, the
top-threats table + a residual-risk bullet). (5) An explicit
app-scope kill-switch gate — today an SB fetch on a tunnelled general binding whose pool is down
already fails closed at the network layer (no `DIRECT` fallback) → the fetcher throws → `unknown`,
which is the intended outcome; a dedicated `mayEgress`-style check is not separately coded.
