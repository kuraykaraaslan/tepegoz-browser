import { useT } from '@tepegoz/i18n/react';
import { occupantCount, type RoomView } from '@tepegoz/chat-core';
import { chatUiDict } from './i18n';

export interface RoomHeaderProps {
  /** The room's display name / address. */
  name: string;
  /** Live room view (occupants + subject), when joined. */
  room?: RoomView;
  /** Fallback topic from the stored conversation row (used until the live subject arrives). */
  topicFallback?: string;
  membersOpen: boolean;
  onToggleMembers: () => void;
}

/** The conversation header for a MUC room: name, topic, member count, and a members toggle. */
export function RoomHeader({
  name,
  room,
  topicFallback = '',
  membersOpen,
  onToggleMembers,
}: Readonly<RoomHeaderProps>) {
  const s = useT(chatUiDict);
  const topic = (room?.subject ?? '').trim() || topicFallback.trim();
  const count = room !== undefined ? occupantCount(room) : 0;

  return (
    <header className="chat-room-header">
      <div className="chat-room-header__id">
        <h2>{name}</h2>
        <p className="chat-room-header__topic">{topic !== '' ? topic : s.room.noTopicHeader}</p>
      </div>
      <button
        type="button"
        className="chat-room-header__members-toggle"
        aria-pressed={membersOpen}
        onClick={onToggleMembers}
      >
        {count} {s.room.showMembers}
      </button>
    </header>
  );
}
