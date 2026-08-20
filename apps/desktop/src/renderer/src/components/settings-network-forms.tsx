import { useState } from 'react';
import type { SettingsStrings } from '@tepegoz/settings-ui';
import type { NetworkConnectionView, ProfileImportResult } from '@tepegoz/desktop-ipc';
import { Button } from '@tepegoz/ui';

/**
 * The "add a connection" forms for the network-privacy manager (Phase 5).
 *
 * Split out of the section itself so each file stays readable; they share nothing but the strings and a
 * refresh callback. Three ways in, because the three protocols are genuinely different acts:
 * importing a file, starting a Tor instance, and pointing at something already running.
 */

const FIELD =
  'min-w-0 flex-1 rounded-md border border-border bg-surface-base px-2 py-1 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

/** WireGuard: pick one or many `.conf` files. Each file's outcome is reported on its own. */
export function ImportWireGuardRow({
  s,
  disabled,
  onDone,
}: {
  s: SettingsStrings;
  disabled: boolean;
  onDone: () => void;
}) {
  const [results, setResults] = useState<ProfileImportResult[]>([]);
  const [busy, setBusy] = useState(false);

  const importFiles = (): void => {
    setBusy(true);
    void window.tepegoz.importWireguardProfiles().then(
      (r) => {
        setResults(r);
        setBusy(false);
        onDone();
      },
      (err: unknown) => {
        setResults([{ fileName: '', connectionId: null, summary: null, error: String(err) }]);
        setBusy(false);
      },
    );
  };

  return (
    <div>
      <p className="text-sm font-medium text-text-primary">{s.network.importWgTitle}</p>
      <p className="mb-2 text-xs text-text-secondary">{s.network.importWgHint}</p>
      <Button size="sm" variant="outline" disabled={disabled || busy} onClick={importFiles}>
        {s.network.importWgButton}
      </Button>
      {results.length > 0 && (
        <ul className="mt-2 space-y-1">
          {results.map((r, i) => (
            <li key={`${r.fileName}-${String(i)}`} className="text-xs">
              {r.error === null ? (
                <span className="text-success-fg">
                  {/* The DNS servers are shown because they are the reason an import can be refused, and
                      seeing them is how a user confirms their names resolve inside the tunnel. */}
                  {s.network.importOk
                    .replace('{file}', r.fileName)
                    .replace('{endpoint}', r.summary?.endpoint ?? '')
                    .replace('{dns}', (r.summary?.dns ?? []).join(', '))}
                </span>
              ) : (
                <span className="text-error-fg">
                  {s.network.importFailed.replace('{file}', r.fileName)} {r.error}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Tor: a managed instance, optionally chained through one of the existing connections. */
export function AddTorRow({
  s,
  connections,
  disabled,
  onDone,
}: {
  s: SettingsStrings;
  connections: readonly NetworkConnectionView[];
  disabled: boolean;
  onDone: () => void;
}) {
  const [label, setLabel] = useState('Tor');
  const [upstream, setUpstream] = useState('');
  // Chaining Tor through Tor is not a meaningful thing to offer.
  const chainable = connections.filter((c) => c.kind !== 'tor');

  const add = (): void => {
    void window.tepegoz
      .addTorConnection({
        label: label.trim(),
        note: '',
        upstreamConnectionId: upstream === '' ? null : upstream,
      })
      .then(() => {
        setLabel('Tor');
        setUpstream('');
        onDone();
      }, () => undefined);
  };

  return (
    <div>
      <p className="text-sm font-medium text-text-primary">{s.network.addTorTitle}</p>
      <p className="mb-2 text-xs text-text-secondary">{s.network.addTorHint}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={label}
          aria-label={s.network.labelPlaceholder}
          placeholder={s.network.labelPlaceholder}
          onChange={(e) => {
            setLabel(e.target.value);
          }}
          className={FIELD}
        />
        <select
          value={upstream}
          aria-label={s.network.torUpstream}
          onChange={(e) => {
            setUpstream(e.target.value);
          }}
          className={`${FIELD} max-w-52`}
        >
          <option value="">{s.network.torUpstreamNone}</option>
          {chainable.map((c) => (
            <option key={c.id} value={c.id}>
              {s.network.torUpstreamVia.replace('{name}', c.label)}
            </option>
          ))}
        </select>
        <Button size="sm" variant="outline" disabled={disabled || label.trim().length === 0} onClick={add}>
          {s.network.add}
        </Button>
      </div>
    </div>
  );
}

/** BYO SOCKS: point at an endpoint the user already runs. The original Phase 5 path, kept. */
export function AddByoSocksRow({ s, onDone }: { s: SettingsStrings; onDone: () => void }) {
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [port, setPort] = useState('9050');
  const [error, setError] = useState<string | null>(null);

  const portNumber = Number(port);
  const portValid = Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535;

  const submit = (): void => {
    setError(null);
    void window.tepegoz
      .addNetworkConnection({ label: label.trim(), note: note.trim(), socksPort: portNumber })
      .then(
        () => {
          setLabel('');
          setNote('');
          setPort('9050');
          onDone();
        },
        (err: unknown) => {
          setError(String(err));
        },
      );
  };

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
          className={FIELD}
        />
        <input
          type="text"
          value={note}
          placeholder={s.network.notePlaceholder}
          aria-label={s.network.notePlaceholder}
          onChange={(e) => {
            setNote(e.target.value);
          }}
          className={FIELD}
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
          className={`${FIELD} max-w-28`}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={label.trim().length === 0 || !portValid}
          onClick={submit}
        >
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
