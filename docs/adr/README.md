# Architecture Decision Records (ADRs)

Each ADR captures one significant, hard-to-reverse decision: its context, the decision, and the
consequences (including rejected alternatives). Format is a lightweight [MADR](https://adr.github.io/madr/).

- ADRs are **immutable once Accepted**; to change a decision, add a new ADR that **supersedes** it.
- Status: `Proposed` → `Accepted` → (`Superseded by ADR-NNNN` | `Deprecated`).

| ADR                                                 | Title                                                                                                                        | Status                                  |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| [0001](0001-electron-react-typescript.md)           | Electron + React + TypeScript shell                                                                                          | Accepted                                |
| [0002](0002-monorepo-pnpm-turborepo.md)             | pnpm workspaces + Turborepo monorepo                                                                                         | Accepted                                |
| [0003](0003-sqlite-persistence.md)                  | SQLite (better-sqlite3 + FTS5 + sqlite-vec) for L1                                                                           | Accepted                                |
| [0004](0004-event-sourced-journal.md)               | Event-sourced Event Journal as the single source of truth                                                                    | Accepted                                |
| [0005](0005-provider-agnostic-ai.md)                | Provider-agnostic AI, BYO-key local-first                                                                                    | Accepted                                |
| [0006](0006-policy-kernel-hitl.md)                  | Deterministic Policy Kernel + HITL (security-by-design)                                                                      | Accepted (partially superseded by 0039) |
| [0007](0007-capability-plane-mcp.md)                | Unified Capability/Tool Plane; Tepegöz as MCP client **and** server                                                          | Accepted                                |
| [0008](0008-perception-cdp.md)                      | DOM/a11y-first perception, vision fallback, WebMCP optional                                                                  | Accepted                                |
| [0009](0009-boundary-mapping.md)                    | Boundary mapping: HTTP-semantic AppError → IPC / tool-call                                                                   | Accepted                                |
| [0010](0010-ts-tooling-conventions.md)              | TypeScript/tooling conventions & deviations                                                                                  | Accepted                                |
| [0011](0011-vpn-network-privacy.md)                 | VPN & network privacy — three-scope binding, per-(profile,connection) partitions, fail-closed kill switch (foundation layer) | Accepted (foundation layer)             |
| [0012](0012-browser-tab-model.md)                   | Browser tab model — isolated WebContentsView per tab                                                                         | Accepted                                |
| [0013](0013-agent-orchestration-hitl.md)            | Agent orchestration & two-stage HITL (end-to-end agentic task)                                                               | Accepted                                |
| [0014](0014-user-data-layout-db-connector.md)       | Chrome-like user-data layout (`tepegoz`) + single SQLite DB connector                                                        | Accepted                                |
| [0015](0015-package-extraction-roadmap.md)          | Package extraction roadmap — cohesive parts of `apps/desktop` become `packages/*`                                            | Accepted                                |
| [0016](0016-per-package-i18n.md)                    | Per-package i18n dictionaries + a React i18n runtime                                                                         | Accepted (partially superseded by 0017) |
| [0017](0017-feature-ui-package-i18n.md)             | Feature-UI packages own their dictionaries                                                                                   | Accepted                                |
| [0018](0018-mcp-client.md)                          | MCP client — external MCP servers behind the single PEP                                                                      | Accepted                                |
| [0019](0019-chromium-update-cadence.md)             | Electron/Chromium security-update cadence                                                                                    | Proposed                                |
| [0020](0020-tab-boundary-model.md)                  | Tab Boundary Model — groups, pins, split view, workspaces                                                                    | Accepted                                |
| [0021](0021-agent-controllable-extensions.md)       | Agent-controllable extensions via in-process capability providers                                                            | Accepted                                |
| [0022](0022-file-operations-sandbox.md)             | Folder-sandboxed file operations for the agent                                                                               | Accepted                                |
| [0023](0023-ai-adaptors.md)                         | AIAdaptor — typed capability groups over the tool plane                                                                      | Accepted                                |
| [0024](0024-action-interception-plane.md)           | Synchronous action-interception plane for browser-mechanics hooks                                                            | Accepted                                |
| [0025](0025-model-streaming-boundary.md)            | Model streaming boundary — deltas to the renderer, settled results to the Journal                                            | Accepted                                |
| [0026](0026-agent-code-execution.md)                | Agent code execution — a sandbox proven by measurement (isolated world REFUTED), read-only, kernel-classed                   | Accepted                                |
| [0027](0027-agent-memory.md)                        | Agent memory — advisory, tainted, re-validated; never a second instruction channel                                           | Accepted                                |
| [0028](0028-local-agent-model.md)                   | Local agent model — evidence before tier ownership, weights as artifacts, agentic RL out of scope                            | Accepted                                |
| [0029](0029-devtools-expose-boundary.md)            | DevTools expose boundary — user-only, never an agent tool, never on a sensitive site                                         | Accepted                                |
| [0030](0030-notary-service.md)                      | NotaryService — hash-chained Journal, signed checkpoints, standalone-verifiable Replay Receipts                              | Accepted                                |
| [0031](0031-recipe-compiler-trust-model.md)         | RecipeCompiler trust model — taint-safe IR + model-free success oracle (foundation layer)                                    | Accepted (foundation layer)             |
| [0032](0032-restricted-unattended-trust-profile.md) | Restricted unattended trust profile — sealed narrowing, financial/destructive never auto-run (decision layer)                | Accepted (decision layer)               |
| [0033](0033-transaction-mandate-kernel.md)          | Transaction Mandate Kernel — bounded pre-model authority, replay-safe (decision layer)                                       | Accepted (refined by 0039)              |
| [0034](0034-verifiable-policy-bundles.md)           | Verifiable Policy Bundles — sealed narrowing enforced in the compiler (decision layer)                                       | Accepted (decision layer)               |
| [0035](0035-governed-agent-endpoints.md)            | Governed Agent Endpoints — sensitive-site lockout applies regardless of token (decision layer)                               | Accepted (refined by 0039)              |
| [0036](0036-kamu-adapter-trust-model.md)            | Kamu public-service adapter trust model — read free, write force-asked with biometric (decision layer)                       | Accepted (decision layer)               |
| [0037](0037-supply-chain-gate.md)                   | SupplyChainGate — signed/SBOM/attestation tiering + declared-vs-actual enforcement (decision layer)                          | Accepted (decision layer)               |
| [0038](0038-release-update-hardening.md)            | Release & update hardening — recovery ladder, safe mode, opt-in redacted crash reports, verify-then-stage updates            | Accepted (design; runtime gated)        |
| [0039](0039-user-granted-sensitive-capabilities.md) | User-granted sensitive capabilities — the lockout becomes a grant; auto CAPTCHA/2FA; mandates authorize                      | Accepted (decision layer)               |
| [0040](0040-download-trust-model.md)               | Download trust model — quarantine by default, nothing trusted until it passes, agent downloads always gated                  | Accepted (lifecycle shipped; SB provider owed) |
| [0041](0041-developer-settings-surface.md)         | Developer settings surface — unlisted `tepegoz://developer` page + dev-only settings section; allowlist-only Chromium flags; renderer-boundary keys locked | Accepted (Tier B + page shipped; A/C/D owed) |
