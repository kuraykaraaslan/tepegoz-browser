import { foldForSearch } from '@tepegoz/i18n';

/**
 * Mention / highlight detection — decides whether an incoming message pings the user, which drives
 * notification routing even in a muted room.
 *
 * Cross-protocol, deliberately conservative:
 * - **nick highlight** (IRC / XMPP MUC): a whole-word, fold-insensitive match of one of the user's
 *   own names.
 * - **`@mention`** (Matrix / modern XMPP): `@name` or a bare Matrix user id.
 * - **room ping**: `@room` / `@here` / `@channel` / `@everyone` — a broadcast that reaches everyone.
 */

const ROOM_PING = /(^|\s)@(room|here|channel|everyone|all)\b/i;

export interface MentionScan {
  /** Names / `@name` tokens found in the body (folded). */
  names: string[];
  /** The message addresses the whole room. */
  roomPing: boolean;
}

/** Extract mention tokens from a body. `@ada` and a leading `ada:` (IRC address form) both count. */
export function scanMentions(body: string): MentionScan {
  const names = new Set<string>();
  for (const m of body.matchAll(/(?:^|[\s(])@([\p{L}\p{N}._-]{1,64})/gu)) {
    const name = m[1];
    if (name !== undefined) names.add(foldForSearch(name));
  }
  const addr = /^([\p{L}\p{N}._-]{1,64})[:,]\s/u.exec(body);
  if (addr?.[1] !== undefined) names.add(foldForSearch(addr[1]));
  return { names: [...names], roomPing: ROOM_PING.test(body) };
}

/** True when a message pings `self` — any of the user's names appears as a `@mention`, as an IRC
 *  address prefix, or as a standalone whole word in the body; or it is a room-wide ping. */
export function isMention(body: string, selfNames: readonly string[]): boolean {
  const folded = selfNames.map(foldForSearch).filter((n) => n.length > 0);
  if (folded.length === 0) return false;

  const scan = scanMentions(body);
  if (scan.roomPing) return true;
  if (scan.names.some((n) => folded.includes(n))) return true;

  const foldedBody = foldForSearch(body);
  return folded.some((name) => {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}([^\\p{L}\\p{N}]|$)`, 'u');
    return re.test(foldedBody);
  });
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
