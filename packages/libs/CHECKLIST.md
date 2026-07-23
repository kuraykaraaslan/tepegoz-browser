# @tepegoz/libs CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support a shared application error type with HTTP-style status codes.
- [x] Support boundary conversion from unknown errors to safe error objects.
- [x] Support centralized environment parsing at startup.
- [x] Support schema validation for required runtime configuration.
- [x] Support startup failure on invalid non-secret environment values.
- [x] Support keeping BYO API keys out of environment configuration.
- [x] Support a shared logger interface.
- [x] Support redaction of secrets in log messages.
- [ ] Support redaction of personally identifiable information.
- [x] Support reusable constant messages for operators and logs.
- [ ] Support no-inline-string conventions for thrown errors.
- [ ] Support framework-agnostic imports across main, renderer-safe, and package code.
- [x] Support Electron-free utility usage.
- [x] Support structured log metadata.
- [x] Support correlation IDs for agent runs and tool calls.
- [x] Support log levels such as debug, info, warn, and error.
- [x] Support safe serialization of unknown thrown values.
- [x] Support user-facing and developer-facing error message separation.
- [x] Support stable error codes for programmatic handling.
- [ ] Support feature-level logger namespaces.
- [ ] Support test helpers for redaction behavior.
- [ ] Support redaction patterns for tokens, keys, emails, and long secrets.
- [x] Support redaction before Event Journal writes.
- [ ] Support redaction before Agent Console display.
- [x] Support environment defaults for local development.
- [ ] Support platform-aware configuration values.
- [ ] Support documentation for adding shared messages.
- [x] Support minimal dependency surface for low-level packages.
- [x] Support safe fallback messages for unexpected failures.
- [ ] Support future telemetry hooks without changing app error semantics.
