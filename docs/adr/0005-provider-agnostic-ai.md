# ADR-0005: Provider-agnostic AI, BYO-key local-first

- **Status:** Accepted
- **Date:** 2026-06-30

## Context
Users must be able to run with their own Claude/OpenAI/Gemini keys, fully local-first, with zero
dependency on our backend. A managed subscription (proxy) and cloud memory sync come later and must
not require a rewrite.

## Decision
A **provider-agnostic Model Gateway** (base.provider → anthropic/openai/gemini concrete, selected via
config — the standard provider pattern). Claude is the reference default (Opus = planning, Sonnet =
execution, Haiku = classification). Keys live **only in the main process**, encrypted via OS
`safeStorage` — never in env files or the bundle. A `ModelTransport` seam (Local ↔ Backend) is
present from day 1 so a Phase-3 managed proxy plugs in without a rewrite.

## Consequences
- Genuinely free local-first tier (no upsell tunnel).
- Every model call requires `max_tokens` + timeout + a documented token budget (cost transparency).
- Model/SDK specifics (effort vs budget_tokens, compaction support per model, high-res vision tier,
  prompt-cache rules) are verified against the `claude-api` reference at implementation time.
