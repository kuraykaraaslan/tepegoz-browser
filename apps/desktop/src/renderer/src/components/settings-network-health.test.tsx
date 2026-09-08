// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { settingsDict } from '@tepegoz/settings-ui';
import { formatRelativeTime } from '@tepegoz/i18n';
import type { NetworkConnectionView, NetworkState } from '@tepegoz/desktop-ipc';
import { NetworkHealthCard } from './settings-network-health';

/**
 * Connection health over time (Phase 5) — the read-only overview. What this pins: every connection's
 * state renders, "last handshake" is a locale relative time, the last-error row shows only when there
 * has been an error, and a health record that fails validation degrades to "unavailable" rather than
 * throwing (the IPC read is `safeParse`d at the renderer boundary).
 */

const s = settingsDict.en;

function conn(over: Partial<NetworkConnectionView> = {}): NetworkConnectionView {
  return {
    id: 'c1',
    label: 'Mullvad',
    upstreamConnectionId: null,
    lastError: null,
    note: '',
    kind: 'wireguard',
    status: 'down',
    connectedSince: null,
    lastCheckedAt: null,
    drops: 0,
    lastHandshakeAt: null,
    lastErrorAt: null,
    handshakesOk: 0,
    handshakesFailed: 0,
    reconnects: 0,
    boundTabs: 0,
    ...over,
  };
}

function netState(connections: NetworkConnectionView[]): NetworkState {
  return {
    connections,
    general: { kind: 'direct' },
    tabs: {},
    groups: {},
    binaries: {
      wireproxy: { found: false, path: '', isOverride: false, dropInDir: '/opt/bin' },
      tor: { found: false, path: '', isOverride: false, dropInDir: '/opt/bin' },
    },
    secretsAvailable: true,
  };
}

const rowFor = (label: string): HTMLElement => {
  const li = screen.getByText(label).closest('li');
  if (li === null) throw new Error(`no row for "${label}"`);
  return li;
};

afterEach(cleanup);

describe('NetworkHealthCard', () => {
  it('renders nothing when there are no connections', () => {
    const { container } = render(<NetworkHealthCard s={s} state={netState([])} />);
    expect(container.childElementCount).toBe(0);
  });

  it('renders each connection with its live status', () => {
    render(
      <NetworkHealthCard
        s={s}
        state={netState([
          conn({ id: 'a', label: 'FRA', status: 'up' }),
          conn({ id: 'b', label: 'Onion', status: 'connecting' }),
        ])}
      />,
    );
    expect(within(rowFor('FRA')).getByText(s.network.statusUp)).toBeTruthy();
    expect(within(rowFor('Onion')).getByText(s.network.statusConnecting)).toBeTruthy();
  });

  it('shows "not connected this session" until the first handshake, then a relative time', () => {
    const { rerender } = render(
      <NetworkHealthCard s={s} state={netState([conn({ label: 'FRA' })])} />,
    );
    expect(within(rowFor('FRA')).getByText(s.network.healthNever)).toBeTruthy();

    const at = Date.now() - 5 * 60_000;
    rerender(
      <NetworkHealthCard s={s} state={netState([conn({ label: 'FRA', lastHandshakeAt: at })])} />,
    );
    // Same formatter the component uses — locale-correct, not a hand-rolled "5m ago". A few ms of
    // clock drift between here and render does not move a 5-minute difference.
    expect(within(rowFor('FRA')).getByText(formatRelativeTime(at, 'en', Date.now()))).toBeTruthy();
  });

  it('renders the reconnect count and the handshake-success rate', () => {
    render(
      <NetworkHealthCard
        s={s}
        state={netState([
          conn({ label: 'FRA', reconnects: 4, handshakesOk: 3, handshakesFailed: 1 }),
        ])}
      />,
    );
    const row = rowFor('FRA');
    expect(within(row).getByText('4')).toBeTruthy();
    expect(
      within(row).getByText(
        s.network.healthHandshakesRate
          .replace('{ok}', '3')
          .replace('{total}', '4')
          .replace('{pct}', '75'),
      ),
    ).toBeTruthy();
  });

  it('says "none attempted yet" when no handshake has been tried', () => {
    render(<NetworkHealthCard s={s} state={netState([conn({ label: 'FRA' })])} />);
    expect(within(rowFor('FRA')).getByText(s.network.healthHandshakesNone)).toBeTruthy();
  });

  it('shows the last-error row only when there has been an error, as a localized sentence', () => {
    const { rerender } = render(
      <NetworkHealthCard s={s} state={netState([conn({ label: 'FRA' })])} />,
    );
    expect(within(rowFor('FRA')).queryByText(s.network.healthLastError)).toBeNull();

    rerender(
      <NetworkHealthCard
        s={s}
        state={netState([
          conn({
            label: 'FRA',
            status: 'down',
            lastErrorAt: Date.now() - 30_000,
            lastError: 'wireproxy did not come up: bad key material',
          }),
        ])}
      />,
    );
    const row = rowFor('FRA');
    expect(within(row).getByText(s.network.healthLastError)).toBeTruthy();
    // The localized "what happened + what to do" sentence, not the raw stderr…
    expect(within(row).getByText(new RegExp(s.network.connError.handshake))).toBeTruthy();
    expect(within(row).queryByText(/bad key material/)).toBeNull();
    // …which stays one hover away for a bug report.
    expect(within(row).getByText(new RegExp(s.network.connError.handshake)).getAttribute('title')).toBe(
      'wireproxy did not come up: bad key material',
    );
  });

  it('degrades to "unavailable" when the health record fails zod validation', () => {
    // A record the pool could never actually emit (a negative counter) — the renderer must not trust it.
    const bad: NetworkConnectionView = { ...conn({ label: 'FRA' }), reconnects: -3 };
    render(<NetworkHealthCard s={s} state={netState([bad])} />);
    const row = rowFor('FRA');
    expect(within(row).getByText(s.network.healthUnavailable)).toBeTruthy();
    expect(within(row).queryByText(s.network.healthReconnects)).toBeNull();
  });
});
