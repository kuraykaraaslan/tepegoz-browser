# @tepegoz/security-policy CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support deterministic policy decisions before model-controlled actions run.
- [x] Support allow, deny, and ask decisions.
- [x] Support stable machine-readable reason codes.
- [x] Support danger-class evaluation for read actions.
- [x] Support danger-class evaluation for state-changing actions.
- [x] Support danger-class evaluation for destructive actions.
- [x] Support danger-class evaluation for financial actions.
- [ ] Support a wallet mandate satisfying the financial HITL requirement inside its bounds (ADR-0039).
- [x] Support sensitive-site lockout rules.
- [ ] Support per-category user grants that lift a sensitive-site deny (ADR-0039).
- [ ] Support grant revocation taking effect on the next classification (ADR-0039).
- [ ] Support proving no autonomy level and no agent tool can synthesize a grant (ADR-0039).
- [x] Support bank, crypto, health, and password-manager site categories.
- [x] Support active-site context in tool policy evaluation.
- [x] Support forced human approval for tainted state-changing calls.
- [x] Support taint tracking for web-derived data.
- [ ] Support provenance levels for trusted and untrusted data sources.
- [x] Support finding tainted values inside tool arguments.
- [x] Support human handoff detection for CAPTCHA and 2FA pages.
- [ ] Support automatic CAPTCHA clearing, with handoff as the fallback (ADR-0039).
- [ ] Support 2FA completion through the Credential Broker without exposing the code to the model (ADR-0039).
- [x] Support biometric confirmation metadata for high-risk actions.
- [x] Support outbound egress inspection.
- [x] Support secret-like data detection in outbound payloads.
- [x] Support high-entropy blob detection.
- [x] Support Shannon entropy utilities for egress analysis.
- [x] Support structured egress findings.
- [x] Support policy result explanations for permission debugging.
- [x] Support fail-closed handling for unknown danger classes.
- [x] Support policy tests without Electron or I/O.
- [x] Support site-list updates through data or code review.
- [ ] Support tool-source awareness for built-in, MCP, and extension calls.
- [x] Support audit-friendly policy result payloads.
- [ ] Support future risk dimensions without moving security into prompts.
- [ ] Support documentation for adding new policy reason codes.
- [x] Support strict separation between security decisions and UI presentation.
