# @tepegoz/capability-plane CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support registering built-in, MCP, extension, and adapter tools in one registry.
- [x] Support unregistering capabilities when providers disconnect or extensions disable.
- [x] Support listing normalized tool descriptors for planning.
- [x] Support lookup by canonical tool name.
- [x] Support enforcing a stable tool naming convention.
- [ ] Support idempotency checks before executing mutating tools.
- [x] Support zod input validation for untrusted tool arguments.
- [x] Support policy evaluation before any tool handler runs.
- [x] Support human confirmation for policy decisions that ask.
- [x] Support fail-closed behavior when confirmation handlers are absent.
- [ ] Support audit entries for every tool invocation attempt.
- [x] Support standard tool error envelopes that do not throw across boundaries.
- [x] Support danger-class metadata for read, state-changing, destructive, and financial actions.
- [x] Support provenance metadata for built-in, MCP, and extension tools.
- [x] Support taint-aware invocation context.
- [x] Support site-aware invocation context for browser actions.
- [x] Support clear denial reasons suitable for permission debugging.
- [x] Support per-tool validators supplied by capability authors.
- [ ] Support async handlers with bounded execution semantics.
- [ ] Support cancellation propagation into tool handlers.
- [ ] Support result redaction hooks for sensitive tool output.
- [x] Support duplicate registration detection.
- [ ] Support capability source attribution in audit logs.
- [x] Support testing with injected confirm and audit handlers.
- [x] Support stable descriptor shapes for model prompt rendering.
- [x] Support capability discovery without exposing raw handler functions.
- [ ] Support structured metrics for invocation latency and decisions.
- [ ] Support versioned capability descriptors for future compatibility.
- [x] Support least-privilege tool access through a single gateway.
- [ ] Support extensible policy context without breaking existing tools.
