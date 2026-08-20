import { useEffect, useState } from 'react';
import type { SettingsStrings } from '@tepegoz/settings-ui';
import type { NetworkConnectionView, NetworkState } from '@tepegoz/desktop-ipc';
import { AlertBanner, Badge, Button, Card } from '@tepegoz/ui';
import { AddByoSocksRow, AddTorRow, ImportWireGuardRow } from './settings-network-forms';

/**
 * Network privacy (Phase 5) — the VPN/Tor profile manager and the profile-wide default route.
 *
 * The honest framing is part of the design, not a caveat bolted on. This browser does not operate a VPN:
 * it runs WireGuard in user space through a helper it does not ship, runs Tor the same way, or points at
 * a SOCKS endpoint the user already has. Saying that plainly, at the top, is the difference between a
 * feature someone can reason about and one that implies protection it does not provide.
 *
 * Three other things this surface refuses to fake:
 *  - the exit region is the user's own NOTE, echoed back and labelled as theirs — the browser cannot
 *    verify where a tunnel comes out, so it does not claim to;
 *  - status is the live health the pool measured, in words as well as colour;
 *  - when a connection is down, the provider's own message is shown verbatim. "wireproxy not found" and
 *    "endpoint unreachable" need entirely different things from the user, and "could not connect" tells
 *    them neither.
 */

const EMPTY: NetworkState = {
  connections: [],
  general: { kind: 'direct' },
  tabs: {},
  groups: {},
  binaries: { wireproxy: { found: false, path: '' }, tor: { found: false, path: '' } },
  secretsAvailable: false,
};

function StatusBadge({ c, s }: { c: NetworkConnectionView; s: SettingsStrings }) {
  if (c.status === 'up') return <Badge variant="success" dot>{s.network.statusUp}</Badge>;
  if (c.status === 'connecting') return <Badge variant="warning" dot>{s.network.statusConnecting}</Badge>;
  return <Badge variant="neutral" dot>{s.network.statusDown}</Badge>;
}

function protocolLabel(c: NetworkConnectionView, s: SettingsStrings): string {
  if (c.kind === 'wireguard') return s.network.protocolWireguard;
  if (c.kind === 'tor') return s.network.protocolTor;
  return s.network.protocolByo;
}

/** One connection: what it is, whether it is carrying traffic, and the two things you can do to it. */
function ConnectionRow({
  c,
  s,
  connections,
  onChanged,
}: {
  c: NetworkConnectionView;
  s: SettingsStrings;
  connections: readonly NetworkConnectionView[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const upstream = connections.find((x) => x.id === c.upstreamConnectionId);

  const toggle = (): void => {
    setBusy(true);
    void window.tepegoz.setNetworkConnectionActive(c.id, c.status !== 'up').then(
      () => {
        setBusy(false);
        onChanged();
      },
      () => {
        setBusy(false);
        onChanged();
      },
    );
  };

  return (
    <li className="rounded-md border border-border bg-surface-sunken px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm text-text-primary">{c.label}</span>
            <Badge variant="info" size="sm">
              {protocolLabel(c, s)}
            </Badge>
            {upstream !== undefined && (
              <Badge variant="primary" size="sm">
                {s.network.chainedVia.replace('{name}', upstream.label)}
              </Badge>
            )}
          </span>
          {c.note.length > 0 && (
            // Labelled as the user's own claim: the browser cannot verify where a tunnel exits, and
            // presenting it as fact would be inventing an assurance.
            <span className="block truncate text-xs text-text-secondary">
              {s.network.notedAs.replace('{note}', c.note)}
            </span>
          )}
        </span>
        <StatusBadge c={c} s={s} />
        <Button size="sm" variant="outline" disabled={busy} onClick={toggle}>
          {c.status === 'up' ? s.network.disconnect : s.network.connect}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void window.tepegoz.removeNetworkConnection(c.id).then(onChanged, () => undefined);
          }}
        >
          {s.network.remove}
        </Button>
      </div>
      {c.lastError !== null && c.status !== 'up' && (
        <p className="mt-1 text-xs text-error-fg">{c.lastError}</p>
      )}
    </li>
  );
}

/** Where to put a helper binary that is missing, and a field for pointing at one elsewhere. */
function BinaryRow({
  s,
  binary,
  status,
  onChanged,
}: {
  s: SettingsStrings;
  binary: 'wireproxy' | 'tor';
  status: { found: boolean; path: string };
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState('');
  if (status.found) return null;
  return (
    <div className="mt-2">
      <p className="text-xs text-text-secondary">
        {s.network.binaryMissing.replace('{name}', binary).replace('{dir}', status.path)}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="text"
          value={draft}
          placeholder={s.network.binaryPathPlaceholder.replace('{name}', binary)}
          aria-label={s.network.binaryPathPlaceholder.replace('{name}', binary)}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-base px-2 py-1 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={draft.trim().length === 0}
          onClick={() => {
            void window.tepegoz
              .setNetworkBinaryPath(binary, draft.trim())
              .then(onChanged, () => undefined);
          }}
        >
          {s.network.binarySave}
        </Button>
      </div>
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

  const generalValue = state.general.kind === 'connection' ? state.general.connectionId : 'direct';

  return (
    <Card title={s.network.title}>
      <div className="space-y-4">
        <p className="text-xs text-text-secondary">{s.network.intro}</p>

        {!state.secretsAvailable && (
          <AlertBanner
            variant="warning"
            title={s.network.keychainTitle}
            message={s.network.keychainBody}
          />
        )}

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
                <ConnectionRow
                  key={c.id}
                  c={c}
                  s={s}
                  connections={state.connections}
                  onChanged={refresh}
                />
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-text-secondary">{s.network.removeHint}</p>
        </div>

        <ImportWireGuardRow s={s} disabled={!state.secretsAvailable} onDone={refresh} />
        <BinaryRow s={s} binary="wireproxy" status={state.binaries.wireproxy} onChanged={refresh} />

        <AddTorRow s={s} connections={state.connections} disabled={false} onDone={refresh} />
        <BinaryRow s={s} binary="tor" status={state.binaries.tor} onChanged={refresh} />

        <AddByoSocksRow s={s} onDone={refresh} />
      </div>
    </Card>
  );
}
