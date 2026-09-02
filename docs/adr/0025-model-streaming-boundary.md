# ADR-0025: Model streaming boundary — deltas to the renderer, settled results to the Journal

- **Status:** Accepted
- **Date:** 2026-08-18
- **Refines:** [ADR-0005](0005-provider-agnostic-ai.md) (provider-agnostic gateway) ·
  **complements** [ADR-0013](0013-agent-orchestration-hitl.md) (agent orchestration + two-stage HITL)
- **Phase:** [S1 — Foundation: Native Loop](../../phases/ai-agent/phase-s1-foundation-native-loop.md) PR5

## Context

Every provider adapter was non-streaming, and a test —
[`streaming-guard.test.ts`](../../packages/model-gateway/src/streaming-guard.test.ts) — locked that in.
Its stated invariant was right: _"streaming is NOT written to the DB — only a full, validated response is
committed to the Journal."_ Its **mechanism** was the problem. It enforced that invariant by asserting
that no adapter can stream **at all**, which conflates two different questions:

1. **May a partial response influence state?** No — it is unvalidated, possibly half a token, and the
   model may revise it. Nothing durable or decision-bearing may read it.
2. **May a partial response be _shown to a human_?** That is a UI question, and the answer "no" costs the
   user the entire duration of a model call with no feedback. It is the mechanical cause of pain 3 and 4
   in [`history.md`](../../phases/ai-agent/history.md) ("too slow", "weak control feel").

Because the guard could only express the first answer by forbidding the second, tepegoz waits for a
whole step to settle before a single character appears. Every rival streams.

## Decision

**A model-output delta MAY flow to the renderer. Only a settled, validated response may reach the Journal
or the decision path.**

Concretely:

- `ModelGateway.generateStream(req, onDelta)` runs the **identical** guards as `complete` — required
  `max_tokens`/timeout, content `safeParse`, the per-run model pin, the Egress Firewall, the Token Ledger
  — and returns the **same settled `CanonResponse`**. Deltas go to the caller's sink and nowhere else.
- `ModelProvider.completeStream` is **optional**. An adapter without it still streams _correctly_, just
  not _early_: the gateway emits the settled text as a single delta. That is the honest shape of "this
  provider cannot stream" — never simulated typing over an already-complete string.
- The reactor streams only when a sink is supplied (`ReactOptions.onModelDelta`). The decision is parsed
  from the settled response in both cases; the sink is never read back by the loop.
- Deltas travel on their **own IPC channel** (`agent:delta`), not as an `AgentEvent`. They are ephemeral
  and are never journaled, never persisted to conversation history, and never replayed. Keeping them off
  the event union is what makes "a delta is not a record" structural rather than a convention someone
  has to remember.

## Consequences

**The guard test is rewritten, not deleted.** It now locks the boundary instead of the absence of a
feature: `complete()` still uses the non-streaming API on every adapter; a delta never reaches a journal
write or the decision parse; and the settled response is what the caller receives. A future PR that lets
a partial influence the loop breaks it, which is the point.

**Streamed content is still untrusted.** A delta is model output, so it is rendered as plain text, never
as markup or markdown, and it carries no authority: an approval, a plan, or a tool call is only ever read
from the settled response that already passed zod.

**Ordering is asserted, not assumed.** The renderer may paint a partial before the Journal write happens;
what may never happen is the Journal write (or the decision coercion) firing on anything but the final
validated result.

**Cancellation is unchanged.** The abort signal and timeout wrap the streaming call exactly as they wrap
`complete`; an aborted stream raises the same `AppError` and emits no further deltas.

## Alternatives considered

- **Keep everything non-streaming.** Simplest, and what the old guard enforced. Rejected: it makes
  time-to-first-feedback structurally equal to a whole step, which is a headline metric for
  [S7](../../phases/ai-agent/phase-s7-speed.md) and
  [S8](../../phases/ai-agent/phase-s8-assistant-ux.md), and no amount of UI work can recover it.
- **Stream into the Journal and mark rows provisional.** Rejected: it puts unvalidated model output into
  the durable audit record, and every reader would then have to know which rows to distrust.
- **Simulate streaming in the renderer by animating the settled text.** Rejected: it is vanity — it shows
  motion without moving the first character any earlier, and it would make a latency metric meaningless.
