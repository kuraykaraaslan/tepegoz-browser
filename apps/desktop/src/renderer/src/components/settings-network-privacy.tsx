import { useEffect, useState } from 'react';
import type { SettingsStrings } from '@tepegoz/settings-ui';
import type {
  BinaryStatus,
  NetworkConnectionInput,
  NetworkConnectionView,
  NetworkState,
} from '@tepegoz/desktop-ipc';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faCircleExclamation } from '@fortawesome/free-solid-svg-icons';
import { AlertBanner, Badge, Button, Card, cn } from '@tepegoz/ui';
import { AddConnectionRow } from './settings-network-forms';
import { ConfirmAction } from './settings-confirm';
import { NetworkRoutesCard } from './settings-network-routes';
import { CrossLink, Select } from './settings-shared';
import { classifyNetworkError } from './network-error';

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
  binaries: {
    wireproxy: { found: false, path: '', isOverride: false, dropInDir: '' },
    tor: { found: false, path: '', isOverride: false, dropInDir: '' },
  },
  secretsAvailable: false,
};

function statusBadge(c: NetworkConnectionView, s: SettingsStrings) {
  if (c.status === 'up')
    return (
      <Badge variant="success" dot>
        {s.network.statusUp}
      </Badge>
    );
  if (c.status === 'connecting')
    return (
      <Badge variant="warning" dot>
        {s.network.statusConnecting}
      </Badge>
    );
  return (
    <Badge variant="neutral" dot>
      {s.network.statusDown}
    </Badge>
  );
}

/**
 * "New identity" — Tor only, and it says what it will disturb before it runs.
 *
 * Two halves in one action (new circuits + a wipe of this connection's site state), because doing
 * either alone is not a new identity: fresh circuits with the old cookies is a new address presenting
 * the same logged-in session, and cleared cookies over the same circuit are re-linked at the network
 * layer. The dialog therefore names both, plus the count of tabs that will reload — the phase's own
 * requirement that this action "says which tabs it will disturb", rather than surprising the user with
 * an afternoon's reading replaced by reloads.
 *
 * Only rendered for Tor. A VPN or SOCKS reconnect lands on the same exit address, so the button would
 * be a promise the product cannot keep (main refuses it too, so this is presentation, not the rule).
 */
function NewIdentityAction({
  c,
  s,
  onChanged,
  onOutcome,
}: {
  c: NetworkConnectionView;
  s: SettingsStrings;
  onChanged: () => void;
  /** Reported up so the outcome line renders BELOW the row rather than inside its flex, next to the
   *  connection error it sits alongside. */
  onOutcome: (outcome: 'done' | 'downAfter') => void;
}) {
  return (
    <ConfirmAction
      label={s.network.newIdentity}
      title={s.network.newIdentityTitle}
      body={
        <>
          <p>{s.network.newIdentityBody.replace('{name}', c.label)}</p>
          <p className="mt-2">
            {c.boundTabs === 0
              ? s.network.newIdentityNoTabs
              : s.network.newIdentityTabs.replace('{count}', String(c.boundTabs))}
          </p>
          <p className="mt-2 text-text-disabled">{s.network.newIdentityGuards}</p>
        </>
      }
      confirmLabel={s.network.newIdentity}
      onConfirm={() => {
        void window.tepegoz.newNetworkIdentity(c.id).then(
          (r) => {
            // The tunnel failing to come back is NOT a failed new identity — the circuits and the site
            // state are gone either way — so it gets its own sentence rather than an error.
            onOutcome(r.reconnected ? 'done' : 'downAfter');
            onChanged();
          },
          () => {
            onChanged();
          },
        );
      }}
    />
  );
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
  isDefaultRoute,
  onChanged,
}: {
  c: NetworkConnectionView;
  s: SettingsStrings;
  connections: readonly NetworkConnectionView[];
  /** Removing THIS one drops the profile back to Direct — a privacy change the user must be told
   *  about before it happens, not discover afterwards. */
  isDefaultRoute: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [identityOutcome, setIdentityOutcome] = useState<'done' | 'downAfter' | null>(null);
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
        {c.kind === 'tor' && (
          <NewIdentityAction c={c} s={s} onChanged={onChanged} onOutcome={setIdentityOutcome} />
        )}
        <ConfirmAction
          label={s.network.remove}
          title={s.network.removeTitle}
          body={
            isDefaultRoute
              ? s.network.removeBodyDefault.replace('{name}', c.label)
              : s.network.removeBody.replace('{name}', c.label)
          }
          confirmLabel={s.network.remove}
          onConfirm={() => {
            void window.tepegoz.removeNetworkConnection(c.id).then(onChanged, () => undefined);
          }}
        />
      </div>
      {identityOutcome !== null && (
        <p
          className={cn(
            'mt-1 text-xs',
            identityOutcome === 'done' ? 'text-text-secondary' : 'text-error-fg',
          )}
        >
          {identityOutcome === 'done' ? s.network.newIdentityDone : s.network.newIdentityDownAfter}
        </p>
      )}
      {c.lastError !== null && c.status !== 'up' && (
        // One localized sentence with a next step — never the raw provider stderr (Phase 5). The raw
        // string stays one hover away for a bug report.
        <p className="mt-1 text-xs text-error-fg" title={c.lastError}>
          {s.network.connError[classifyNetworkError(c.lastError)]}
        </p>
      )}
      {c.kind === 'tor' && upstream !== undefined && (
        // Phase 5 disclosure: chaining VPN → Tor is a supported product choice, but Tor's own guidance
        // is that it is generally not recommended — the hop before Tor learns you are a Tor user and
        // trust shifts to the VPN operator. State it here, on the connection it applies to.
        <p className="mt-1 text-xs text-text-disabled">{s.network.torChainedCaveat}</p>
      )}
      {c.drops > 0 && (
        // Phase 5 health: a tunnel that dies quietly should be visible here, not discovered through a
        // leak. The counter rises on every drop from `up` even when the poll reconnects it.
        <p className="mt-1 text-xs text-text-disabled">
          {s.network.connDrops.replace('{count}', String(c.drops))}
        </p>
      )}
    </li>
  );
}

/**
 * One helper binary: whether it is there, and how to point at it if not.
 *
 * Always rendered, not only when something is missing. A green tick against a resolved path is the only
 * way a user can tell "detection found it" from "nothing has been tried yet" — and this is the one part
 * of the feature that silently decides whether a whole protocol works at all.
 */
function BinaryRow({
  s,
  binary,
  status,
  onChanged,
}: {
  s: SettingsStrings;
  binary: 'wireproxy' | 'tor';
  status: BinaryStatus;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const browse = (): void => {
    setError(null);
    void window.tepegoz.pickBinaryFolder(binary).then(
      (found) => {
        if (found !== null) onChanged();
      },
      (err: unknown) => {
        // Names the folder that was searched: the usual mistake is picking the parent of the right one.
        setError(err instanceof Error ? err.message : String(err));
      },
    );
  };

  return (
    <li className="rounded-md border border-border px-3 py-2">
      <div className="flex items-center gap-2">
        <FontAwesomeIcon
          icon={status.found ? faCircleCheck : faCircleExclamation}
          className={cn('h-4 w-4 shrink-0', status.found ? 'text-success' : 'text-text-disabled')}
          aria-hidden
        />
        <span className="shrink-0 text-sm font-medium text-text-primary">{binary}</span>
        {status.found ? (
          // `min-w-0` on the flexible middle is what lets the path truncate instead of shoving the
          // button off the row; the full value stays available as the title.
          <span className="min-w-0 flex-1 truncate text-xs text-text-secondary" title={status.path}>
            {status.path}
          </span>
        ) : (
          <span className="min-w-0 flex-1 text-xs text-text-secondary">
            {s.network.binaryMissing.replace('{name}', binary).replace('{dir}', status.dropInDir)}
          </span>
        )}
        {status.found && !status.isOverride && (
          <span className="shrink-0 text-xs text-text-disabled">
            {s.network.binaryAutoDetected}
          </span>
        )}
        <Button size="sm" variant="outline" className="shrink-0" onClick={browse}>
          {status.found ? s.network.binaryChange : s.network.binaryBrowse}
        </Button>
        {status.isOverride && (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => {
              // Clearing the override removes nothing — it hands the search back to detection.
              void window.tepegoz.setNetworkBinaryPath(binary, '').then(onChanged, () => undefined);
            }}
          >
            {s.network.binaryClear}
          </Button>
        )}
      </div>
      {error !== null && <p className="mt-1 text-xs text-error-fg">{error}</p>}
    </li>
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
  // Phase 5 disclosure: per-tab routing means a Tor-bound tab and direct tabs run in the same browser
  // at once — the exact pattern Tor Browser tells users to avoid. Surface it as soon as a Tor
  // connection exists, because that is when the caveat starts to matter.
  const hasTor = state.connections.some((c) => c.kind === 'tor');

  return (
    <div className="space-y-4">
      <Card title={s.network.title} subtitle={s.network.intro}>
        {!state.secretsAvailable && (
          <AlertBanner variant="warning" message={s.network.keychainBody} className="mb-4" />
        )}
        {hasTor && (
          <AlertBanner
            variant="info"
            title={s.network.torNotTorBrowserTitle}
            message={s.network.torNotTorBrowserBody}
            className="mb-4"
          />
        )}

        {/* Permanent framing (Phase 5): a tunnel changes the IP a site sees, nothing else — not the
            profile, not the browser's own fingerprint. Silence here is the most likely way a user
            over-trusts the feature. */}
        <p className="mb-4 text-xs text-text-secondary">
          {s.network.tunnelLimitsBody}{' '}
          <CrossLink sectionId="privacy">{s.network.tunnelLimitsLink}</CrossLink>
        </p>

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
                  isDefaultRoute={generalValue === c.id}
                  onChanged={refresh}
                />
              ))}
            </ul>
          </>
        )}

        {/* One-time setup, kept apart from adding a connection. Shown always: a tick against a found
            path is the only way to tell detection succeeded from nothing having been tried. */}
        <p className="mb-2 mt-5 text-xs text-text-secondary">{s.network.helpersHint}</p>
        <ul className="space-y-1.5">
          <BinaryRow
            s={s}
            binary="wireproxy"
            status={state.binaries.wireproxy}
            onChanged={refresh}
          />
          <BinaryRow s={s} binary="tor" status={state.binaries.tor} onChanged={refresh} />
        </ul>
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

      <NetworkRoutesCard s={s} state={state} />
    </div>
  );
}
