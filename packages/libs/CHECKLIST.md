# @tepegoz/libs CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support a shared application error type with HTTP-style status codes.
- [ ] Support boundary conversion from unknown errors to safe error objects.
- [ ] Support centralized environment parsing at startup.
- [ ] Support schema validation for required runtime configuration.
- [ ] Support startup failure on invalid non-secret environment values.
- [ ] Support keeping BYO API keys out of environment configuration.
- [ ] Support a shared logger interface.
- [ ] Support redaction of secrets in log messages.
- [ ] Support redaction of personally identifiable information.
- [ ] Support reusable constant messages for operators and logs.
- [ ] Support no-inline-string conventions for thrown errors.
- [ ] Support framework-agnostic imports across main, renderer-safe, and package code.
- [ ] Support Electron-free utility usage.
- [ ] Support structured log metadata.
- [ ] Support correlation IDs for agent runs and tool calls.
- [ ] Support log levels such as debug, info, warn, and error.
- [ ] Support safe serialization of unknown thrown values.
- [ ] Support user-facing and developer-facing error message separation.
- [ ] Support stable error codes for programmatic handling.
- [ ] Support feature-level logger namespaces.
- [ ] Support test helpers for redaction behavior.
- [ ] Support redaction patterns for tokens, keys, emails, and long secrets.
- [ ] Support redaction before Event Journal writes.
- [ ] Support redaction before Agent Console display.
- [ ] Support environment defaults for local development.
- [ ] Support platform-aware configuration values.
- [ ] Support documentation for adding shared messages.
- [ ] Support minimal dependency surface for low-level packages.
- [ ] Support safe fallback messages for unexpected failures.
- [ ] Support future telemetry hooks without changing app error semantics.
