import type { SettingsStrings } from '@tepegoz/settings-ui';
import { Badge, Card } from '@tepegoz/ui';
import { formatRelativeTime } from '@tepegoz/i18n';
import { useLocale } from '@tepegoz/i18n/react';
import type { NetworkConnectionView, NetworkState } from '@tepegoz/desktop-ipc';
import { classifyNetworkError } from './network-error';
import { handshakeSuccessRate, parseConnectionHealth } from './network-health';

/**
 * Connection health over time (Phase 5) — a READ-ONLY view of how each configured connection has held
 * up this session: handshake-success rate, reconnect count, when it last connected, and the last error.
 *
 * A separate card from the connection manager, and deliberately not a set of controls: connect /
 * disconnect / remove live one card up, on the connection itself. What was missing was the ability to
 * SEE a tunnel that keeps flapping — a rising reconnect count or a sub-100% handshake rate is visible
 * here without waiting for the leak that would otherwise be the first sign.
 *
 * Every number is session-scoped and resets when Tepegöz restarts; the subtitle says so. The last
 * error is shown as the same localized "what happened + what to do" sentence the manager uses (never
 * the raw provider stderr — that stays one hover away), paired with how long ago it happened.
 */

function statusBadge(status: NetworkConnectionView['status'], s: SettingsStrings) {
  if (status === 'up')
    return (
      <Badge variant="success" size="sm" dot>
        {s.network.statusUp}
      </Badge>
    );
  if (status === 'connecting')
    return (
      <Badge variant="warning" size="sm" dot>
        {s.network.statusConnecting}
      </Badge>
    );
  return (
    <Badge variant="neutral" size="sm" dot>
      {s.network.statusDown}
    </Badge>
  );
}

function HealthRow({ c, s }: { c: NetworkConnectionView; s: SettingsStrings }) {
  const locale = useLocale();
  const now = Date.now();
  const health = parseConnectionHealth(c);

  return (
    <li className="rounded-md border border-border px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
          {c.label}
        </span>
        {statusBadge(c.status, s)}
      </div>

      {health === null ? (
        <p className="mt-1 text-text-disabled">{s.network.healthUnavailable}</p>
      ) : (
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-text-secondary">
          <dt>{s.network.healthLastHandshake}</dt>
          <dd className="text-text-primary">
            {health.lastHandshakeAt === null
              ? s.network.healthNever
              : formatRelativeTime(health.lastHandshakeAt, locale, now)}
          </dd>

          <dt>{s.network.healthReconnects}</dt>
          <dd className="text-text-primary">{String(health.reconnects)}</dd>

          <dt>{s.network.healthHandshakes}</dt>
          <dd className="text-text-primary">
            {(() => {
              const rate = handshakeSuccessRate(health);
              if (rate === null) return s.network.healthHandshakesNone;
              return s.network.healthHandshakesRate
                .replace('{ok}', String(health.handshakesOk))
                .replace('{total}', String(health.handshakesOk + health.handshakesFailed))
                .replace('{pct}', String(rate));
            })()}
          </dd>

          {health.lastErrorAt !== null && (
            <>
              <dt>{s.network.healthLastError}</dt>
              {/* The localized sentence + how long ago — never the raw stderr, which stays on the
                  title for a bug report (Phase 5: errors in the user's language, with a next step). */}
              <dd className="text-error-fg" title={c.lastError ?? undefined}>
                {formatRelativeTime(health.lastErrorAt, locale, now)} ·{' '}
                {s.network.connError[classifyNetworkError(c.lastError)]}
              </dd>
            </>
          )}
        </dl>
      )}
    </li>
  );
}

export function NetworkHealthCard({ s, state }: { s: SettingsStrings; state: NetworkState }) {
  if (state.connections.length === 0) return null;
  return (
    <Card title={s.network.healthTitle} subtitle={s.network.healthHint}>
      <ul className="space-y-1.5">
        {state.connections.map((c) => (
          <HealthRow key={c.id} c={c} s={s} />
        ))}
      </ul>
    </Card>
  );
}
