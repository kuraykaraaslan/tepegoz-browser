# @tepegoz/local-inference CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support a local model provider compatible with the model gateway contract.
- [x] Support injecting the concrete inference engine from the host.
- [x] Support model loading by selected local model identifier.
- [x] Support idempotent warm model loading.
- [x] Support model unloading through the injected engine.
- [x] Support checking local inference availability.
- [x] Support mapping canonical model requests to local engine turns.
- [x] Support mapping local engine responses back to canonical responses.
- [x] Support JSON response constraints through grammar selection.
- [x] Support standalone JSON object grammar generation.
- [x] Support downstream schema validation after grammar-constrained output.
- [x] Support configurable sampling options.
- [x] Support context-window metadata from selected models.
- [x] Support cooperative cancellation during generation.
- [x] Support timeouts supplied by the model gateway.
- [ ] Support streaming tokens when the engine exposes them.
- [ ] Support usage metadata for local tokens and latency.
- [x] Support fallback-friendly errors when the engine is unavailable.
- [x] Support model-resolution callbacks from catalog or settings state.
- [x] Support multiple local model sizes and quantizations.
- [ ] Support CPU, GPU, and platform-specific engine metadata.
- [x] Support safe handling of malformed local model outputs.
- [x] Support deterministic test engines.
- [x] Support grammar selection by requested response format.
- [ ] Support tool-call shaping when local models can emit structured calls.
- [x] Support privacy-friendly operation without network access.
- [ ] Support memory-pressure signals from the host.
- [ ] Support warm-cache status for settings or diagnostics UI.
- [x] Support future engines behind the same LlamaEngine interface.
- [x] Support documentation for host engine integration.
