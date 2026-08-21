# @tepegoz/local-inference (L7)

The **on-device inference provider** for `@tepegoz/model-gateway`: `LocalProvider` implements the
gateway's `ModelProvider` contract on top of an injected `LlamaEngine`, so this package stays
Electron-free and never touches a native binary itself. The concrete engine (node-llama-cpp) is
implemented by the desktop app (`main/local-inference/llama-engine.electron.ts`) and injected in,
exactly like `CredentialVault` injects `SecretCrypto`. When `responseFormat:'json'` is requested, a
GBNF grammar constrains the small local model's output to a single well-formed JSON object, so a weak
model physically cannot emit prose or markdown fences around it.

## Exports

- **`LocalProvider`** — the `ModelProvider` adapter; resolves the selected model via
  `config.resolveModel()`, keeps it warm (`engine.load` is idempotent per model id), and applies the
  JSON grammar + sampling knobs before calling `engine.generate`.
- **`LlamaEngine`** — the injected host interface: `load`/`generate`/`unload`/`isAvailable`.
- **`LocalProviderConfig`** — what's injected into `LocalProvider` (`engine`, `resolveModel`, optional
  `sampling`).
- **`SelectedLocalModel`**, **`GenerateOptions`**, **`GenerateResult`**, **`LocalModelHandle`** — the
  request/response shapes crossing the `LlamaEngine` boundary.
- **`jsonObjectGrammar`** — returns the standalone GBNF grammar text that constrains generation to one
  JSON object (llama.cpp grammar format); the exact schema is still zod-validated downstream.
- **`grammarFor`**, **`toLocalTurns`** (from `map-request`) — pure request-side mapping: picks the
  grammar for a `CanonRequest` and flattens its messages to engine turns.
- **`fromLocalResult`** (from `map-response`) — pure response-side mapping: engine `GenerateResult` →
  canonical `CanonResponse`.

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`
