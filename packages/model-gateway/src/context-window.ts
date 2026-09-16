/**
 * Known context-window ceilings (INPUT tokens), by exact model id — S7 PR7's pre-flight request-body
 * size guard. The caching path already measures and reports what a request cost; nothing checked the
 * assembled body against the provider's limit BEFORE dispatch, so an over-budget run learned about it
 * from a 400 the provider sent back after a real network round trip, worded however that vendor words
 * it, instead of a clear local reason before the request ever left the device.
 *
 * An unlisted model is deliberately NOT assumed unbounded, and the guard simply skips it — a wrong
 * ceiling in either direction is worse than no check at all: too low silently fails a call that would
 * have succeeded, too high never catches the real overflow this guard exists for. Anthropic's entries
 * were verified against the vendor's own current model-overview page on 2026-09-16. Every other
 * configured provider (OpenAI, Gemini, DeepSeek, xAI, Groq) is deliberately left OUT rather than
 * guessed at: a spot-check while building this table found the OpenAI and Gemini model ids this
 * project has configured no longer appear on either vendor's current model-lineup page (both have
 * moved to newer names since `models.ts` was last tuned) — proof that a number copied from memory here
 * would be exactly as likely to be stale as it would be correct. Extend this table only from a
 * vendor's current published spec, never from recollection — including an in-repo comment: this
 * table's FIRST cut trusted `models.ts`'s own doc comment for Nova (which said "64k context") and
 * shipped a ceiling low enough to wrongly reject a legitimate large request; AWS's Bedrock model card
 * says 1M context / 64K max OUTPUT, a different number the comment had conflated. Fixed the same day,
 * and the comment in `models.ts` too — recorded so the failure mode ("an in-repo source is not
 * automatically a verified one") does not repeat for the next entry.
 */
export const MODEL_CONTEXT_WINDOW_TOKENS: Readonly<Record<string, number>> = {
  // Anthropic — https://platform.claude.com/docs/en/about-claude/models/overview, verified 2026-09-16.
  'claude-opus-5': 1_000_000,
  'claude-sonnet-5': 1_000_000,
  'claude-fable-5-1': 1_000_000,
  'claude-haiku-4-5': 200_000,
  'claude-haiku-4-5-20251001': 200_000,
  // Amazon Nova — AWS Bedrock model card (docs.aws.amazon.com/bedrock/.../model-card-amazon-nova-2
  // -lite.html), verified 2026-09-16: "Context window: 1M tokens", "Max output tokens: 64K".
  'nova-2-lite-v1': 1_000_000,
  // Kimi (Moonshot) — re-verified independently 2026-09-16 (not just carried from models.ts's own
  // comment, per the Nova lesson above): third-party model-card aggregation puts K2.6 at 262,144
  // tokens; 256,000 here is the conservative round-down, which only ever rejects slightly EARLIER
  // than the real limit, never later. `moonshot-v1-8k` is trusted from its own name — Moonshot's
  // classic naming convention (`-8k`/`-32k`/`-128k`) IS the context size, not a marketing label.
  'kimi-k2.6': 256_000,
  'moonshot-v1-8k': 8_000,
};

/** The known context-window ceiling for `model`, or `null` when this table has no verified entry for
 *  it — the caller's honest signal to skip the check rather than enforce a guessed number. */
export function contextWindowFor(model: string): number | null {
  return MODEL_CONTEXT_WINDOW_TOKENS[model] ?? null;
}
