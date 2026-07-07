# @tepegoz/capability-plane CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support registering built-in, MCP, extension, and adapter tools in one registry.
- [ ] Support unregistering capabilities when providers disconnect or extensions disable.
- [ ] Support listing normalized tool descriptors for planning.
- [ ] Support lookup by canonical tool name.
- [ ] Support enforcing a stable tool naming convention.
- [ ] Support idempotency checks before executing mutating tools.
- [ ] Support zod input validation for untrusted tool arguments.
- [ ] Support policy evaluation before any tool handler runs.
- [ ] Support human confirmation for policy decisions that ask.
- [ ] Support fail-closed behavior when confirmation handlers are absent.
- [ ] Support audit entries for every tool invocation attempt.
- [ ] Support standard tool error envelopes that do not throw across boundaries.
- [ ] Support danger-class metadata for read, state-changing, destructive, and financial actions.
- [ ] Support provenance metadata for built-in, MCP, and extension tools.
- [ ] Support taint-aware invocation context.
- [ ] Support site-aware invocation context for browser actions.
- [ ] Support clear denial reasons suitable for permission debugging.
- [ ] Support per-tool validators supplied by capability authors.
- [ ] Support async handlers with bounded execution semantics.
- [ ] Support cancellation propagation into tool handlers.
- [ ] Support result redaction hooks for sensitive tool output.
- [ ] Support duplicate registration detection.
- [ ] Support capability source attribution in audit logs.
- [ ] Support testing with injected confirm and audit handlers.
- [ ] Support stable descriptor shapes for model prompt rendering.
- [ ] Support capability discovery without exposing raw handler functions.
- [ ] Support structured metrics for invocation latency and decisions.
- [ ] Support versioned capability descriptors for future compatibility.
- [ ] Support least-privilege tool access through a single gateway.
- [ ] Support extensible policy context without breaking existing tools.
