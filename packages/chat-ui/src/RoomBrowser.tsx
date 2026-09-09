import { useCallback, useState } from 'react';
import { useT } from '@tepegoz/i18n/react';
import { chatUiDict } from './i18n';
import {
  filterRoomListings,
  roomListingLabel,
  sortRoomListings,
  type RoomListing,
} from './room-browser';

export interface RoomBrowserProps {
  /** Discover a MUC service's advertised rooms (XEP-0030 disco, run in the host). */
  discoverRooms: (service: string) => Promise<RoomListing[]>;
  /** Join a room by its bare JID. */
  onJoin: (roomJid: string) => void;
  /** Pre-fill the service field (e.g. the account's default conference host). */
  defaultService?: string;
}

type Phase = { kind: 'idle' } | { kind: 'loading' } | { kind: 'loaded'; rooms: RoomListing[] } | { kind: 'error' };

/**
 * Browse a conference service's public rooms, filter them, or join one by address. Presentational —
 * discovery + join go through the injected callbacks.
 */
export function RoomBrowser({ discoverRooms, onJoin, defaultService = '' }: Readonly<RoomBrowserProps>) {
  const s = useT(chatUiDict);
  const [service, setService] = useState(defaultService);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [filter, setFilter] = useState('');
  const [address, setAddress] = useState('');

  const browse = useCallback((): void => {
    const target = service.trim();
    if (target === '') return;
    setPhase({ kind: 'loading' });
    discoverRooms(target).then(
      (rooms) => setPhase({ kind: 'loaded', rooms }),
      () => setPhase({ kind: 'error' }),
    );
  }, [discoverRooms, service]);

  const rooms =
    phase.kind === 'loaded' ? sortRoomListings(filterRoomListings(phase.rooms, filter)) : [];

  return (
    <div className="chat-room-browser">
      <h2>{s.roomBrowser.title}</h2>

      <form
        className="chat-room-browser__service"
        onSubmit={(e) => {
          e.preventDefault();
          browse();
        }}
      >
        <label htmlFor="chat-room-service">{s.roomBrowser.service}</label>
        <input
          id="chat-room-service"
          value={service}
          placeholder={s.roomBrowser.servicePlaceholder}
          onChange={(e) => setService(e.target.value)}
        />
        <button type="submit" disabled={service.trim() === ''}>
          {s.roomBrowser.browse}
        </button>
      </form>

      {phase.kind === 'loading' && <p className="chat-room-browser__status">{s.roomBrowser.loading}</p>}
      {phase.kind === 'error' && <p className="chat-room-browser__status">{s.roomBrowser.empty}</p>}

      {phase.kind === 'loaded' && (
        <>
          <input
            type="search"
            className="chat-room-browser__filter"
            value={filter}
            placeholder={s.roomBrowser.search}
            aria-label={s.roomBrowser.search}
            onChange={(e) => setFilter(e.target.value)}
          />
          {rooms.length === 0 ? (
            <p className="chat-room-browser__status">{s.roomBrowser.empty}</p>
          ) : (
            <ul className="chat-room-browser__list">
              {rooms.map((room) => (
                <li key={room.jid}>
                  <button type="button" className="chat-room-browser__room" onClick={() => onJoin(room.jid)}>
                    <span className="chat-room-browser__name">{roomListingLabel(room)}</span>
                    {room.occupants !== null && (
                      <span className="chat-room-browser__count">
                        {room.occupants} {s.roomBrowser.online}
                      </span>
                    )}
                    {room.passwordProtected && (
                      <span className="chat-room-browser__flag" data-flag="locked">
                        {s.roomBrowser.locked}
                      </span>
                    )}
                    {room.membersOnly && (
                      <span className="chat-room-browser__flag" data-flag="members">
                        {s.roomBrowser.membersOnly}
                      </span>
                    )}
                    {room.description !== null && room.description !== '' && (
                      <span className="chat-room-browser__desc">{room.description}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <form
        className="chat-room-browser__by-address"
        onSubmit={(e) => {
          e.preventDefault();
          const jid = address.trim();
          if (jid !== '') {
            onJoin(jid);
            setAddress('');
          }
        }}
      >
        <label htmlFor="chat-room-address">{s.roomBrowser.joinByAddress}</label>
        <input
          id="chat-room-address"
          value={address}
          placeholder={s.roomBrowser.joinByAddressPlaceholder}
          onChange={(e) => setAddress(e.target.value)}
        />
        <button type="submit" disabled={address.trim() === ''}>
          {s.roomBrowser.join}
        </button>
      </form>
    </div>
  );
}
