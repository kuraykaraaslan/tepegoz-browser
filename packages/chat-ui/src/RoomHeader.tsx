import { useT } from '@tepegoz/i18n/react';
import { occupantCount, type RoomNotifyLevel, type RoomView } from '@tepegoz/chat-core';
import { chatUiDict } from './i18n';
import { NotEncryptedBadge } from './NotEncryptedBadge';

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
  /** The room's protocol offers no end-to-end encryption (IRC) — show the plaintext marker. */
  notEncrypted?: boolean;
  /** Whether the room is muted; the toggle is shown only when `onToggleMuted` is also given. */
  muted?: boolean;
  onToggleMuted?: () => void;
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
  notEncrypted = false,
  muted = false,
  onToggleMuted,
}: Readonly<RoomHeaderProps>) {
  const s = useT(chatUiDict);
  const topic = (room?.subject ?? '').trim() || topicFallback.trim();
  const count = room !== undefined ? occupantCount(room) : 0;

  return (
    <header className="chat-room-header">
      <div className="chat-room-header__id">
        <h2>{name}</h2>
        <p className="chat-room-header__topic">{topic !== '' ? topic : s.room.noTopicHeader}</p>
        {notEncrypted && <NotEncryptedBadge />}
      </div>
      <div className="chat-room-header__actions">
        {onToggleMuted !== undefined && (
          <button
            type="button"
            className="chat-room-header__mute"
            aria-pressed={muted}
            onClick={onToggleMuted}
          >
            {muted ? s.workspace.unmute : s.workspace.mute}
          </button>
        )}
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
