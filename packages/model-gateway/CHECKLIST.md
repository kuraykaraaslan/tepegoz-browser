# @tepegoz/model-gateway CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support a single provider-agnostic entry point for model calls.
- [x] Support registering multiple model providers.
- [x] Support canonical request shapes independent of vendor formats.
- [x] Support canonical response shapes independent of vendor formats.
- [x] Support max-token requirements for every call.
- [x] Support timeout requirements for every call.
- [x] Support per-capability model routing.
- [x] Support model tier selection for planning, execution, classification, and other capabilities.
- [x] Support reasoning-effort selection by routed capability.
- [x] Support local versus cloud transport decisions.
- [x] Support cost-saver preferences in routing decisions.
- [x] Support per-provider and per-model usage accounting.
- [x] Support token ledger budget reporting.
- [x] Support provider-specific adapter normalization.
- [x] Support OpenAI-compatible REST calls through the central HTTP seam.
- [x] Support Anthropic-compatible SDK calls through a provider adapter.
- [x] Support deterministic mock providers for offline development.
- [x] Support tool definition normalization in requests.
- [x] Support tool call normalization in responses.
- [x] Support structured JSON response requests.
- [x] Support cancellation propagation to provider calls.
- [ ] Support retry metadata supplied by higher-level callers.
- [x] Support provider timeout and rate-limit error mapping.
- [x] Support redacted logging for prompts, keys, and responses.
- [x] Support model ID constants to avoid caller hardcoding.
- [ ] Support provider health and availability diagnostics.
- [ ] Support per-call cost estimation metadata.
- [ ] Support fallback provider selection when preferred routes fail.
- [x] Support tests for routing, guards, and adapter normalization.
- [x] Support future providers without changing callers.
