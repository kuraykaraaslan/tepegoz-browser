# @tepegoz/local-inference CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support a local model provider compatible with the model gateway contract.
- [ ] Support injecting the concrete inference engine from the host.
- [ ] Support model loading by selected local model identifier.
- [ ] Support idempotent warm model loading.
- [ ] Support model unloading through the injected engine.
- [ ] Support checking local inference availability.
- [ ] Support mapping canonical model requests to local engine turns.
- [ ] Support mapping local engine responses back to canonical responses.
- [ ] Support JSON response constraints through grammar selection.
- [ ] Support standalone JSON object grammar generation.
- [ ] Support downstream schema validation after grammar-constrained output.
- [ ] Support configurable sampling options.
- [ ] Support context-window metadata from selected models.
- [ ] Support cooperative cancellation during generation.
- [ ] Support timeouts supplied by the model gateway.
- [ ] Support streaming tokens when the engine exposes them.
- [ ] Support usage metadata for local tokens and latency.
- [ ] Support fallback-friendly errors when the engine is unavailable.
- [ ] Support model-resolution callbacks from catalog or settings state.
- [ ] Support multiple local model sizes and quantizations.
- [ ] Support CPU, GPU, and platform-specific engine metadata.
- [ ] Support safe handling of malformed local model outputs.
- [ ] Support deterministic test engines.
- [ ] Support grammar selection by requested response format.
- [ ] Support tool-call shaping when local models can emit structured calls.
- [ ] Support privacy-friendly operation without network access.
- [ ] Support memory-pressure signals from the host.
- [ ] Support warm-cache status for settings or diagnostics UI.
- [ ] Support future engines behind the same LlamaEngine interface.
- [ ] Support documentation for host engine integration.
