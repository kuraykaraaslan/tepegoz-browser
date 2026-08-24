# Threat Model Lite — Tepegöz

> Required by the security baseline in [`engineering-rules.md`](engineering-rules.md) (BLOCKING for
> Medium+ risk). Reporting a vulnerability: [`../SECURITY.md`](../SECURITY.md).
> **Overall risk: HIGH/CRITICAL** — Tepegöz handles user credentials, browsing/personal data, and
> acts autonomously on the user's behalf across third-party AI / MCP / integrations.

## Assets

- User credentials & sessions (cookies, OAuth tokens, BYO API keys)
- Browsing data, page content, screenshots, form input (personal/sensitive)
- The Event Journal (audit trail), per-task memory, blob store
- The user's machine (filesystem, OS) and any authenticated services the agent can reach

## Actors

- User (trusted) · The agent/LLM (semi-trusted — output is untrusted) · Visited web pages & their
  content (untrusted) · Third-party MCP servers / skills / adapters (untrusted) · Network attackers

## Entry points

- Agent tool calls (LLM-produced arguments = untrusted, prompt-injection surface)
- Visited page content / DOM returned to the agent
- Inbound MCP server requests (when Tepegöz exposes its tools)
- OAuth callbacks / integration responses · IPC from renderer · auto-update feed · local files

## Trust boundaries

`renderer (untrusted UI)` ⇄ `preload (typed bridge)` ⇄ `main (privileged)` · `isolated webview
(browsed pages)` · `CapabilitySandbox (3rd-party MCP/skill)` · `AI provider` · `integration adapters`
· `MCP server (inbound)` · `cloud backend (Phase 3)` · `VPN/Tor tunnel (local SOCKS endpoint +
its operator, Phase 5)`

## Top threats → mitigations

| Threat                                   | Mitigation (where)                                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Prompt injection from page/email content | Taint tracking + tainted→state-changing forces HITL; Content Sanitizer; data/instruction separation (ADR-0006)    |
| Excessive agency (delete/send/pay)       | Policy Kernel danger-class + HITL + Windows Hello; sensitive categories off until user-granted; spend bounded by mandate (ADR-0039) |
| Credential/key theft                     | Keys only in main via `safeStorage`; OAuth tokens never exposed to the agent; never bundled/logged (redaction)    |
| Data exfiltration                        | Egress Firewall (Base64/high-entropy/cross-origin PII); CSP; deny-by-default navigation                           |
| Malicious 3rd-party MCP/skill            | CapabilitySandbox (separate process, least-privilege, `file://` off); signature + scope-review before marketplace |
| Renderer compromise                      | contextIsolation+sandbox+nodeIntegration:false+webSecurity:true; Electron fuses; typed IPC + sender allow-list    |
| Tampered update                          | Code-signed + signature-verified updates over HTTPS; anti-rollback (Phase 0 packaging)                            |
| Inbound MCP abuse                        | Bearer auth + rate-limit + schema validation + same policy gate                                                   |
| Local DB exposure                        | userData ACLs; field encryption for sensitive data; synthetic test fixtures only                                  |
| Silent identity disclosure to a site | Client-certificate chooser: `select-client-certificate` is answered with `preventDefault()` and nothing is sent without an explicit user choice (`main/auth/client-certificate-broker.ts`) |
| Platform default the app never claimed | Ownership asserted against the RUNNING app, not the source: `e2e/application-menu.spec.ts` (see below) |

### Platform defaults — a threat class, not an oversight

The last two rows are the same threat wearing different clothes, and it is worth naming because this
repository has now been bitten by it twice. **Electron supplies a behaviour when the app installs no
handler, and the absence of a call is invisible to every gate we have** — a linter, a type checker and
a unit test all read the code that IS there.

- **`Menu.setApplicationMenu` was never called**, so Electron's default menu was live and bound
  `Ctrl+Shift+I` to its own `toggleDevTools` role — around the sensitive-site DevTools gate, whose own
  documentation promised "nothing that reaches the chrome can open it on a bank". Its zoom roles
  likewise bypassed the per-origin zoom ladder, and `close` closed the window where a browser closes a
  tab.
- **`select-client-certificate` was never handled**, so Electron sent the first client certificate in
  the OS store to any site that asked — a private-key-backed assertion of the user's identity, on first
  contact, unprompted.

Both were found by asking the launched application what it was doing, and both are now locked that
way, because that is the only place the question has an answer. When adding a surface Electron has an
opinion about — permissions, device access, certificates, menus, window opening, protocol handling —
the check is not "did we write a handler" but "what happens if we did not".

#### The sweep, and what it measured

Asking that question of the remaining web-platform surfaces found **no further hole** — recorded here
because "no hole" is worth something only if it is a measurement rather than a belief. Each row below
was observed in the launched app, from a real page on a `http://127.0.0.1` origin (a secure context, so
every API was genuinely eligible to be asked for), and each is now locked by
[`e2e/platform-defaults.spec.ts`](../e2e/platform-defaults.spec.ts).

| Surface | Observed | Why it holds |
| --- | --- | --- |
| `getUserMedia` (camera + mic) | `NotAllowedError` | Deny-by-default permission handler |
| `getDisplayMedia` (screen) | `NotAllowedError` | Deny-by-default permission handler |
| `geolocation` | `PERMISSION_DENIED` | Deny-by-default permission handler |
| `idle-detection` | `denied` | Deny-by-default permission handler |
| `Notification.permission` | `denied` | Brokered per-site; the default state is denied |
| WebUSB / Bluetooth / Serial | `NotFoundError` | No device-selection handler is installed, so no device is ever chosen |
| WebHID | resolves with an **empty array** | Same, but note the shape: `requestDevice` RESOLVES rather than rejecting when nothing is selected. "Resolved" is not a grant, and a test that only checked for resolution would have read it as one |
| `require` / `process` / `module` in a page | `undefined` | contextIsolation + `nodeIntegration:false` — the renderer-is-untrusted claim, checked rather than asserted |

The app's own half is locked separately by `apps/desktop/src/main/security.test.ts`, which enumerates
Electron's entire permission union and asserts everything outside the three brokered capabilities
(notifications and the two clipboard permissions) is refused. Written that way on purpose: a permission
ADDED by a future Electron is denied by the test's own construction, and a capability quietly added to
`permissionCapability` fails it. That handler had **no test at all** before this sweep.

**One open question, stated rather than resolved.** The File System Access API
(`showOpenFilePicker` / `showDirectoryPicker`) is present in browsed pages, and calling it does not
reject — Chromium opens the native file picker *before* requesting the `fileSystem` permission. The
half that is ours is covered: `fileSystem` is in Electron's permission union and our handler refuses it,
which `security.test.ts` asserts. The half that is not could **not be measured in this harness** — it
needs a file chosen out of an OS dialog, which no automated run can do. So what a page ends up holding
after a user picks a file is untested here, and should not be assumed either way. Note also that
`FileOperationsHost` and the Settings "file operations" switch are scoped to the **agent's** file tools
and were never claimed to cover this path.


## Network-privacy tunnels (Phase 5)

A tunnel-bound tab adds a trust boundary the rest of this document does not cover: `browsed page` ⇄
`this browser` ⇄ **`local SOCKS endpoint`** ⇄ `tunnel operator (Tor exit, VPN provider, SSH host)` ⇄
`destination`. The operator is a party the user chose and this browser cannot vouch for.

The dominant risk here is not "the tunnel fails" — it is **the tunnel failing without saying so**, or
some path in the browser bypassing it. Both look exactly like everything working.

| Threat                                                                             | Mitigation (where)                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tunnel drops mid-session → traffic silently continues on the clear path            | Proxy rules carry **no `DIRECT` fallback** (`assertFailClosed`), so a dead endpoint yields `ERR_PROXY_CONNECTION_FAILED`; `killSwitchVerdicts` reports it per tab; health poll flips status within seconds. Measured: `e2e/spike-tunnel-failclosed.spec.ts`                                               |
| A partition exists but was never bound → Chromium treats "no proxy" as DIRECT      | Every `--conn-` partition is **blackholed at creation** (`BLACKHOLE_PROXY_CONFIG`) and only replaced once `resolveProxy` confirms the real tunnel took effect                                                                                                                                             |
| DNS resolved locally → the ISP sees every site name despite the tunnel             | SOCKS**5** only (SOCKS4 rejected — it has no hostname form), so the proxy resolves; `X-DNS-Prefetch-Control: off` stamped on tunnel partitions to suppress Chromium's pre-resolution, which does not go through the proxy. Measured (remote DNS): the SOCKS server receives `DOMAINNAME`                  |
| WebRTC hands out the real address past a TCP proxy                                 | `disable_non_proxied_udp` per tunneled `WebContents`                                                                                                                                                                                                                                                      |
| Chrome UI fetches something on the page's behalf (favicons) over the clear path    | Favicons fetched in main **on the page's own session** and inlined as `data:`; `TabFaviconSchema` rejects a remote favicon at the IPC boundary. Measured: `e2e/spike-favicon-inline.spec.ts`                                                                                                              |
| `window.open()` / a page-opened tab escapes to Direct                              | Popups and page-opened tabs are created on the **opener's session**, never on a named partition                                                                                                                                                                                                           |
| Group-inheritance misbinding — a tab silently on the wrong exit after a group move | Resolution is one pure function (`tab → group → General → Direct`) with `affectedBy*Change` deciding exactly who re-hosts; a tab with its own override is never moved by a scope above it. **Known gap:** pinning a tab clears its group membership, which silently re-resolves it to the General default |
| Re-bind transition leaks on the old path                                           | The old view is destroyed **before** the replacement exists; no moment has two views for one tab on two networks                                                                                                                                                                                          |
| Two connections share one cookie jar (cross-tab bleed)                             | Partition key derived from a validated connection-id slug; an id that could collide **throws** instead of being sanitized                                                                                                                                                                                 |
| A removed connection leaves its cookies on disk                                    | `BrowsingSessions.release` wipes storage, cache, auth and host-resolver caches; refuses to touch the Direct partition                                                                                                                                                                                     |
| Tunnel-bound partition runs unfiltered (no adblock/DNR, no download quarantine)    | Per-session attacher registry; the filtering and quarantine attachers are **critical** — a session they cannot attach to is refused, not served                                                                                                                                                           |
| The app's own HTTP (agent fetch, model calls) ignores the tunnel                   | `@tepegoz/http` egress route follows the **General** binding and **refuses** a request it cannot tunnel; never a silent downgrade                                                                                                                                                                         |
| A WireGuard profile's private key sits readable on disk                            | Stored encrypted through `safeStorage`; import is **refused** when the OS keychain is unavailable rather than degrading to plaintext. Residual: wireproxy takes a config path, not stdin, so the rendered config exists `0600` from spawn until the listener answers, then is deleted                     |
| A helper binary is swapped for a hostile one                                       | Located, never auto-downloaded: override → `userData/bin` → PATH, all under the user's control. No pinned-hash fetch is implemented, so nothing is executed that the user did not place                                                                                                                   |
| A hostname leaks while the traffic is tunneled (WireGuard)                         | A `.conf` with no `DNS` line is **refused at import** — wireproxy would otherwise fall back to the host resolver. The resolver is carried into the generated config                                                                                                                                       |
| A chained route (Tor over VPN) half-fails                                          | The chain is literal: Tor's outbound _is_ the VPN's SOCKS port, so an upstream drop kills Tor's egress. Both legs are shown on the group shield; either one down cuts the group                                                                                                                           |
| A chain config loops back on itself                                                | Refused with a named error by the pool's cycle guard, rather than recursing until the stack gives out                                                                                                                                                                                                     |
| Two Tor groups share a circuit                                                     | One `tor` process per connection, each with its own `DataDirectory` — separate guards and circuits by construction, not by configuration                                                                                                                                                                  |
| Payload inspection is blind inside the tunnel                                      | Accepted and documented: anomaly scoring for a tunneled tab must lean on metadata/timing/volume. Not silently weakened — recorded as owed work                                                                                                                                                            |

**Exit-node / operator is untrusted.** A Tor exit or a VPN provider sees exactly what a plaintext ISP
would, and can modify anything not protected by TLS. Nothing in this feature changes that; it moves who
is in that position, on the user's instruction. HTTPS-only enforcement and a cleartext warning for
tunnel-bound tabs are owed (Phase 5, Tor track).

**The exit region is the user's claim.** A connection's note ("Tor", "Mullvad SE") is free text the user
typed. The browser cannot verify where a loopback SOCKS port comes out and never presents it as fact.

## Residual risk (accepted, documented)

- Prompt injection cannot be reduced to zero (industry-wide); we minimize blast radius via the Policy
  Kernel and publish a version-tagged attack-success-rate.
- An agentic browser inherently sends page/DOM content (which may contain PII) to the model; mitigated
  by redaction, data minimization, local-SLM preprocessing for sensitive data, and explicit consent —
  **not** eliminated. No "100% secure" claim is made; ultimate responsibility rests with the user.

- A tunnel moves trust rather than removing it: the exit operator sees what an ISP would. Chromium's
  DNS **prefetch/preconnect predictor** and DoH are process-wide rather than per-session; the per-request
  path is proven to resolve remotely, and prefetch is suppressed with `X-DNS-Prefetch-Control: off` on
  tunnel partitions, but that header covers page-declared prefetch hints, not every predictor path. Not
  claimed as closed.
- No VPN/Tor transport is bundled. The browser routes through a SOCKS5 endpoint the user already runs;
  shipping one is gated on Phase 0 code-signing. Anything that endpoint does is outside this model.

_Revisit before each release and whenever a new trust boundary (e.g., managed proxy, extensions) lands._
