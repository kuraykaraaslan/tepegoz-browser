import { useEffect, useState } from 'react';
import type { SettingsStrings } from '@tepegoz/settings-ui';
import type {
  NetworkConnectionInput,
  NetworkConnectionView,
  NetworkState,
} from '@tepegoz/desktop-ipc';
import { AlertBanner, Badge, Button, Card, Input } from '@tepegoz/ui';
import { AddConnectionRow } from './settings-network-forms';
import { Select } from './settings-shared';

/**
 * Network privacy (Phase 5) — the VPN/Tor connection manager and the profile-wide default route.
 *
 * Laid out like Providers & API keys, and for the same reason: it is the same shape of thing. The card's
 * subtitle carries the framing, one add row sits on top, and the list it feeds comes directly under it —
 * rather than a heading and a paragraph stacked above every control.
 *
 * The honest framing is part of the design, not a caveat bolted on. This browser does not operate a VPN:
 * it runs WireGuard in user space through a helper it does not ship, runs Tor the same way, or points at
 * a SOCKS endpoint the user already has.
 *
 * Three things this surface refuses to fake:
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

function statusBadge(c: NetworkConnectionView, s: SettingsStrings) {
  if (c.status === 'up') return <Badge variant="success" dot>{s.network.statusUp}</Badge>;
  if (c.status === 'connecting')
    return <Badge variant="warning" dot>{s.network.statusConnecting}</Badge>;
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
    const done = (): void => {
      setBusy(false);
      onChanged();
    };
    void window.tepegoz.setNetworkConnectionActive(c.id, c.status !== 'up').then(done, done);
  };

  return (
    <li className="rounded-md border border-border px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-text-primary">{c.label}</span>
          <span className="ml-2 text-xs text-text-secondary">{protocolLabel(c, s)}</span>
          {upstream !== undefined && (
            <span className="ml-2 text-xs text-text-secondary">
              {s.network.chainedVia.replace('{name}', upstream.label)}
            </span>
          )}
          {c.note.length > 0 && (
            // Labelled as the user's own claim: the browser cannot verify where a tunnel exits, and
            // presenting it as fact would be inventing an assurance.
            <span className="ml-2 text-xs text-text-disabled">
              {s.network.notedAs.replace('{note}', c.note)}
            </span>
          )}
        </div>
        {statusBadge(c, s)}
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
    <div className="mt-4">
      <p className="text-xs text-text-secondary">
        {s.network.binaryMissing.replace('{name}', binary).replace('{dir}', status.path)}
      </p>
      <form
        className="mt-1 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void window.tepegoz
            .setNetworkBinaryPath(binary, draft.trim())
            .then(onChanged, () => undefined);
        }}
      >
        <div className="min-w-48 flex-1">
          <Input
            id={`binary-${binary}`}
            // The program's own name is the label; the placeholder carries the "full path" hint, so the
            // two say different things instead of repeating.
            label={binary}
            placeholder={s.network.binaryPathPlaceholder.replace('{name}', binary)}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
          />
        </div>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="mb-1 h-[38px]"
          disabled={draft.trim().length === 0}
        >
          {s.network.binarySave}
        </Button>
      </form>
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

  const generalValue = state.general.kind === 'connection' ? state.general.connectionId : 'direct';

  return (
    <div className="space-y-4">
      <Card title={s.network.title} subtitle={s.network.intro}>
        {!state.secretsAvailable && (
          <AlertBanner variant="warning" message={s.network.keychainBody} className="mb-4" />
        )}

        <AddConnectionRow
          s={s}
          connections={state.connections}
          secretsAvailable={state.secretsAvailable}
          onAdd={async (input: NetworkConnectionInput) => {
            await window.tepegoz.addNetworkConnection(input);
            refresh();
          }}
        />

        {state.connections.length === 0 ? (
          <p className="mt-4 text-sm text-text-secondary">{s.network.noConnections}</p>
        ) : (
          <>
            <p className="mb-2 mt-5 text-xs text-text-secondary">{s.network.removeHint}</p>
            <ul className="space-y-1.5">
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
          </>
        )}

        {/* One-time setup, not part of adding a connection — and only rendered when one is missing. */}
        <BinaryRow s={s} binary="wireproxy" status={state.binaries.wireproxy} onChanged={refresh} />
        <BinaryRow s={s} binary="tor" status={state.binaries.tor} onChanged={refresh} />
      </Card>

      <Card title={s.network.defaultRoute} subtitle={s.network.defaultRouteHint}>
        <div className="w-full max-w-sm">
          <Select
            id="network-general"
            value={generalValue}
            onChange={(value) => {
              void window.tepegoz
                .setGeneralNetworkBinding(
                  value === 'direct'
                    ? { kind: 'direct' }
                    : { kind: 'connection', connectionId: value },
                )
                .then(refresh, () => undefined);
            }}
          >
            <option value="direct">{s.network.direct}</option>
            {state.connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
      </Card>
    </div>
  );
}
