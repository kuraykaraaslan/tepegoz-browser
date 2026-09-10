import { useT } from '@tepegoz/i18n/react';
import { occupantList, type RoomView } from '@tepegoz/chat-core';
import { Avatar } from './Avatar';
import type { ChatUiStrings } from './i18n';
import { chatUiDict } from './i18n';
import { PresenceBadge } from './PresenceBadge';

export interface RoomMemberListProps {
  room: RoomView;
  /** Click a member — e.g. to start a 1:1 or insert an `@mention`. */
  onSelectMember?: (nick: string) => void;
}

function affiliationBadge(
  affiliation: string,
  role: string,
  s: ChatUiStrings['room'],
): string | null {
  if (affiliation === 'owner') return s.owner;
  if (affiliation === 'admin') return s.admin;
  if (role === 'moderator') return s.moderator;
  return null;
}

/**
 * A room's occupant list: role-ranked (moderators first) then Turkish-aware by nick, each with a
 * presence dot and — for owners / admins / moderators — a badge. Purely presentational.
 */
export function RoomMemberList({ room, onSelectMember }: Readonly<RoomMemberListProps>) {
  const s = useT(chatUiDict);
  const members = occupantList(room);

  return (
    <div className="chat-room-members">
      <h3 className="chat-room-members__head">
        {members.length} {s.room.members}
      </h3>
      <ul>
        {members.map((occupant) => {
          const badge = affiliationBadge(occupant.affiliation, occupant.role, s.room);
          return (
            <li key={occupant.nick} className="chat-room-members__row" data-affiliation={occupant.affiliation}>
              <button
                type="button"
                className="chat-room-members__pick"
                disabled={onSelectMember === undefined}
                onClick={() => onSelectMember?.(occupant.nick)}
              >
                <span className="chat-roster__avatar">
                  <Avatar name={occupant.nick} seed={occupant.realJid || occupant.nick} size="sm" />
                  <PresenceBadge presence={occupant.presence} dotOnly />
                </span>
                <span className="chat-room-members__nick">{occupant.nick}</span>
                {badge !== null && <span className="chat-room-members__badge">{badge}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
