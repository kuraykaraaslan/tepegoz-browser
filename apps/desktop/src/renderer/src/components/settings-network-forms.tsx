import { useState } from 'react';
import type { SettingsStrings } from '@tepegoz/settings-ui';
import type {
  NetworkConnectionInput,
  NetworkConnectionView,
  PickedWireguardProfile,
} from '@tepegoz/desktop-ipc';
import { Button, Input } from '@tepegoz/ui';
import { Select } from './settings-shared';

/**
 * The one "add a connection" row for the network-privacy manager (Phase 5).
 *
 * Deliberately ONE row with a protocol dropdown, mirroring Providers & API keys, rather than a stacked
 * form per protocol. From the user's side "add a connection" is a single act with a type attached; three
 * separate forms made three near-identical things look like three different features and pushed the list
 * they feed off the screen.
 *
 * Only the third field changes with the protocol, because only that field is genuinely protocol-specific:
 * WireGuard needs a file, Tor needs an optional upstream to chain through, SOCKS needs a port.
 */

type Kind = NetworkConnectionInput['kind'];

export function AddConnectionRow({
  s,
  connections,
  secretsAvailable,
  onAdd,
}: {
  s: SettingsStrings;
  connections: readonly NetworkConnectionView[];
  secretsAvailable: boolean;
  onAdd: (input: NetworkConnectionInput) => Promise<void>;
}) {
  const [kind, setKind] = useState<Kind>('wireguard');
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [port, setPort] = useState('9050');
  const [upstream, setUpstream] = useState('');
  const [picked, setPicked] = useState<PickedWireguardProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Chaining Tor through Tor is not a meaningful thing to offer.
  const chainable = connections.filter((c) => c.kind !== 'tor');
  const portNumber = Number(port);
  const portValid = Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535;

  const wgBlocked = kind === 'wireguard' && !secretsAvailable;
  const canAdd =
    label.trim().length > 0 &&
    !wgBlocked &&
    (kind === 'wireguard' ? picked !== null : kind === 'byo-socks' ? portValid : true);

  const pickFile = (): void => {
    setError(null);
    void window.tepegoz.pickWireguardProfile().then(
      (profile) => {
        if (profile === null) return;
        setPicked(profile);
        // The file name is the obvious name for the connection; the user can still overwrite it.
        if (label.trim().length === 0)
          setLabel(profile.fileName.replace(/\.conf$/i, '').slice(0, 64));
      },
      (err: unknown) => {
        // The parser's own message ("no DNS line…") is what tells the user how to fix the file.
        setError(err instanceof Error ? err.message : String(err));
        setPicked(null);
      },
    );
  };

  const submit = (): void => {
    setError(null);
    const base = { label: label.trim(), note: note.trim() };
    const input: NetworkConnectionInput =
      kind === 'wireguard'
        ? { ...base, kind, sourcePath: picked?.path ?? '' }
        : kind === 'tor'
          ? { ...base, kind, upstreamConnectionId: upstream === '' ? null : upstream }
          : { ...base, kind, socksPort: portNumber };

    void onAdd(input).then(
      () => {
        setLabel('');
        setNote('');
        setPicked(null);
        setUpstream('');
        setPort('9050');
      },
      (err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      },
    );
  };

  return (
    <div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (canAdd) submit();
        }}
      >
        <div className="w-32">
          <Select
            id="network-kind"
            label={s.network.kindLabel}
            value={kind}
            onChange={(v) => {
              setKind(v as Kind);
              setError(null);
            }}
          >
            <option value="wireguard">{s.network.protocolWireguard}</option>
            <option value="tor">{s.network.protocolTor}</option>
            <option value="byo-socks">{s.network.protocolByo}</option>
          </Select>
        </div>

        <div className="w-28">
          <Input
            id="network-label"
            label={s.network.nameLabel}
            placeholder={s.network.labelPlaceholder}
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
            }}
          />
        </div>

        <div className="w-32">
          <Input
            id="network-note"
            label={s.network.noteLabel}
            placeholder={s.network.notePlaceholder}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
            }}
          />
        </div>

        {/* The one protocol-specific field. */}
        {kind === 'wireguard' && (
          <div className="min-w-36 flex-1">
            <span className="mb-1 block text-sm font-medium text-text-primary">
              {s.network.profileLabel}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-9 w-full justify-start"
              disabled={!secretsAvailable}
              onClick={pickFile}
            >
              {picked === null ? s.network.chooseFile : picked.fileName}
            </Button>
          </div>
        )}
        {kind === 'tor' && (
          <div className="min-w-36 flex-1">
            <Select
              id="network-upstream"
              label={s.network.torUpstream}
              value={upstream}
              onChange={setUpstream}
            >
              <option value="">{s.network.torUpstreamNone}</option>
              {chainable.map((c) => (
                <option key={c.id} value={c.id}>
                  {s.network.torUpstreamVia.replace('{name}', c.label)}
                </option>
              ))}
            </Select>
          </div>
        )}
        {kind === 'byo-socks' && (
          <div className="w-24">
            <Input
              id="network-port"
              label={s.network.portLabel}
              type="number"
              min={1}
              max={65535}
              placeholder={s.network.portPlaceholder}
              value={port}
              onChange={(e) => {
                setPort(e.target.value);
              }}
            />
          </div>
        )}

        {/* h-[38px] + mb-1 aligns the button box with the Input/Select boxes, which add a label above
            and a small hint gap below — same trick as Providers & API keys. */}
        <Button type="submit" size="sm" className="mb-1 h-[38px]" disabled={!canAdd}>
          {s.network.add}
        </Button>
      </form>

      {/* What the parser found, shown before committing. The resolvers matter: they are the reason an
          import can be refused, and seeing them is how the user confirms names resolve in the tunnel. */}
      {picked !== null && kind === 'wireguard' && (
        <p className="mt-1 text-xs text-text-secondary">
          {s.network.pickedSummary
            .replace('{endpoint}', picked.endpoint)
            .replace('{dns}', picked.dns.join(', '))}
        </p>
      )}
      {kind === 'byo-socks' && !portValid && port.trim().length > 0 && (
        <p className="mt-1 text-xs text-warning-fg">{s.network.portInvalid}</p>
      )}
      {error !== null && <p className="mt-1 text-xs text-error-fg">{error}</p>}
    </div>
  );
}
