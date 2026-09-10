/**
 * Room typing summary. A DM has one possible typist, so its header just says "typing…"; a room needs
 * to name who. Pure — the caller passes the already-localized fragments.
 *
 * `addresses` are protocol addresses (`room@conf/Bea`, `#chan/bea`, a bare JID); the display name is
 * the last `/`-delimited segment, falling back to the whole address.
 */

export interface TypingStrings {
  /** Suffix after a single name: "Bea " + this. */
  typingOne: string;
  /** Suffix after two names: "Bea & Cy " + this. */
  typingMany: string;
  /** Whole label for three or more typists. */
  typingSeveral: string;
}

export function typingName(address: string): string {
  const seg = address.split('/').pop();
  return seg !== undefined && seg.length > 0 ? seg : address;
}

/** A localized "X is typing…" line for a room, or `null` when nobody is. */
export function roomTypingLabel(
  addresses: readonly string[],
  s: TypingStrings,
): string | null {
  const names = addresses.map(typingName);
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} ${s.typingOne}`;
  if (names.length === 2) return `${names[0]} & ${names[1]} ${s.typingMany}`;
  return s.typingSeveral;
}
