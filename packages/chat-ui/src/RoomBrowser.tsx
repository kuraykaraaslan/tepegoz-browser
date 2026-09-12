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
  /** Join a room by its address (a JID, an IRC channel name, or a Matrix room alias). A rejection
   *  (not connected, unknown address, refused by the server, …) surfaces {@link joinError} instead
   *  of silently doing nothing. */
  onJoin: (roomJid: string) => void | Promise<void>;
  /** Pre-fill the service field (e.g. the account's default conference host). */
  defaultService?: string;
  /** False for a protocol with no room directory to browse (IRC, Matrix) — hides the browse form
   *  and shows a short explanatory note instead; "join by address" still always works. */
  canBrowse?: boolean;
  /** Placeholder for the address field, protocol-appropriate (a JID by default). */
  addressPlaceholder?: string;
}

type Phase = { kind: 'idle' } | { kind: 'loading' } | { kind: 'loaded'; rooms: RoomListing[] } | { kind: 'error' };

/**
 * Browse a conference service's public rooms, filter them, or join one by address. Presentational —
 * discovery + join go through the injected callbacks.
 */
export function RoomBrowser({
  discoverRooms,
  onJoin,
  defaultService = '',
  canBrowse = true,
  addressPlaceholder,
}: Readonly<RoomBrowserProps>) {
  const s = useT(chatUiDict);
  const [service, setService] = useState(defaultService);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [filter, setFilter] = useState('');
  const [address, setAddress] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(false);

  const browse = useCallback((): void => {
    const target = service.trim();
    if (target === '') return;
    setPhase({ kind: 'loading' });
    discoverRooms(target).then(
      (rooms) => setPhase({ kind: 'loaded', rooms }),
      () => setPhase({ kind: 'error' }),
    );
  }, [discoverRooms, service]);

  // `onJoin` may reject (not connected, unknown address, refused by the server, …) — await it here
  // so a failure shows up instead of silently doing nothing, which previously read as "IRC rooms
  // just don't work" when the join itself had thrown.
  const join = useCallback(
    (roomJid: string): void => {
      setJoinError(false);
      setJoining(true);
      Promise.resolve(onJoin(roomJid)).then(
        () => {
          setJoining(false);
          setAddress('');
        },
        () => {
          setJoining(false);
          setJoinError(true);
        },
      );
    },
    [onJoin],
  );

  const rooms =
    phase.kind === 'loaded' ? sortRoomListings(filterRoomListings(phase.rooms, filter)) : [];

  return (
    <div className="chat-room-browser">
      <h2>{s.roomBrowser.title}</h2>

      {!canBrowse && <p className="chat-room-browser__status">{s.roomBrowser.noBrowse}</p>}

      {canBrowse && (
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
      )}

      {canBrowse && phase.kind === 'loading' && (
        <p className="chat-room-browser__status">{s.roomBrowser.loading}</p>
      )}
      {canBrowse && phase.kind === 'error' && (
        <p className="chat-room-browser__status">{s.roomBrowser.empty}</p>
      )}

      {canBrowse && phase.kind === 'loaded' && (
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
                  <button type="button" className="chat-room-browser__room" onClick={() => join(room.jid)}>
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
          if (jid !== '') join(jid);
        }}
      >
        <label htmlFor="chat-room-address">{s.roomBrowser.joinByAddress}</label>
        <input
          id="chat-room-address"
          value={address}
          placeholder={addressPlaceholder ?? s.roomBrowser.joinByAddressPlaceholder}
          onChange={(e) => {
            setAddress(e.target.value);
            setJoinError(false);
          }}
        />
        <button type="submit" disabled={address.trim() === '' || joining}>
          {s.roomBrowser.join}
        </button>
      </form>
      {joinError && (
        <p className="chat-room-browser__status" role="alert">
          {s.roomBrowser.joinError}
        </p>
      )}
    </div>
  );
}
