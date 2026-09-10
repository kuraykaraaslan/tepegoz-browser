import type { CSSProperties } from 'react';
import { useLocale } from '@tepegoz/i18n/react';

/**
 * A contact / room / sender avatar: a coloured disc with the initials of its name. Purely visual —
 * the initials are drawn by the stylesheet via `content: attr(data-initials)` so the element
 * contributes **no text** to its parent's `textContent` (conversation-row and timeline tests assert
 * on that), and the whole thing is `aria-hidden` because the accessible name always lives on the
 * sibling label. The colour is a deterministic hue of the seed, so a given identity keeps the same
 * avatar across renders, reloads and devices.
 */

export type AvatarSize = 'sm' | 'md' | 'lg';

/** Deterministic 0–359 hue from a string (FNV-ish rolling hash). */
export function avatarHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Up to two initials from a name — first letters of the first two words, else the first two
 *  characters. Splits on whitespace and the punctuation common to handles / room ids
 *  (`@ . _ - / : # ! & + ~`), so `#tepegoz:matrix.org` → `TM` and `ada@example.org` → `AE`. */
export function avatarInitials(name: string, locale?: string): string {
  const parts = name
    .trim()
    .split(/[\s@._/:#!&+~-]+/u)
    .filter((p) => p.length > 0);
  const raw =
    parts.length >= 2
      ? (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
      : (parts[0] ?? '').slice(0, 2);
  return raw.toLocaleUpperCase(locale);
}

export interface AvatarProps {
  /** Display name (or address) the initials are taken from. */
  name: string;
  /** Stable identity for the colour hue; defaults to `name`. Pass a conversation / account id so a
   *  rename keeps the colour. */
  seed?: string;
  size?: AvatarSize;
}

export function Avatar({ name, seed, size = 'md' }: Readonly<AvatarProps>) {
  const locale = useLocale();
  const label = name.trim();
  const initials = avatarInitials(label, locale) || '#';
  const hue = avatarHue(seed ?? label ?? '?');
  return (
    <span
      className="chat-avatar"
      data-size={size}
      data-initials={initials}
      aria-hidden="true"
      style={{ '--chat-avatar-hue': String(hue) } as CSSProperties}
    />
  );
}
