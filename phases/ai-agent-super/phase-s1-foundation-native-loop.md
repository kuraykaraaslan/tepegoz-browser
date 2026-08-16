# Phase S1 — Foundation: Native Loop (Foundation)

**Status:** ⬜ Not started · **Depends on:** [S0 — Truth & Repair](phase-s0-truth-and-repair.md) · **Track:** [AI Agent Super](README.md)

**Goal:** Replace JSON-in-text decisions with native provider tool-calling wherever the provider supports it, and widen `CanonMessage.content` from a bare string to multimodal content blocks — the structural prerequisite for vision (S10). Stream response deltas to the renderer event stream so steps stop feeling slow, while keeping the Journal and the decision path settled-results-only. This is the substrate that S7 (speed), S8 (UX streaming), and S10 (vision) all build on; nothing above it can move until the canonical message shape and the decision transport are fixed here.

## Why

The live decision path parses JSON out of free text. [reactor-decision.ts](../../packages/orchestrator/src/reactor-decision.ts) runs `extractJson` → `coerceDecisionShape` → `salvageTruncatedState` → zod on a text completion. The salvage machinery and the transport-invalid exclusion plumbing that just landed on this branch (`isTransportInvalid`, `navigateWhenReady`) exist **because** a verbose model truncates the trailing `state` field mid-token — a self-inflicted class of failure that only exists because the decision rides inside prose. That path is brittle, unstreamable, and text-only.

- **Text-only content blocks vision forever.** [types.ts:6](../../packages/model-gateway/src/types.ts) declares `CanonMessage.content` as `string`. Screenshots are captured (`browser_get_screenshot`, [packages/screenshots](../../packages/screenshots)) but can never reach the model through a string field. S10 is dead on arrival until this widens.
- **Non-streaming is locked in.** [streaming-guard.test.ts](../../packages/model-gateway/src/streaming-guard.test.ts) asserts "nothing partial reaches the Journal", so the whole UI waits for a completed step before any text appears (pain 3/4 in [history.md](history.md)). The invariant is correct about the Journal but wrong about the renderer — it forbids both.
- **The native plumbing is half-present.** `CanonRequest` already carries `tools?`; the `CanonToolCall` type already exists and adapters already map it. Native tool-calling is a partial build, not a greenfield one.
- **Every rival streams and uses native tool calls.** Claude for Chrome's quick-mode depends on native encoding ([history.md](history.md) competitive notes). Staying on JSON-in-text is a structural handicap, not a stylistic choice.
- **Measured reality ([eval-results.md](eval-results.md)):** the Anthropic DoD tier is the one provider we measure live, and it is exactly the tier that supports native tool_use — so the paired win here is measurable on the funded tier, not hypothetical.

## Exit criteria (DoD)

- [ ] `CanonMessage.content` is `string | CanonContentBlock[]` (`text | image | tool_use | tool_result`) with the zod schema owned by `@tepegoz/shared-types` and re-exported by [types.ts](../../packages/model-gateway/src/types.ts); `safeParse` at the gateway trust boundary; no `@ts-ignore`, no file over 250 lines.
- [ ] Per-provider `supportsNativeTools` capability flag exists in [packages/model-gateway/src/providers](../../packages/model-gateway/src/providers); anthropic/openai/gemini normalize native tool-call responses into `CanonToolCall`; kimi and local GGUF keep JSON-in-text via [json-grammar.ts](../../packages/local-inference/src/json-grammar.ts).
- [ ] `reactor.ts` decision acquisition is strategy-selected behind `TEPEGOZ_DECISION_MODE` (native tool_use when supported, JSON fallback otherwise), so a single-change paired sweep is possible.
- [ ] `gateway.generateStream` emits deltas to the renderer event stream ([ipc-agent-run.ts](../../apps/desktop/src/main/ipc/ipc-agent-run.ts) path); the **revised** [streaming-guard.test.ts](../../packages/model-gateway/src/streaming-guard.test.ts) is green and proves no partial ever reaches the Journal or the decision path.
- [ ] First-delta latency **< 2s p50 on a scripted run** (deterministic, non-funded — measured against `ScriptedProvider`).
- [ ] **(⏸ funded sweep)** Paired single-change sweep, anthropic tier, web-patterns + acceptance pooled (15 scenarios × N=3/arm, JSON arm vs native arm): pooled completion within **±10pp equivalence**.
- [ ] **(⏸ funded sweep)** Decision-parse / transport-invalid **exclusion rate falls to ~0 in the native arm**, against S0's baseline "before" exclusion rate — this is the falsifiable win.
- [ ] Fixtures frozen in PR0 before any capability code lands (constitution); this phase adds **no new** scenarios and reuses the existing registry.
- [ ] Delta recorded in [eval-results.md](eval-results.md) and the [PROSE-LEDGER.md](PROSE-LEDGER.md) run index; funded rows stay marked ⏸ until the sweep runs and the delta lands. Phase legitimately rests at 🟠 measurement-owed until then.
- [ ] No prompt-prose change lands in this phase (attribution hygiene — see Prose steers). Any UI-string surface touched ships EN + full-TR parity in the same PR.

## Tasks

### PR0 — fixture freeze (no capability code)
- [ ] Confirm the paired-sweep set is the existing web-patterns + acceptance registries in [packages/agent-eval](../../packages/agent-eval); freeze the scenario list and record it in the run index so the JSON/native arms are provably the same 15 scenarios.
- [ ] Record S0's baseline exclusion rate (`isTransportInvalid` / decision-parse) as the frozen "before" number in [eval-results.md](eval-results.md).

### PR1 — content-block schema + CanonMessage widening
- [ ] Add `CanonContentBlock` zod schemas (`text | image | tool_use | tool_result`) to `@tepegoz/shared-types` (sole schema source per ADR-0010); derive the TS types from the schema.
- [ ] Re-export from [types.ts](../../packages/model-gateway/src/types.ts); widen `CanonMessage.content` to `string | CanonContentBlock[]`; keep string as the normalized default so existing callers compile unchanged.
- [ ] Update mock + `ScriptedProvider` ([packages/agent-eval](../../packages/agent-eval)) to accept and round-trip block content.
- [ ] `safeParse` the widened content at the gateway boundary; split files if the schema push crosses 250 lines.

### PR2 — anthropic native normalization
- [ ] Add `supportsNativeTools = true` to the anthropic provider ([packages/model-gateway/src/providers](../../packages/model-gateway/src/providers)).
- [ ] Normalize native `tool_use` response blocks into `CanonToolCall` (reuse the existing adapter mapping); map `CanonRequest.tools` into the Anthropic tools payload.
- [ ] Round-trip `tool_result` blocks back as follow-up `CanonMessage` content.

### PR3 — openai + gemini native
- [ ] `supportsNativeTools = true` for openai; normalize function-call responses → `CanonToolCall` (own adapter PR to stay under 250 lines).
- [ ] `supportsNativeTools = true` for gemini; normalize `functionCall` parts → `CanonToolCall`.
- [ ] Leave kimi (`supportsNativeTools = false`, partial-compat) and local GGUF on the JSON-in-text path via [json-grammar.ts](../../packages/local-inference/src/json-grammar.ts).

### PR4 — reactor decision-mode strategy
- [ ] In [reactor.ts](../../packages/orchestrator/src/reactor.ts) + [reactor-decision.ts](../../packages/orchestrator/src/reactor-decision.ts), make decision acquisition strategy-selected: native `tool_use` when `supportsNativeTools`, else the existing JSON parse.
- [ ] Gate the strategy behind `TEPEGOZ_DECISION_MODE` (`native` | `json` | `auto`) so the paired sweep is a single controlled change.
- [ ] Keep `coerceDecisionShape` + zod validation as the settle step for **both** arms; do **not** delete `salvageTruncatedState` yet (see Risks).

### PR5 — ADR-0025 + streaming boundary
- [ ] Author ADR-0025: deltas MAY flow to the renderer event stream; only settled + validated results reach the Journal and the decision path. Supersede the old "nothing partial streams anywhere" reading.
- [ ] Add `gateway.generateStream` with a delta callback; wire deltas to the renderer via the [ipc-agent-run.ts](../../apps/desktop/src/main/ipc/ipc-agent-run.ts) event stream.
- [ ] **Rewrite** [streaming-guard.test.ts](../../packages/model-gateway/src/streaming-guard.test.ts) to lock the new invariant (partials reach the renderer; Journal + decision path stay settled-only). Do not delete it.
- [ ] Add the scripted first-delta-<2s-p50 assertion.

### PR6 — paired native-vs-JSON sweep (⏸ funded)
- [ ] Run the frozen 15-scenario set × N=3 on both `TEPEGOZ_DECISION_MODE` arms, anthropic tier.
- [ ] Record pooled completion equivalence + native-arm exclusion rate in [eval-results.md](eval-results.md); flip the phase to ✅ only when the delta lands.

## Fixtures

**None new.** The paired sweep reuses the existing web-patterns + acceptance registries in [packages/agent-eval](../../packages/agent-eval); PR0 freezes the 15-scenario set and the S0 "before" exclusion baseline so the two decision-mode arms are provably identical inputs.

## Prose steers

**NONE.** This phase must not touch prompt prose — no edit to `SECURITY_PREAMBLE`, [reactor-prompt.ts](../../packages/orchestrator/src/reactor-prompt.ts) `BROWSING_STRATEGY`, or `wrapUserRequest`. The win here is transport, not instruction; keeping prose untouched preserves attribution hygiene and keeps the paired sweep a genuine single-change measurement. Owns no [PROSE-LEDGER.md](PROSE-LEDGER.md) rows.

## ADR

- **Adds ADR-0025** — streaming boundary: deltas to the renderer are permitted; the Journal and the decision path remain settled-and-validated-only. Records the rewrite (not deletion) of the streaming guard.
- **Amends ADR-0005** — compatibility note: canonical content blocks (`text | image | tool_use | tool_result`) stay provider-agnostic; per-provider native tool-calling is normalized **into** the canonical shape, never leaked out of it.

## Risks

- **5-provider matrix explosion.** Mitigate with the `supportsNativeTools` capability flag: only anthropic/openai/gemini get native normalization; kimi and local GGUF stay on the proven JSON-in-text path via [json-grammar.ts](../../packages/local-inference/src/json-grammar.ts). No provider is forced onto native.
- **`salvageTruncatedState` becomes dead in native mode.** It is only reachable on the JSON arm. Delete it **only after** PR6 proves the native arm drives the exclusion rate to ~0 — consolidation discipline applies to code crutches too. Removing it before the sweep would destroy the fallback the JSON arm still needs.
- **Widening `CanonMessage.content` ripples through every caller.** Mitigate: keep `string` the normalized default in PR1 so existing code compiles unchanged; blocks are opt-in until S10 needs them. Treat PR1 as a spike-first, compile-the-world PR before any provider work.
- **Renderer delta stream races the settle step.** Mitigate: the revised guard test asserts ordering — a partial may render but the Journal write and the decision coercion only fire on the validated final result; no partial ever influences the loop.
