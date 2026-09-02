# Phase 2 — Integration Adapters + Safe-Browsing Suite

**Status:** 🟡 In progress (ExecutionRouter + per-site data clearing landed 2026-08-19) · **Estimate:** ~4–6 months · **Depends on:** Phase 1b
**Goal:** Complete real daily tasks end-to-end (official-API first) + add daily-driver trust foundations
(adblock, scam protection, cookie editor). **Stays local-first; no managed backend.**

## Exit criteria (DoD)

- [ ] At least Gmail + Drive + Calendar adapters work end-to-end via official API; Canva via MCP
- [ ] Adblock + Safe Browsing + AgentThreatShield active; cookie editor works
- [ ] Cookie isolation + fingerprinting protection + per-site data clearing active; WebAuthn/passkey + built-in password manager work (agent access OFF)
- [ ] Adapter health-check + version-pinning + regression suite exist; security re-evaluated on browser fallback
- [ ] **i18n:** en+tr keys added for new surfaces (adapter consent/scope screens, safe-browsing settings, cookie editor, cookie-isolation/fingerprint toggles, password manager/passkey UI)
- [ ] Coverage + self-review + UAT signoff + migration-safe

## Tasks

### L6 — Integration Adapter Layer (extra requirement #5)

- [~] `IntegrationAdapter` dual-backend: `ApiBackend` (official REST/SDK, **preferred**) + `BrowserBackend` (logged-in WebContentsView fallback) _(down-payment shipped: shared `AdaptorConnection` inventory model covers `mcp`, `rest`, `graphql`, `oauth_service`, and `local` adaptors with auth kind, permission scopes, state, tool count, and audit-required metadata; Settings surfaces them under one Adaptors panel. Real REST/GraphQL/OAuth adapter execution remains pending.)_
- [x] `ExecutionRouter`: **Official API > Browser-automation** (deterministic; decision+reason to event-log); on fallback the security class (read→state-changing) is re-evaluated
      _(landed: [execution-router.ts](../../packages/security-policy/src/execution-router.ts). Pure and deterministic — no model, no clock, no network. Falling back escalates the risk class because the two paths are **not** two ways of doing one thing: an API call has a declared scope and a revocable token, a browser fallback has the user's whole session and none. Even a READ escalates, since a browser read navigates a logged-in session. It also REFUSES when there is neither an adaptor nor a page, rather than guessing at one. **Not wired to a caller yet** — no adapter executes through it, because no REST/OAuth adapter exists to execute.)_
- [ ] `Credential Vault` + OAuth Broker: Authorization Code + **PKCE**, least-scope, refresh rotation, per-profile isolation, DPAPI/safeStorage + AES-256-GCM; **OAuth token never raw-visible to the agent**
- [ ] Reference adapters: **Google package** (Gmail read/draft/**send=HITL**, Drive→blob, Calendar) single OAuth client
- [ ] **Canva = existing remote MCP** (`mcp__claude_ai_Canva__*`) — do NOT write a custom adapter (MCP-vs-adapter criterion → ADR)
- [ ] Adapter **health-check + version-pinning + regression suite**; large output (Drive/Gmail thread) → CAS + reference+summary
- [ ] **Lightweight site-guidance adapters for the long tail this layer will never write a full adapter
      for.** A different concept from the OAuth-backed adapters above and deliberately so: no OAuth, no
      official API, no credential — just a matched-domain block of **user- or contributor-authored** prompt
      guidance ("on this site the search box is X; confirm before Y") injected into the existing
      system-prompt assembly. WebBrain ships 58+ of these against this layer's ~4 services. Two hard rules,
      both load-bearing: the text is **never model-generated and never derived from page content** (it is a
      trusted-text surface, so page content can never become one), and **guidance informs, it does not
      grant** — an adapter can say "ask before X", it can never waive a Policy Kernel `ask`/`deny`, which
      holds by construction because the Kernel never reads prompt content. Same trust tier as the standing
      rules in [phase-1b](phase-1b-agentic-deepening.md) L8. Captured, not scheduled:
      [`../tracks/webbrain-agent-parity.md`](../../docs/parities/webbrain-agent-parity.md) P4.
- [~] each adapter registered to L5 Capability Plane as a ToolProvider (same gateway/permission/audit) _(down-payment shipped: MCP and local/native tool providers are projected into the same Adaptors inventory; `@tepegoz/web-tools` registers web search/get-page through ToolGateway/PolicyKernel. Future REST/GraphQL/OAuth adapters consume the same model.)_

### L10 — Safe-Browsing Suite (extra requirement #8)

- [ ] `NetworkFilterEngine`: `@ghostery/adblocker-electron` (EasyList/EasyPrivacy → DNR + cosmetic, **per-partition**) — **NO system-proxy MITM**
- [ ] `SafeBrowsingService` full: Google Safe Browsing v5 Update API (local hash-prefix) + community blocklist
- [ ] `AgentThreatShield`: **local SLM** (landed in Phase 1b) scam/phishing scoring + egress anomaly → on high risk agent-lockout + HITL; anti-blabbering
- [ ] `PopupAndPermissionGuard`: `setWindowOpenHandler` + background open; single policy-engine (no parallel permission flow)
- [ ] 🔴 **DEFECT IN SHIPPED CODE — no destination validation on agent-driven outbound fetch.**
      `web_get_page`/`web_search` dispatch whatever URL the model supplies (or a page supplies, through
      indirect prompt injection — "visit this URL for more detail") through `@tepegoz/http`'s
      `createHttpClient` with **no check that the resolved host isn't loopback, RFC1918, link-local, or
      `169.254.169.254` cloud-metadata**, and `fetchPage` sets no redirect limit, so a redirect into a LAN
      host is followed unchecked. An agent told to fetch `http://169.254.169.254/latest/meta-data` succeeds
      today. **Found independently by two tracks reading two different rivals**, which is why it is written
      here as a defect rather than a proposal. The fix:
  - [ ] One pure, obfuscation-resistant classifier next to `egress-route.ts` — canonicalize
        decimal/octal/hex/short-form IPv4 and `::ffff:`-mapped IPv6 **before** matching, since all of those
        are equivalent to the caller but not to a naive string-prefix check. Reject loopback / RFC1918 /
        link-local (`169.254.0.0/16`, `fe80:`) / cloud-metadata / `::1` / `fc00::/7`.
  - [ ] Check the **resolved IP at connection time, then connect to that literal IP** — not the hostname at
        URL-parse time. This specific ordering is what defeats DNS rebinding; a TTL-0 answer can otherwise
        swap the target between the check and the connect.
  - [ ] Enforce at `createHttpClient` itself — its own docblock already calls it "the ONE outbound-HTTP seam
        for the whole app" — so `web-tools`, MCP HTTP transports and any future skill-declared endpoint are
        covered **by construction**, not one patched call site at a time.
  - [ ] Re-validate every redirect hop, cap the chain, and drop rather than follow into a private target.
        `sitemap-reader.ts` already has the right instinct locally (`maxRedirects: 0` with a comment saying
        why) — generalize it instead of leaving it a one-file workaround.
  - [ ] Pairs with the Egress Firewall Rust port in [phase-1b](phase-1b-agentic-deepening.md) L7 (same seam,
        different concern: that one governs _what data leaves_, this one governs _what destination is
        reachable at all_). Sources:
        [`../tracks/browserless-agent-parity.md`](../../docs/parities/browserless-agent-parity.md) P1 and
        [`../tracks/librechat-agent-parity.md`](../../docs/parities/librechat-agent-parity.md) P2.
- [ ] **Third-party cookie isolation (Total-Cookie-Protection style)**: per-site state partitioning on top of Chromium's partition mechanism (consistent with **per-partition** adblock above); Firefox TCP as reference — **ADR required** (partition scope per-context vs. per-site; must NOT break logged-in adapter/`BrowserBackend` sessions)
- [ ] **Fingerprinting protection**: noise on canvas/WebGL/font/audio entropy + `navigator` surface reduction; **per-site toggle** (strict/standard) for breakage — **ADR required** (scope + determinism/replay impact; agent's own automation runs `standard`, observations recorded per ADR-0004)

#### Fingerprinting protection — component detail and the measurement gate

> **Where this came from.** [`../../docs/research/research-fingerprinting.md`](../../docs/research/research-fingerprinting.md)
> (component-by-component analysis with a prioritized mitigation table: effort × user impact × effectiveness)
> and [`../../docs/research/research-brave.md`](../../docs/research/research-brave.md), where
> per-session fingerprint randomization is named as Brave's differentiator against Chrome and Firefox. This
> expands the one-line task above; the ADR it already demands is where the posture gets decided.
>
> **The ADR's first question is a fork, and half of each answer is worse than either:**
> **homogenization** (Tor Browser — everyone looks identical, one large anonymity set, sites break) versus
> **farbling** (Brave — per-(site, session) randomization that stays stable _within_ a site, so pages keep
> working while cross-site linking fails). The `strict`/`standard` toggle in the task above implies the second;
> the ADR must say so explicitly, name the breakage it accepts, and define the escape hatch.
>
> **Why this project has an unusual stake in it:** an agentic browser is the worst case for fingerprinting.
> Automation makes a profile _more_ distinctive, not less — which is why the existing task pins the agent's own
> runs to `standard`, and why the determinism/replay impact is called out: noise that changes per run collides
> with the Event Journal's promise that a run can be replayed.
>
> **It is not actually a binary fork — there is a stated preference order, and it argues against leading with
> noise.** W3C's own anti-fingerprinting guidance, and Firefox's practice, put **normalize / null / partition
> ahead of randomization**: first shrink the entropy budget (standardize or simply refuse to answer a
> high-entropy query, and partition what must be answered), and only then add controlled noise where a value
> genuinely cannot be normalized. Randomization is the weaker default because **inconsistency is itself a
> signal** — a profile whose canvas hash disagrees with its own GPU string is not anonymous, it is unusual.
> The task above currently opens with "noise on canvas/WebGL/font/audio entropy"; the ADR should either
> re-order that deliberately or record why farbling wins here. Two techniques that belong on the normalize
> side and are not yet listed anywhere in this phase: **window/screen-size bucketing** (Tor Browser's
> letterboxing — screen dimensions are high-entropy and cheap to bucket) and **language/`Accept-Language`
> list narrowing**. Source:
> [`../../docs/research/research-vpn-security.md`](../../docs/research/research-vpn-security.md) §WebRTC/ECH/QUIC and
> [`../../docs/research/research-tor-browser.md`](../../docs/research/research-tor-browser.md);
> Brave's farbling is re-read as a **counter-example** in
> [`../../docs/research/research-brave.md`](../../docs/research/research-brave.md).

Component priorities, taken from the report's own table (high effectiveness first, breakage noted):

- [ ] **Canvas + WebGL readback noise** on `getImageData` / `toDataURL`, deterministic per (site, session);
      masked `UNMASKED_VENDOR_WEBGL` / `UNMASKED_RENDERER_WEBGL` — high effectiveness, moderate breakage risk
- [ ] **Font enumeration whitelist** instead of the installed set — the single highest-entropy signal on a
      typical Windows install, and low user impact
- [ ] **Hardware signal quantization** — `deviceMemory` and `hardwareConcurrency` to coarse buckets
- [ ] **`performance.now()` precision reduction** — cheapest item on the table, removes a whole class of
      timing probes, negligible breakage
- [ ] **Header surface** — `Accept-Language` / UA / client-hints reduced consistently with the User-Agent
      switcher extension, so the two cannot contradict each other (a mismatch is itself a signal)
- [ ] **Sensor and media-device surface** — permission-gated rather than freely enumerable
- [ ] **Storage partitioning** is the same work as the third-party cookie isolation task above — one
      implementation, not two
- [ ] **Measurement gate — blocking for any claim.** Cover Your Tracks / AmIUnique entropy **in bits, measured
      before and after** on a fixed profile, recorded in the results ledger. The report's own bar is a **≥30%
      reduction**; anything shipped without that number is a claim, not a feature. Add a Playwright assertion
      that canvas hashes **differ across sites and stay stable within one** — the property that separates
      farbling from plain randomness, and the one most likely to regress silently

#### Fingerprinting — the signals this project adds to the user (cross-profile evidence)

> **Where this came from.** [`../../docs/research/research-cross-profile-tracking.md`](../../docs/research/research-cross-profile-tracking.md)
> — a study of why a separate browser profile and a private window do **not** separate identity. Its
> transferable finding is not the list of surfaces above; it is that **a browser can make its own users
> more identifiable**, and that several of Tepegöz's design choices do exactly that. This block is the
> self-inflicted half of the problem, and it is the half no competitor's research covers for us.

- [ ] **Measure the fingerprint our own extensions add.** Extension detection via observable in-page
      side effects and execution traces is established in the literature, and Tepegöz **injects nine
      first-party extensions** — a bundle nobody else on the web has. That combination is close to a
      unique identifier, and it is one we shipped. Measure the delta with all extensions off, one on,
      and all on. If the delta is large, injection has to become conditional (inject where the extension
      is actually needed, not on every page) rather than ambient
- [ ] **The User-Agent switcher must not increase entropy.** An extension that reports Safari on macOS
      while canvas, WebGL, fonts and timing all say Chromium-on-Windows produces an **inconsistent**
      surface, and inconsistency is itself a strong signal — a fingerprint that does not add up is rarer
      than an honest one. Either the switcher changes the whole coherent set or it warns, in the
      extension's own UI, that it is making the user more identifiable, not less
- [ ] **Electron is already a narrow anonymity set.** State it in the ADR: this browser is not Chrome and
      cannot pretend to be one at the level these techniques operate. Any homogenization target is
      "indistinguishable among Tepegöz users", never "indistinguishable among Chrome users", and the
      user-facing copy must not imply otherwise
- [ ] **Document the ceiling instead of promising past it.** GPU-stack timing methods distinguish
      near-identical devices from ordinary JavaScript, so masking the WebGL vendor string does not close
      that surface. The ADR names what the chosen posture **cannot** reach, so that the measured entropy
      drop is read as an improvement rather than as anonymity
- [ ] **Attribute, don't just total.** The measurement gate above reports one number; this report's
      method is better — change **one variable at a time** (network, browser surface, device, stored
      identity) and record which one moves the result. Build the harness that way, so a regression can be
      traced to the surface that caused it instead of to "entropy went up"

#### Filter-engine cost (rival evidence: Brave)

> **Where this came from.** [`../../docs/research/research-brave.md`](../../docs/research/research-brave.md).
> Brave's second-most-repeated complaint is **memory and slowdown**, and the report names the filter lists as a
> prime suspect — with a concrete suggestion: scope the default filter set by language group instead of loading
> every list for every user. Tepegöz runs the same engine family (`@ghostery/adblocker-electron`) **per
> partition**, which multiplies the cost the complaint is about, so the finding transfers directly.

- [ ] **Locale-scoped default filter set** — load the regional lists that match the user's languages, not the
      union of all of them; extra lists remain opt-in and are named in the UI
- [ ] **Engine instances are shared where partitions allow it** — measure whether per-partition attachment
      duplicates rule storage, and share the compiled ruleset if it does
- [ ] **Filter cost is measured, not assumed** — RSS attributable to the engine and added page-load latency,
      recorded before and after the two items above. The complaint being popular is not evidence that the lists
      are the cause; the measurement is

### Cookie & Storage editor (extra requirement #8)

- [ ] `CookieAndStorageInspector`: CDP/`session.cookies` **DevTools-only** inspect-edit; fully isolated from OAuth vault; **agent access off by default**
  - [ ] If an **agent-callable** read/clear of a site's client-side state is ever wanted ("what's in this
        site's localStorage", "clear this site's state and retry"), it is classified **credential-adjacent**,
        not `read` — session tokens live in exactly these stores. That means: its own danger class, off at
        every autonomy level by default, hard-denied on `isSensitiveSite`, and the value bodies redacted
        from the model's context rather than returned verbatim. Written up, deliberately not enabled:
        [`../tracks/playwright-mcp-agent-parity.md`](../../docs/parities/playwright-mcp-agent-parity.md) P3.
- [x] **Per-site data clearing** ("Forget this site" / `Clear-Site-Data`): cookies + storage + cache + service-worker + permissions in one action; isolated from OAuth vault — clearing recorded as a `SiteDataCleared` event (append-only "shown=recorded", ADR-0004) + user warning on silent credential loss
      _(landed: [site-data.ts](../../packages/security-policy/src/site-data.ts) + [ipc-site-data.ts](../../apps/desktop/src/main/ipc/ipc-site-data.ts) + a Settings row, EN+TR. **Two-step by construction** — the first click PLANS, which is what produces the warnings; a one-click version would sign people out of sites they were using without telling them. The credential vault is never in scope and has its own predicate, because that is the invariant most likely to be broken by someone adding "and also clear saved passwords" to this button. **Owed:** the per-site ADR the line asks for (the behaviour is implemented and documented in code; the ADR is not written), permissions are not part of the clear, and the offline-data warning is deliberately not probed — a warning we are unsure of trains people to ignore warnings.)_

### Credentials & Passkey (daily-driver) — **ADR required** (trust model, at phase start)

- [ ] **Full WebAuthn / passkey**: enable `navigator.credentials` in renderer + `setDevicePermissionHandler` (platform authenticator / Windows Hello bridge — shares the Windows Hello HITL path from Phase 1a)
- [ ] **Built-in password manager**: autofill + strong-password generation + `safeStorage`-encrypted vault + vault UI; breach/leak warning optional. **Constraint:** vault lives in main process (`safeStorage`, ADR-0005); renderer gets autofill only via narrow/zod-validated IPC; **agent access OFF by default** (ADR-0006 sensitive-site lockout already covers "password managers"). Cross-reference Phase 3 **password E2EE sync** + **Bitwarden native adapter** (sync/external layer; this is the local engine)
  - [ ] The rival-standard **toggles** around it, none currently planned: "offer to save passwords" on/off,
        "auto sign-in", per-site "never save" exceptions, master password, and a biometric / screen-lock
        gate on autofill. Listed in [`../tracks/browser-settings-feature-gap.md`](../../docs/tracks/browser-settings-feature-gap.md) §§7–8.
- [ ] **Privacy headers and presets with no current home**: "Send a Do Not Track request", **Global Privacy
      Control**, "delete cookies and site data when all windows are closed" (+ exception list), and
      Standard / Strict / Custom tracking-protection presets over the adblock + fingerprinting + cookie
      machinery this phase already builds. Captured in
      [`../tracks/browser-settings-feature-gap.md`](../../docs/tracks/browser-settings-feature-gap.md) §5.

### Extensibility

- [ ] Adapter Registry + Community SDK skeleton: signed `adapter.json` + sandbox + install-time scope-review
