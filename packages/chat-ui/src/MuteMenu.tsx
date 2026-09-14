import { useEffect, useRef, useState } from 'react';
import { useT } from '@tepegoz/i18n/react';
import { chatUiDict } from './i18n';

const HOUR_MS = 3_600_000;

function MuteIcon({ muted }: Readonly<{ muted: boolean }>) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M6 8v3a3.5 3.5 0 0 0 7 0V7.2M9.5 3.3A2.2 2.2 0 0 1 13 5.2v.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M6 16.2h7M9.5 13.3v2.9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {muted && (
        <path d="M3.5 3.5l13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
}

export interface MuteMenuProps {
  /** Muted right now — forever, or still inside a timed mute. Drives the icon/label and which menu
   *  shows (a duration picker when off, a bare "Unmute" when on). */
  mutedNow: boolean;
  /** Mute for a duration (ms) or forever (`null`). */
  onMuteFor: (durationMs: number | null) => void;
  /** Clear any mute — forever or timed. */
  onUnmute: () => void;
}

/**
 * The mute trigger + its duration picker (1h / 3h / 8h / forever), shared by the DM header and
 * `<RoomHeader>`. Closes on an outside click, same convention as `MessageTimeline`'s reaction picker.
 */
export function MuteMenu({ mutedNow, onMuteFor, onUnmute }: Readonly<MuteMenuProps>) {
  const s = useT(chatUiDict);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (wrapRef.current?.contains(e.target as Node) === false) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const pick = (durationMs: number | null): void => {
    onMuteFor(durationMs);
    setOpen(false);
  };

  return (
    <span className="chat-mute-menu" ref={wrapRef}>
      <button
        type="button"
        className="chat-mute-menu__trigger"
        title={mutedNow ? s.workspace.unmute : s.workspace.mute}
        aria-label={mutedNow ? s.workspace.unmute : s.workspace.mute}
        aria-expanded={open}
        aria-pressed={mutedNow}
        onClick={() => setOpen((v) => !v)}
      >
        <MuteIcon muted={mutedNow} />
      </button>
      {open && (
        <span className="chat-mute-menu__list" role="menu">
          {mutedNow ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onUnmute();
                setOpen(false);
              }}
            >
              {s.workspace.unmute}
            </button>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={() => pick(HOUR_MS)}>
                {s.workspace.muteFor1h}
              </button>
              <button type="button" role="menuitem" onClick={() => pick(3 * HOUR_MS)}>
                {s.workspace.muteFor3h}
              </button>
              <button type="button" role="menuitem" onClick={() => pick(8 * HOUR_MS)}>
                {s.workspace.muteFor8h}
              </button>
              <button type="button" role="menuitem" onClick={() => pick(null)}>
                {s.workspace.muteForever}
              </button>
            </>
          )}
        </span>
      )}
    </span>
  );
}
