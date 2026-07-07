# @tepegoz/model-gateway CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support a single provider-agnostic entry point for model calls.
- [ ] Support registering multiple model providers.
- [ ] Support canonical request shapes independent of vendor formats.
- [ ] Support canonical response shapes independent of vendor formats.
- [ ] Support max-token requirements for every call.
- [ ] Support timeout requirements for every call.
- [ ] Support per-capability model routing.
- [ ] Support model tier selection for planning, execution, classification, and other capabilities.
- [ ] Support reasoning-effort selection by routed capability.
- [ ] Support local versus cloud transport decisions.
- [ ] Support cost-saver preferences in routing decisions.
- [ ] Support per-provider and per-model usage accounting.
- [ ] Support token ledger budget reporting.
- [ ] Support provider-specific adapter normalization.
- [ ] Support OpenAI-compatible REST calls through the central HTTP seam.
- [ ] Support Anthropic-compatible SDK calls through a provider adapter.
- [ ] Support deterministic mock providers for offline development.
- [ ] Support tool definition normalization in requests.
- [ ] Support tool call normalization in responses.
- [ ] Support structured JSON response requests.
- [ ] Support cancellation propagation to provider calls.
- [ ] Support retry metadata supplied by higher-level callers.
- [ ] Support provider timeout and rate-limit error mapping.
- [ ] Support redacted logging for prompts, keys, and responses.
- [ ] Support model ID constants to avoid caller hardcoding.
- [ ] Support provider health and availability diagnostics.
- [ ] Support per-call cost estimation metadata.
- [ ] Support fallback provider selection when preferred routes fail.
- [ ] Support tests for routing, guards, and adapter normalization.
- [ ] Support future providers without changing callers.
