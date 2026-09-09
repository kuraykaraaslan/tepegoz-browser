import { useT } from '@tepegoz/i18n/react';
import { occupantCount, type RoomNotifyLevel, type RoomView } from '@tepegoz/chat-core';
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
  /** The room's notification level; the picker is shown only when `onSetNotifyLevel` is also given. */
  notifyLevel?: RoomNotifyLevel;
  onSetNotifyLevel?: (level: RoomNotifyLevel) => void;
}

/** The conversation header for a MUC room: name, topic, member count, and a members toggle. */
export function RoomHeader({
  name,
  room,
  topicFallback = '',
  membersOpen,
  onToggleMembers,
  notifyLevel = 'all',
  onSetNotifyLevel,
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
      <div className="chat-room-header__actions">
        {onSetNotifyLevel !== undefined && (
          <select
            className="chat-room-header__notify"
            aria-label={s.room.notify}
            value={notifyLevel}
            onChange={(e) => {
              const v = e.target.value;
              onSetNotifyLevel(v === 'mentions' || v === 'none' ? v : 'all');
            }}
          >
            <option value="all">{s.room.notifyAll}</option>
            <option value="mentions">{s.room.notifyMentions}</option>
            <option value="none">{s.room.notifyNone}</option>
          </select>
        )}
        <button
          type="button"
          className="chat-room-header__members-toggle"
          aria-pressed={membersOpen}
          onClick={onToggleMembers}
        >
          {count} {s.room.showMembers}
        </button>
      </div>
    </header>
  );
}
