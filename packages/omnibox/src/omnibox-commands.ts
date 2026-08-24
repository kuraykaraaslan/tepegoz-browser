import { foldForSearch } from '@tepegoz/i18n';

/**
 * `@`-scoped omnibox commands — the command mode, kept pure and separate from the suggestion builder.
 *
 * **The deterministic-address-bar rule, restated precisely rather than broken.** `omnibox-suggest.ts`
 * says the address bar "must NEVER start an AI thread (Comet lesson)", and that rule stands. What Comet
 * got wrong was *implicit* routing: ordinary typed text — a half-remembered URL, a search — silently
 * becoming a model prompt, so a user could not tell which of the two they were doing. `@agent` is the
 * opposite of that. It is a prefix the user types on purpose, it is never inferred, it never fires on
 * text that merely looks like a question, and non-`@` input keeps the exact deterministic
 * navigate/search behaviour it had before. One explicit door is not the same thing as a missing wall.
 *
 * Two deliberate consequences:
 *  - **No fuzzy matching on the prefix.** `@agent` is `@agent`; `@agnt` is not. A command mode that
 *    guessed would be the implicit routing this rule exists to forbid.
 *  - **`@agent` produces exactly one suggestion and never a navigation.** There is nothing for a
 *    mistaken Enter to open.
 */

export type OmniboxCommandId = 'agent' | 'download' | 'skill';

export interface OmniboxCommandSpec {
  id: OmniboxCommandId;
  /** Typed prefix, including the `@`. Matched case-insensitively, exactly — never fuzzily. */
  prefix: string;
  /** True when the command takes free text (`@agent <task>`) rather than picking from a list. */
  freeText: boolean;
}

/**
 * The complete set. `@workspace` is deliberately ABSENT: the phase's DoD line names it, but a
 * "workspace" is a Phase 2b noun and no such surface exists in this product yet, so a `@workspace`
 * command could only route somewhere it invented. Recorded in the phase file rather than shipped as a
 * command that does nothing.
 */
export const OMNIBOX_COMMANDS: readonly OmniboxCommandSpec[] = [
  { id: 'agent', prefix: '@agent', freeText: true },
  { id: 'download', prefix: '@download', freeText: false },
  { id: 'skill', prefix: '@skill', freeText: false },
];

/** What the omnibox is currently in the middle of typing. */
export type OmniboxCommandParse =
  /** A complete command with its argument (possibly empty). */
  | { kind: 'command'; id: OmniboxCommandId; term: string }
  /** A partial `@…` — show the command list filtered by what has been typed so far. */
  | { kind: 'partial'; typed: string }
  /** Not command mode at all; the ordinary deterministic path handles it. */
  | { kind: 'none' };

/**
 * Parse `@`-command mode off the raw omnibox text.
 *
 * A command is recognised only when the prefix is followed by a space or by end-of-input, so `@agents`
 * is not `@agent` with an argument of `s`. Without that, typing toward a longer command would fire a
 * shorter one mid-keystroke.
 */
export function parseOmniboxCommand(query: string): OmniboxCommandParse {
  const raw = query.trimStart();
  if (!raw.startsWith('@')) return { kind: 'none' };
  const lower = raw.toLowerCase();

  for (const spec of OMNIBOX_COMMANDS) {
    if (lower === spec.prefix) return { kind: 'command', id: spec.id, term: '' };
    if (lower.startsWith(`${spec.prefix} `)) {
      return { kind: 'command', id: spec.id, term: raw.slice(spec.prefix.length).trim() };
    }
  }
  // A bare `@`, or something on the way to a command — the user gets the menu, which is the only way
  // command mode is discoverable at all.
  return { kind: 'partial', typed: raw };
}

/** The commands whose prefix starts with what has been typed — the discovery list for `@…`. */
export function matchingCommands(typed: string): readonly OmniboxCommandSpec[] {
  const needle = foldForSearch(typed);
  return OMNIBOX_COMMANDS.filter((c) => foldForSearch(c.prefix).startsWith(needle));
}
