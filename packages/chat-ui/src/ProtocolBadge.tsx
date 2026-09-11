import { useT } from '@tepegoz/i18n/react';
import { chatUiDict } from './i18n';

/**
 * Which network an account/conversation speaks — a small badge so a multi-account, multi-protocol
 * roster (XMPP, IRC, Matrix, a bridged network) reads at a glance instead of every row looking the
 * same. Abstract marks, not the networks' actual logos — this stays a dependency-free `chat-ui` leaf
 * (see `GearIcon` in `ChatWorkspace.tsx`) and avoids redrawing third-party brand artwork.
 */

export type ChatProtocolKind = 'xmpp' | 'irc' | 'matrix' | 'bridge';

function normalizeProtocol(protocol: string): ChatProtocolKind {
  return protocol === 'xmpp' || protocol === 'irc' || protocol === 'matrix' || protocol === 'bridge'
    ? protocol
    : 'bridge';
}

const GLYPH: Record<ChatProtocolKind, string> = {
  xmpp: 'X',
  irc: '#',
  matrix: 'M',
  bridge: '⇄',
};

export interface ProtocolBadgeProps {
  /** `ChatAccount['server']['protocol']` — an unrecognised value reads as a generic bridge mark. */
  protocol: string;
}

/** A small labelled glyph identifying a protocol — pair with `.chat-conv__avatar` / an account row. */
export function ProtocolBadge({ protocol }: Readonly<ProtocolBadgeProps>) {
  const s = useT(chatUiDict);
  const kind = normalizeProtocol(protocol);
  return (
    <span className="chat-protocol-badge" data-protocol={kind} title={s.protocol[kind]}>
      <span aria-hidden="true">{GLYPH[kind]}</span>
      <span className="chat-presence__sr-only">{s.protocol[kind]}</span>
    </span>
  );
}
