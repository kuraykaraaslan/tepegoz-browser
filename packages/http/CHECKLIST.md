# @tepegoz/http CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support a central HTTP client factory for REST integrations.
- [ ] Support per-client base URL configuration.
- [ ] Support per-client default headers.
- [ ] Support default JSON content type.
- [ ] Support per-request timeout configuration.
- [ ] Support sensible default timeouts for all outbound calls.
- [ ] Support AbortSignal cancellation.
- [ ] Support normalized error mapping to app-level errors.
- [ ] Support preserving meaningful 4xx status codes.
- [ ] Support mapping network failures to service-unavailable errors.
- [ ] Support mapping timeouts to service-unavailable errors.
- [ ] Support redacting secrets from error messages.
- [ ] Support provider clients without direct vendor SDK dependencies.
- [ ] Support request interceptors for auth and tracing.
- [ ] Support response interceptors for redaction and diagnostics.
- [ ] Support retry metadata supplied by higher-level callers.
- [ ] Support structured logging hooks without leaking payload secrets.
- [ ] Support streaming responses when integrations need them.
- [ ] Support binary response types for downloads.
- [ ] Support JSON request and response typing through caller generics.
- [ ] Support safe handling of malformed response bodies.
- [ ] Support proxy and corporate-network options through client configuration.
- [ ] Support TLS and certificate error surfacing through normalized errors.
- [ ] Support rate-limit metadata extraction from provider responses.
- [ ] Support user-agent customization by host applications.
- [ ] Support testable pure error normalization.
- [ ] Support deterministic messages for common failure modes.
- [ ] Support dependency-light browser-agnostic usage.
- [ ] Support future transport adapters behind the same client API.
- [ ] Support documentation that discourages direct axios construction.
