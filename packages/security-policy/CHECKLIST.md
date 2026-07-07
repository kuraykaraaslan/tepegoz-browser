# @tepegoz/security-policy CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support deterministic policy decisions before model-controlled actions run.
- [ ] Support allow, deny, and ask decisions.
- [ ] Support stable machine-readable reason codes.
- [ ] Support danger-class evaluation for read actions.
- [ ] Support danger-class evaluation for state-changing actions.
- [ ] Support danger-class evaluation for destructive actions.
- [ ] Support danger-class evaluation for financial actions.
- [ ] Support sensitive-site lockout rules.
- [ ] Support bank, crypto, health, and password-manager site categories.
- [ ] Support active-site context in tool policy evaluation.
- [ ] Support forced human approval for tainted state-changing calls.
- [ ] Support taint tracking for web-derived data.
- [ ] Support provenance levels for trusted and untrusted data sources.
- [ ] Support finding tainted values inside tool arguments.
- [ ] Support human handoff detection for CAPTCHA and 2FA pages.
- [ ] Support biometric confirmation metadata for high-risk actions.
- [ ] Support outbound egress inspection.
- [ ] Support secret-like data detection in outbound payloads.
- [ ] Support high-entropy blob detection.
- [ ] Support Shannon entropy utilities for egress analysis.
- [ ] Support structured egress findings.
- [ ] Support policy result explanations for permission debugging.
- [ ] Support fail-closed handling for unknown danger classes.
- [ ] Support policy tests without Electron or I/O.
- [ ] Support site-list updates through data or code review.
- [ ] Support tool-source awareness for built-in, MCP, and extension calls.
- [ ] Support audit-friendly policy result payloads.
- [ ] Support future risk dimensions without moving security into prompts.
- [ ] Support documentation for adding new policy reason codes.
- [ ] Support strict separation between security decisions and UI presentation.
