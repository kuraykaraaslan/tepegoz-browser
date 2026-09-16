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
 * were verified against the vendor's own current model-overview page on 2026-09-16; the Kimi and Nova
 * entries carry forward the context figures already stated as fact in `models.ts`'s own comments on
 * {@link KIMI_MODEL} / {@link NOVA_MODEL}. Every other configured provider (OpenAI, Gemini, DeepSeek,
 * xAI, Groq) is deliberately left OUT rather than guessed at: a spot-check while building this table
 * found the OpenAI and Gemini model ids this project has configured no longer appear on either vendor's
 * current model-lineup page (both have moved to newer names since `models.ts` was last tuned) — proof
 * that a number copied from memory here would be exactly as likely to be stale as it would be correct.
 * Extend this table only from a vendor's current published spec, never from recollection.
 */
export const MODEL_CONTEXT_WINDOW_TOKENS: Readonly<Record<string, number>> = {
  // Anthropic — https://platform.claude.com/docs/en/about-claude/models/overview, verified 2026-09-16.
  'claude-opus-5': 1_000_000,
  'claude-sonnet-5': 1_000_000,
  'claude-fable-5-1': 1_000_000,
  'claude-haiku-4-5': 200_000,
  'claude-haiku-4-5-20251001': 200_000,
  // Kimi (Moonshot) — 256k figure already asserted in models.ts's KIMI_MODEL doc comment.
  'kimi-k2.6': 256_000,
  'moonshot-v1-8k': 8_000,
  // Amazon Nova — 64k figure already asserted in models.ts's NOVA_MODEL doc comment.
  'nova-2-lite-v1': 64_000,
};

/** The known context-window ceiling for `model`, or `null` when this table has no verified entry for
 *  it — the caller's honest signal to skip the check rather than enforce a guessed number. */
export function contextWindowFor(model: string): number | null {
  return MODEL_CONTEXT_WINDOW_TOKENS[model] ?? null;
}
