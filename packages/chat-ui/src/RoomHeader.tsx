import { useEffect, useState } from 'react';
import { useT } from '@tepegoz/i18n/react';
import { occupantCount, type RoomNotifyLevel, type RoomView } from '@tepegoz/chat-core';
import { Avatar } from './Avatar';
import { chatUiDict } from './i18n';
import { MuteMenu } from './MuteMenu';
import { NotEncryptedBadge } from './NotEncryptedBadge';

/**
 * Small inline icons for the toolbar — `chat-ui` is a string-free leaf with no icon-font dependency
 * (see `GearIcon` in `ChatWorkspace.tsx`), so a compact icon toolbar draws its own glyphs rather than
 * pulling in an icon library.
 */
function InviteIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="7" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2.5 17c.5-3.3 2.9-5.2 5.5-5.2s5 1.9 5.5 5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M16 6v5M13.5 8.5h5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MembersIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <circle cx="7" cy="6.5" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2.3 16c.4-3 2.3-4.7 4.7-4.7s4.3 1.7 4.7 4.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12.3 4.3c1.3.3 2.2 1.4 2.2 2.7 0 1.2-.8 2.3-2 2.6M14 11.6c1.9.5 3.2 2 3.6 4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LeaveIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M8 3.3H4.7A1.2 1.2 0 0 0 3.5 4.5v11A1.2 1.2 0 0 0 4.7 16.7H8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 10h7.5M13.3 6.8l3.2 3.2-3.2 3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <rect x="3" y="4" width="14" height="3.2" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M4.3 7.5v7a1.2 1.2 0 0 0 1.2 1.2h9a1.2 1.2 0 0 0 1.2-1.2v-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8.2 10.5h3.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

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
  /** Whether the room is muted right now (forever, or a still-active timed mute) — the mute menu is
   *  shown only when `onMuteFor` / `onUnmute` are also given. */
  mutedNow?: boolean;
  onMuteFor?: (durationMs: number | null) => void;
  onUnmute?: () => void;
  /** Whether the room is archived — the toggle is shown only when `onToggleArchived` is also given. */
  archived?: boolean;
  onToggleArchived?: () => void;
  /** Commit a new topic; the "Edit topic" affordance is shown only when this is given. */
  onSetTopic?: (topic: string) => void;
  /** Invite a contact to the room; the "Invite" affordance is shown only when this is given. */
  onInvite?: (invitee: string) => void;
  /** Leave the room; the action is shown only when this is given (a second click confirms it). */
  onLeave?: () => void;
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
  mutedNow = false,
  onMuteFor,
  onUnmute,
  archived = false,
  onToggleArchived,
  onSetTopic,
  onInvite,
  onLeave,
}: Readonly<RoomHeaderProps>) {
  const s = useT(chatUiDict);
  const topic = (room?.subject ?? '').trim() || topicFallback.trim();
  const count = room !== undefined ? occupantCount(room) : 0;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(topic);
  const [inviting, setInviting] = useState(false);
  const [invitee, setInvitee] = useState('');
  const [leaveArmed, setLeaveArmed] = useState(false);
  const commitInvite = (): void => {
    const who = invitee.trim();
    setInviting(false);
    setInvitee('');
    if (who !== '') onInvite?.(who);
  };
  // Re-seed the draft whenever the live topic changes while not editing.
  useEffect(() => {
    if (!editing) setDraft(topic);
  }, [topic, editing]);

  const commit = (): void => {
    setEditing(false);
    if (draft !== topic) onSetTopic?.(draft);
  };
  const cancel = (): void => {
    setEditing(false);
    setDraft(topic);
  };

  return (
    <header className="chat-room-header">
      <div className="chat-room-header__lead">
        <span className="chat-room-header__avatar">
          <Avatar name={name} seed={name} />
        </span>
        <div className="chat-room-header__id">
          <h2>{name}</h2>
          {editing ? (
            <input
              className="chat-room-header__topic-input"
              aria-label={s.room.editTopic}
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                else if (e.key === 'Escape') cancel();
              }}
            />
          ) : (
            <p className="chat-room-header__topic">
              <span className="chat-room-header__topic-text" title={topic !== '' ? topic : undefined}>
                {topic !== '' ? topic : s.room.noTopicHeader}
              </span>
              {onSetTopic !== undefined && (
                <button
                  type="button"
                  className="chat-room-header__topic-edit"
                  onClick={() => {
                    setDraft(topic);
                    setEditing(true);
                  }}
                >
                  {s.room.editTopic}
                </button>
              )}
            </p>
          )}
          {notEncrypted && <NotEncryptedBadge />}
        </div>
      </div>
      <div className="chat-room-header__actions">
        {onInvite !== undefined &&
          (inviting ? (
            <input
              className="chat-room-header__invite-input"
              aria-label={s.room.invite}
              placeholder={s.room.invitePlaceholder}
              value={invitee}
              autoFocus
              onChange={(e) => setInvitee(e.target.value)}
              onBlur={commitInvite}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitInvite();
                else if (e.key === 'Escape') {
                  setInviting(false);
                  setInvitee('');
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="chat-room-header__icon-btn"
              title={s.room.invite}
              aria-label={s.room.invite}
              onClick={() => setInviting(true)}
            >
              <InviteIcon />
            </button>
          ))}
        {onMuteFor !== undefined && onUnmute !== undefined && (
          <MuteMenu mutedNow={mutedNow} onMuteFor={onMuteFor} onUnmute={onUnmute} />
        )}
        {onToggleArchived !== undefined && (
          <button
            type="button"
            className="chat-room-header__icon-btn chat-room-header__archive"
            title={archived ? s.workspace.unarchive : s.workspace.archive}
            aria-label={archived ? s.workspace.unarchive : s.workspace.archive}
            aria-pressed={archived}
            onClick={onToggleArchived}
          >
            <ArchiveIcon />
          </button>
        )}
        {onSetNotifyLevel !== undefined && (
          <select
            className="chat-room-header__notify"
            aria-label={s.room.notify}
            title={s.room.notify}
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
          className="chat-room-header__icon-btn chat-room-header__members-toggle"
          title={`${count} ${s.room.showMembers}`}
          aria-label={`${count} ${s.room.showMembers}`}
          aria-pressed={membersOpen}
          onClick={onToggleMembers}
        >
          <MembersIcon />
          <span aria-hidden="true">{count}</span>
        </button>
        {onLeave !== undefined && (
          <button
            type="button"
            className="chat-room-header__icon-btn chat-room-header__leave"
            data-armed={leaveArmed}
            title={leaveArmed ? s.room.leaveConfirm : s.room.leave}
            aria-label={leaveArmed ? s.room.leaveConfirm : s.room.leave}
            onClick={() => {
              if (leaveArmed) onLeave();
              else setLeaveArmed(true);
            }}
            onBlur={() => setLeaveArmed(false)}
          >
            <LeaveIcon />
          </button>
        )}
      </div>
    </header>
  );
}
