# @tepegoz/model-gateway (L7)

The **single, provider-agnostic entry point for every model call**. `ModelGateway.complete()` enforces
the two non-negotiable rules from `internal-ai-rules` — no uncapped (`maxTokens`) and no untimed
(`timeoutMs`) model call — before dispatching to a registered `ModelProvider`, then records usage to
the in-memory `TokenLedger` for cost transparency. `ModelRouter` maps a capability (`plan` / `exec` /
`classify` / …) to a model tier + effort level and decides local-vs-cloud transport based on the
cost-saver toggle. Every provider adapter normalizes its vendor's wire format to/from the canonical
`CanonRequest`/`CanonResponse` shapes, so the rest of the stack never sees vendor-specific formats.

## Exports

- **`ModelGateway`** — `register(provider)` / `complete(req)`; the max-tokens/timeout guard + Token
  Ledger recording live here.
- **`ModelRouter`** — pure `route(input)`: capability → `{ tier, transport, provider, model, effort }`;
  local-SLM offload is a no-op placeholder in Phase 1a (falls back to cloud) until ONNX/DirectML lands.
- **`TokenLedger`** — in-memory per-provider/model/capability usage + budget accounting.
- **`AnthropicProvider`** — Claude adapter over `@anthropic-ai/sdk`; adaptive-thinking + `effort` support,
  verified against the `claude-api` reference (`max_tokens` always required, `budget_tokens` never sent).
- **`OpenAIProvider`** (from `providers/openai.provider`) — talks to the Chat Completions REST endpoint
  directly over the central `@tepegoz/http` axios seam; **no vendor SDK**, unlike the Anthropic adapter.
- **`MockProvider`** — deterministic provider for tests/offline dev and the golden-LLM agent-eval replay.
- **Types**: `CanonRequest`/`CanonResponse`/`CanonMessage`/`CanonToolDef`/`CanonToolCall`/`ModelProvider`
  — the canonical request/response contract every adapter normalizes to.
- **`ANTHROPIC_MODEL`** / **`OPENAI_MODEL`** / **`LOCAL_MODEL`** / **`EffortLevel`** — centralized model-id
  and reasoning-effort tiers so callers never hardcode a model string.

## Notes

- Anthropic and OpenAI take deliberately different transports: Anthropic goes through its official SDK,
  OpenAI goes through the central `@tepegoz/http` client with no vendor SDK — see the adapters' doc
  comments for the reasoning per provider.

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`
