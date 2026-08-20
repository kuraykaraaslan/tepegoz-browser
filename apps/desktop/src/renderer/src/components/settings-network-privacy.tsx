import { useEffect, useState } from 'react';
import type { SettingsStrings } from '@tepegoz/settings-ui';
import type { NetworkConnectionView, NetworkState } from '@tepegoz/desktop-ipc';
import { Badge, Button, Card } from '@tepegoz/ui';

/**
 * Network privacy (Phase 5) — the profile-wide default route and the connection list.
 *
 * The honest framing is part of the design, not a caveat bolted on. This browser does not ship a VPN: it
 * routes a tab through a **SOCKS5 endpoint already running on this machine** (Tor's 9050, a VPN client's
 * local SOCKS, `ssh -D`, a userspace WireGuard bridge). Saying that plainly, at the top, is the difference
 * between a feature a user can reason about and one that quietly implies protection it does not provide.
 *
 * Two other things this surface refuses to fake:
 *  - the exit region is the user's own NOTE, echoed back and labelled as theirs. The browser cannot verify
 *    where a SOCKS endpoint comes out, so it does not claim to;
 *  - status is the live health the pool measured, in words as well as colour — "connected" / "not
 *    connected" — because a coloured dot alone is unreadable to a chunk of users and ambiguous to the rest.
 */

const EMPTY: NetworkState = { connections: [], general: { kind: 'direct' }, tabs: {}, groups: {} };

function StatusBadge({ status, s }: { status: NetworkConnectionView['status']; s: SettingsStrings }) {
  if (status === 'up') return <Badge variant="success" dot>{s.network.statusUp}</Badge>;
  if (status === 'connecting') return <Badge variant="warning" dot>{s.network.statusConnecting}</Badge>;
  return <Badge variant="neutral" dot>{s.network.statusDown}</Badge>;
}

function AddConnectionForm({ s, onAdded }: { s: SettingsStrings; onAdded: () => void }) {
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [port, setPort] = useState('9050');
  const [error, setError] = useState<string | null>(null);

  const portNumber = Number(port);
  const portValid = Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535;
  const canAdd = label.trim().length > 0 && portValid;

  const submit = (): void => {
    setError(null);
    void window.tepegoz
      .addNetworkConnection({ label: label.trim(), note: note.trim(), socksPort: portNumber })
      .then(
        () => {
          setLabel('');
          setNote('');
          setPort('9050');
          onAdded();
        },
        (err: unknown) => {
          setError(String(err));
        },
      );
  };

  const field =
    'min-w-0 flex-1 rounded-md border border-border bg-surface-base px-2 py-1 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

  return (
    <div>
      <p className="text-sm font-medium text-text-primary">{s.network.addTitle}</p>
      <p className="mb-2 text-xs text-text-secondary">{s.network.addHint}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={label}
          placeholder={s.network.labelPlaceholder}
          aria-label={s.network.labelPlaceholder}
          onChange={(e) => {
            setLabel(e.target.value);
          }}
          className={field}
        />
        <input
          type="text"
          value={note}
          placeholder={s.network.notePlaceholder}
          aria-label={s.network.notePlaceholder}
          onChange={(e) => {
            setNote(e.target.value);
          }}
          className={field}
        />
        <input
          type="number"
          value={port}
          min={1}
          max={65535}
          placeholder={s.network.portPlaceholder}
          aria-label={s.network.portPlaceholder}
          onChange={(e) => {
            setPort(e.target.value);
          }}
          className={`${field} max-w-28`}
        />
        <Button size="sm" variant="outline" disabled={!canAdd} onClick={submit}>
          {s.network.add}
        </Button>
      </div>
      {!portValid && port.trim().length > 0 && (
        <p className="mt-1 text-xs text-warning-fg">{s.network.portInvalid}</p>
      )}
      {error !== null && <p className="mt-1 text-xs text-error-fg">{error}</p>}
    </div>
  );
}

export function NetworkPrivacySection({ s }: { s: SettingsStrings }) {
  const [state, setState] = useState<NetworkState>(EMPTY);

  const refresh = (): void => {
    void window.tepegoz.getNetworkState().then(setState, () => undefined);
  };

  useEffect(() => {
    refresh();
    // Pushed, not polled: the interesting event is a tunnel DROPPING, and an indicator that only
    // refreshes when this page happens to ask would keep showing "connected" until then.
    return window.tepegoz.onNetworkState(setState);
  }, []);

  const setGeneral = (value: string): void => {
    void window.tepegoz
      .setGeneralNetworkBinding(
        value === 'direct' ? { kind: 'direct' } : { kind: 'connection', connectionId: value },
      )
      .then(refresh, () => undefined);
  };

  const remove = (id: string): void => {
    void window.tepegoz.removeNetworkConnection(id).then(refresh, () => undefined);
  };

  const generalValue = state.general.kind === 'connection' ? state.general.connectionId : 'direct';

  return (
    <Card title={s.network.title}>
      <div className="space-y-4">
        <p className="text-xs text-text-secondary">{s.network.intro}</p>

        <div>
          <p className="text-sm font-medium text-text-primary">{s.network.defaultRoute}</p>
          <p className="mb-2 text-xs text-text-secondary">{s.network.defaultRouteHint}</p>
          <select
            value={generalValue}
            aria-label={s.network.defaultRoute}
            onChange={(e) => {
              setGeneral(e.target.value);
            }}
            className="w-full max-w-sm rounded-md border border-border bg-surface-base px-2 py-1 text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <option value="direct">{s.network.direct}</option>
            {state.connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="text-sm font-medium text-text-primary">{s.network.connections}</p>
          {state.connections.length === 0 ? (
            <p className="mt-1 text-xs text-text-secondary">{s.network.noConnections}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {state.connections.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-md border border-border bg-surface-sunken px-3 py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text-primary">{c.label}</span>
                    {c.note.length > 0 && (
                      // Labelled as the user's own claim: the browser cannot verify where a SOCKS
                      // endpoint exits, and presenting it as fact would be inventing an assurance.
                      <span className="block truncate text-xs text-text-secondary">
                        {s.network.notedAs.replace('{note}', c.note)}
                      </span>
                    )}
                  </span>
                  <StatusBadge status={c.status} s={s} />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      remove(c.id);
                    }}
                  >
                    {s.network.remove}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-text-secondary">{s.network.removeHint}</p>
        </div>

        <AddConnectionForm s={s} onAdded={refresh} />
      </div>
    </Card>
  );
}
