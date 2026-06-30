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
· `MCP server (inbound)` · `cloud backend (Phase 3)`

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

## Residual risk (accepted, documented)
- Prompt injection cannot be reduced to zero (industry-wide); we minimize blast radius via the Policy
  Kernel and publish a version-tagged attack-success-rate.
- An agentic browser inherently sends page/DOM content (which may contain PII) to the model; mitigated
  by redaction, data minimization, local-SLM preprocessing for sensitive data, and explicit consent —
  **not** eliminated. No "100% secure" claim is made; ultimate responsibility rests with the user.

_Revisit before each release and whenever a new trust boundary (e.g., managed proxy, extensions) lands._
