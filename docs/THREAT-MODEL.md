# Threat Model Lite — Tepegöz

> Required by internal-ai-rules `security-baseline-and-risk-model` (BLOCKING for Medium+ risk).
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
| Threat | Mitigation (where) |
|---|---|
| Prompt injection from page/email content | Taint tracking + tainted→state-changing forces HITL; Content Sanitizer; data/instruction separation (ADR-0006) |
| Excessive agency (delete/send/pay) | Deterministic Policy Kernel danger-class + HITL + Windows Hello; sensitive-site lockout |
| Credential/key theft | Keys only in main via `safeStorage`; OAuth tokens never exposed to the agent; never bundled/logged (redaction) |
| Data exfiltration | Egress Firewall (Base64/high-entropy/cross-origin PII); CSP; deny-by-default navigation |
| Malicious 3rd-party MCP/skill | CapabilitySandbox (separate process, least-privilege, `file://` off); signature + scope-review before marketplace |
| Renderer compromise | contextIsolation+sandbox+nodeIntegration:false+webSecurity:true; Electron fuses; typed IPC + sender allow-list |
| Tampered update | Code-signed + signature-verified updates over HTTPS; anti-rollback (Phase 0 packaging) |
| Inbound MCP abuse | Bearer auth + rate-limit + schema validation + same policy gate |
| Local DB exposure | userData ACLs; field encryption for sensitive data; synthetic test fixtures only |

## Network-privacy tunnels (Phase 5)

A tunnel-bound tab adds a trust boundary the rest of this document does not cover: `browsed page` ⇄
`this browser` ⇄ **`local SOCKS endpoint`** ⇄ `tunnel operator (Tor exit, VPN provider, SSH host)` ⇄
`destination`. The operator is a party the user chose and this browser cannot vouch for.

The dominant risk here is not "the tunnel fails" — it is **the tunnel failing without saying so**, or
some path in the browser bypassing it. Both look exactly like everything working.

| Threat | Mitigation (where) |
|---|---|
| Tunnel drops mid-session → traffic silently continues on the clear path | Proxy rules carry **no `DIRECT` fallback** (`assertFailClosed`), so a dead endpoint yields `ERR_PROXY_CONNECTION_FAILED`; `killSwitchVerdicts` reports it per tab; health poll flips status within seconds. Measured: `e2e/spike-tunnel-failclosed.spec.ts` |
| A partition exists but was never bound → Chromium treats "no proxy" as DIRECT | Every `--conn-` partition is **blackholed at creation** (`BLACKHOLE_PROXY_CONFIG`) and only replaced once `resolveProxy` confirms the real tunnel took effect |
| DNS resolved locally → the ISP sees every site name despite the tunnel | SOCKS**5** only (SOCKS4 rejected — it has no hostname form), so the proxy resolves; `X-DNS-Prefetch-Control: off` stamped on tunnel partitions to suppress Chromium's pre-resolution, which does not go through the proxy. Measured (remote DNS): the SOCKS server receives `DOMAINNAME` |
| WebRTC hands out the real address past a TCP proxy | `disable_non_proxied_udp` per tunneled `WebContents` |
| Chrome UI fetches something on the page's behalf (favicons) over the clear path | Favicons fetched in main **on the page's own session** and inlined as `data:`; `TabFaviconSchema` rejects a remote favicon at the IPC boundary. Measured: `e2e/spike-favicon-inline.spec.ts` |
| `window.open()` / a page-opened tab escapes to Direct | Popups and page-opened tabs are created on the **opener's session**, never on a named partition |
| Group-inheritance misbinding — a tab silently on the wrong exit after a group move | Resolution is one pure function (`tab → group → General → Direct`) with `affectedBy*Change` deciding exactly who re-hosts; a tab with its own override is never moved by a scope above it. **Known gap:** pinning a tab clears its group membership, which silently re-resolves it to the General default |
| Re-bind transition leaks on the old path | The old view is destroyed **before** the replacement exists; no moment has two views for one tab on two networks |
| Two connections share one cookie jar (cross-tab bleed) | Partition key derived from a validated connection-id slug; an id that could collide **throws** instead of being sanitized |
| A removed connection leaves its cookies on disk | `BrowsingSessions.release` wipes storage, cache, auth and host-resolver caches; refuses to touch the Direct partition |
| Tunnel-bound partition runs unfiltered (no adblock/DNR, no download quarantine) | Per-session attacher registry; the filtering and quarantine attachers are **critical** — a session they cannot attach to is refused, not served |
| The app's own HTTP (agent fetch, model calls) ignores the tunnel | `@tepegoz/http` egress route follows the **General** binding and **refuses** a request it cannot tunnel; never a silent downgrade |
| A WireGuard profile's private key sits readable on disk | Stored encrypted through `safeStorage`; import is **refused** when the OS keychain is unavailable rather than degrading to plaintext. Residual: wireproxy takes a config path, not stdin, so the rendered config exists `0600` from spawn until the listener answers, then is deleted |
| A helper binary is swapped for a hostile one | Located, never auto-downloaded: override → `userData/bin` → PATH, all under the user's control. No pinned-hash fetch is implemented, so nothing is executed that the user did not place |
| A hostname leaks while the traffic is tunneled (WireGuard) | A `.conf` with no `DNS` line is **refused at import** — wireproxy would otherwise fall back to the host resolver. The resolver is carried into the generated config |
| A chained route (Tor over VPN) half-fails | The chain is literal: Tor's outbound *is* the VPN's SOCKS port, so an upstream drop kills Tor's egress. Both legs are shown on the group shield; either one down cuts the group |
| A chain config loops back on itself | Refused with a named error by the pool's cycle guard, rather than recursing until the stack gives out |
| Two Tor groups share a circuit | One `tor` process per connection, each with its own `DataDirectory` — separate guards and circuits by construction, not by configuration |
| Payload inspection is blind inside the tunnel | Accepted and documented: anomaly scoring for a tunneled tab must lean on metadata/timing/volume. Not silently weakened — recorded as owed work |

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
