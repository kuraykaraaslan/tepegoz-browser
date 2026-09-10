import { z } from 'zod';

/**
 * A single agent-eval scenario (AI-1 real-result eval loop). The scenario registry is UNTRUSTED input
 * loaded from disk, so it is `safeParse`d at the harness boundary — a malformed entry is skipped and
 * reported, never allowed to crash the run. Deliberately data-driven: a new scenario is one JSON entry,
 * not a code change.
 *
 * `target` is a discriminated pair: a local **fixture** page (deterministic regression) or a **realUrl**
 * (honest competence). `success` is **ground-truth first** — a `domAssertion` (text/selector expected on
 * the final page) and/or an `expectedValue` (matched against the agent's closing summary); `judgeRubric`
 * feeds the optional LLM-judge (AI-1 PR2) for open-ended tasks. `heldOut` marks the never-used-during-
 * development subset so fixes can't be overfit to the eval.
 */
export const EvalTargetSchema = z.union([
  z.object({ fixture: z.string().min(1) }),
  z.object({ realUrl: z.string().url() }),
  /** A seeded messenger state (`@tepegoz/ext-chat` agent capabilities, X-chat.6) rather than a web
   *  page: names a `<name>.chat.json` seed under the chat-fixtures dir. The harness seeds `ChatStore`
   *  from it and runs the agent with the `chat_*` tools against a `ChatCapabilityHost` — no network
   *  adapter, no live server. See {@link ChatEvalFixtureSchema}. */
  z.object({ chatFixture: z.string().min(1) }),
]);
export type EvalTarget = z.infer<typeof EvalTargetSchema>;

/**
 * A seeded chat conversation for a `chatFixture` scenario. `from` is a sender address; the literal
 * `"me"` is the account's own identity (an outgoing message). A `media` ref makes the message an
 * attachment the fixture media-resolver can produce bytes for (the media→sandbox scenario).
 */
export const ChatEvalSeedMessageSchema = z.object({
  from: z.string().min(1).max(320),
  body: z.string().max(100_000).default(''),
  media: z.string().max(2048).optional(),
  ts: z.number().int().nonnegative().optional(),
});
export type ChatEvalSeedMessage = z.infer<typeof ChatEvalSeedMessageSchema>;

export const ChatEvalSeedConversationSchema = z.object({
  id: z.string().min(1).max(128),
  kind: z.enum(['dm', 'room']),
  title: z.string().min(1).max(255),
  /** `false` ⇒ a non-roster DM the unknown-contact gate must hide from the agent by default. */
  knownContact: z.boolean().default(true),
  /** `true` ⇒ the user has opted the agent into this otherwise-gated conversation for the session. */
  optedIn: z.boolean().default(false),
  messages: z.array(ChatEvalSeedMessageSchema).max(500).default([]),
});
export type ChatEvalSeedConversation = z.infer<typeof ChatEvalSeedConversationSchema>;

/** The `<name>.chat.json` seed a `chatFixture` scenario points at — UNTRUSTED disk input, so
 *  `safeParse`d at the harness boundary exactly like the scenario registry itself. */
export const ChatEvalFixtureSchema = z.object({
  accountId: z.string().min(1).max(64),
  protocol: z.enum(['xmpp', 'irc', 'matrix']).default('xmpp'),
  /** Contact addresses that count as "known" — a DM whose peer is here is not gated. */
  roster: z.array(z.string().min(1).max(320)).max(200).default([]),
  conversations: z.array(ChatEvalSeedConversationSchema).max(50).default([]),
});
export type ChatEvalFixture = z.infer<typeof ChatEvalFixtureSchema>;

export const EvalSuccessSchema = z.object({
  /** Text (or selector) that MUST be present on the final page for a pass (ground truth). */
  domAssertion: z.string().min(1).optional(),
  /** Value that MUST appear in the agent's closing summary for a pass (ground truth). */
  expectedValue: z.string().min(1).optional(),
  /** The `StopReason` the run MUST end with (ground truth) — for scenarios whose DESIRED outcome is a
   *  stop, not a page state: e.g. `"handoff"` when the product's correct behaviour is refusing to act
   *  (sign-in walls, CAPTCHA). M1: `login_form` asserts this — the agent correctly never auto-submits
   *  credentials, so a "Welcome back" page assertion was a permanent false negative. */
  stoppedReason: z.string().min(1).optional(),
  /** Rubric for the optional LLM-judge on open-ended tasks (consumed in AI-1 PR2). */
  judgeRubric: z.string().min(1).optional(),
});
export type EvalSuccess = z.infer<typeof EvalSuccessSchema>;

export const EvalScenarioSchema = z.object({
  id: z.string().min(1),
  /** The user-style task handed to the agent verbatim. */
  task: z.string().min(1),
  target: EvalTargetSchema,
  success: EvalSuccessSchema,
  /**
   * Which exam this scenario belongs to (S11). `bridge` is the live-web stratum whose verified-completion
   * number is the published claim; absent means the ordinary scripted-fixture registry.
   *
   * A typed field rather than another tag, because the difference is load-bearing: a scripted-fixture
   * pass is a regression fence, a bridge pass is evidence. Conflating them is how a repo talks itself
   * into a claim it has not earned.
   */
  stratum: z.enum(['bridge']).optional(),
  /** Part of the Turkish-web sub-stratum, reported separately (S11). Absent ⇒ not in it. */
  turkishWeb: z.boolean().optional(),
  /** Held-out (never used while developing a fix) → reported separately from the dev metric. */
  heldOut: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
});
export type EvalScenario = z.infer<typeof EvalScenarioSchema>;

/** The registry file shape: a plain list of scenarios (one JSON file may hold several). */
export const EvalScenarioFileSchema = z.object({ scenarios: z.array(EvalScenarioSchema) });
export type EvalScenarioFile = z.infer<typeof EvalScenarioFileSchema>;
