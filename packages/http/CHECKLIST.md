# @tepegoz/http CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support a central HTTP client factory for REST integrations.
- [x] Support per-client base URL configuration.
- [x] Support per-client default headers.
- [x] Support default JSON content type.
- [x] Support per-request timeout configuration.
- [x] Support sensible default timeouts for all outbound calls.
- [x] Support AbortSignal cancellation.
- [x] Support normalized error mapping to app-level errors.
- [x] Support preserving meaningful 4xx status codes.
- [x] Support mapping network failures to service-unavailable errors.
- [x] Support mapping timeouts to service-unavailable errors.
- [x] Support redacting secrets from error messages.
- [x] Support provider clients without direct vendor SDK dependencies.
- [ ] Support request interceptors for auth and tracing.
- [x] Support response interceptors for redaction and diagnostics.
- [ ] Support retry metadata supplied by higher-level callers.
- [ ] Support structured logging hooks without leaking payload secrets.
- [ ] Support streaming responses when integrations need them.
- [ ] Support binary response types for downloads.
- [x] Support JSON request and response typing through caller generics.
- [ ] Support safe handling of malformed response bodies.
- [ ] Support proxy and corporate-network options through client configuration.
- [ ] Support TLS and certificate error surfacing through normalized errors.
- [x] Support rate-limit metadata extraction from provider responses.
- [x] Support user-agent customization by host applications.
- [x] Support testable pure error normalization.
- [x] Support deterministic messages for common failure modes.
- [ ] Support dependency-light browser-agnostic usage.
- [ ] Support future transport adapters behind the same client API.
- [x] Support documentation that discourages direct axios construction.
