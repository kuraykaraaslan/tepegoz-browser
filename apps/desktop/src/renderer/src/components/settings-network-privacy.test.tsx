// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { settingsDict } from '@tepegoz/settings-ui';
import type { NetworkConnectionView, NetworkState } from '@tepegoz/desktop-ipc';
import { NetworkPrivacySection } from './settings-network-privacy';

/**
 * Network privacy (Phase 5) — the VPN/Tor connection manager. What it refuses to fake is what this
 * covers: the exit region is echoed as the user's own note ("Noted as: …"), a down connection shows
 * the provider's verbatim error, the keychain warning appears when secrets are unavailable, and
 * connect / disconnect / remove / default-route / helper-binary actions each hit their bridge call.
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

function netState(over: Partial<NetworkState> = {}): NetworkState {
  return {
    connections: [],
    general: { kind: 'direct' },
    tabs: {},
    groups: {},
    binaries: {
      wireproxy: { found: false, path: '', isOverride: false, dropInDir: '/opt/bin' },
      tor: { found: false, path: '', isOverride: false, dropInDir: '/opt/bin' },
    },
    secretsAvailable: true,
    ...over,
  };
}

const bridge = {
  getNetworkState: vi.fn(),
  onNetworkState: vi.fn(() => () => undefined),
  getTabsState: vi.fn(() => Promise.resolve({ tabs: [], groups: [], activeId: null })),
  onTabsState: vi.fn(() => () => undefined),
  setNetworkConnectionActive: vi.fn(() => Promise.resolve()),
  removeNetworkConnection: vi.fn(() => Promise.resolve()),
  newNetworkIdentity: vi.fn(() => Promise.resolve({ reconnected: true })),
  setGeneralNetworkBinding: vi.fn(() => Promise.resolve()),
  pickBinaryFolder: vi.fn<(binary: string) => Promise<string | null>>(() => Promise.resolve(null)),
  setNetworkBinaryPath: vi.fn(() => Promise.resolve()),
  addNetworkConnection: vi.fn(() => Promise.resolve()),
  pickWireguardProfile: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  bridge.getNetworkState.mockResolvedValue(netState());
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(cleanup);

const render1 = () => render(<NetworkPrivacySection s={s} />);
/** The <li> whose text is `label` — skips the same string appearing as a <select> <option>. */
const rowFor = async (label: string): Promise<HTMLElement> => {
  const matches = await screen.findAllByText(label);
  const li = matches.map((el) => el.closest('li')).find((el): el is HTMLLIElement => el !== null);
  if (li === undefined) throw new Error(`no <li> row for "${label}"`);
  return li;
};

describe('NetworkPrivacySection', () => {
  it('warns when the OS keychain is unavailable', async () => {
    bridge.getNetworkState.mockResolvedValue(netState({ secretsAvailable: false }));
    render1();
    await waitFor(() => expect(screen.getByText(s.network.keychainBody)).toBeTruthy());
  });

  it('shows the empty state with no connections', async () => {
    render1();
    await waitFor(() => expect(screen.getByText(s.network.noConnections)).toBeTruthy());
  });

  it('always states what a tunnel does NOT change, and links to per-site data clearing', async () => {
    render1();
    await waitFor(() => expect(screen.getByText(s.network.tunnelLimitsBody)).toBeTruthy());
    const link = screen.getByRole('link', { name: s.network.tunnelLimitsLink });
    expect(link.getAttribute('href')).toBe('#privacy');
  });

  it('discloses "a Tor tab is not a Tor Browser session" once any Tor connection exists', async () => {
    bridge.getNetworkState.mockResolvedValue(
      netState({ connections: [conn({ id: 't1', label: 'Tor', kind: 'tor' })] }),
    );
    render1();
    await waitFor(() => expect(screen.getByText(s.network.torNotTorBrowserBody)).toBeTruthy());
  });

  it('does NOT show the Tor-session disclosure when no connection is Tor', async () => {
    bridge.getNetworkState.mockResolvedValue(netState({ connections: [conn()] }));
    render1();
    await rowFor('Mullvad');
    expect(screen.queryByText(s.network.torNotTorBrowserBody)).toBeNull();
  });

  it('surfaces a rising drop count on the connection, so a flapping tunnel is visible', async () => {
    bridge.getNetworkState.mockResolvedValue(
      netState({ connections: [conn({ status: 'up', drops: 3 })] }),
    );
    render1();
    const row = await rowFor('Mullvad');
    expect(within(row).getByText(s.network.connDrops.replace('{count}', '3'))).toBeTruthy();
  });

  it('shows no drop line for a connection that has never dropped', async () => {
    bridge.getNetworkState.mockResolvedValue(netState({ connections: [conn({ drops: 0 })] }));
    render1();
    await rowFor('Mullvad');
    expect(screen.queryByText(s.network.connDrops.replace('{count}', '0'))).toBeNull();
  });

  it('warns on a chained VPN → Tor connection, on the row it applies to', async () => {
    bridge.getNetworkState.mockResolvedValue(
      netState({
        connections: [
          conn({ id: 'vpn', label: 'Mullvad' }),
          conn({ id: 'tor', label: 'Tor over VPN', kind: 'tor', upstreamConnectionId: 'vpn' }),
        ],
      }),
    );
    render1();
    const row = await rowFor('Tor over VPN');
    expect(within(row).getByText(s.network.torChainedCaveat)).toBeTruthy();
    // A straight-to-Tor connection would not carry it.
    expect(within(await rowFor('Mullvad')).queryByText(s.network.torChainedCaveat)).toBeNull();
  });

  it("echoes the exit note as the user's own claim and maps a provider error to one localized sentence", async () => {
    bridge.getNetworkState.mockResolvedValue(
      netState({
        connections: [
          conn({
            note: 'Mullvad SE',
            lastError: 'wireproxy did not come up: bad key material',
            status: 'down',
          }),
        ],
      }),
    );
    render1();
    const row = await rowFor('Mullvad');
    expect(within(row).getByText(s.network.notedAs.replace('{note}', 'Mullvad SE'))).toBeTruthy();
    // The localized "what happened + what to do" sentence, NOT the raw stderr.
    expect(within(row).getByText(s.network.connError.handshake)).toBeTruthy();
    expect(within(row).queryByText(/bad key material/)).toBeNull();
    // The raw string is still one hover away for a bug report.
    expect(within(row).getByText(s.network.connError.handshake).getAttribute('title')).toBe(
      'wireproxy did not come up: bad key material',
    );
    expect(within(row).getByRole('button', { name: s.network.connect })).toBeTruthy();
  });

  it('falls back to the generic sentence for an unrecognised provider error', async () => {
    bridge.getNetworkState.mockResolvedValue(
      netState({ connections: [conn({ lastError: 'totally novel failure', status: 'down' })] }),
    );
    render1();
    const row = await rowFor('Mullvad');
    expect(within(row).getByText(s.network.connError.unknown)).toBeTruthy();
  });

  it('connects a down connection through the bridge', async () => {
    bridge.getNetworkState.mockResolvedValue(netState({ connections: [conn({ status: 'down' })] }));
    render1();
    const row = await rowFor('Mullvad');
    fireEvent.click(within(row).getByRole('button', { name: s.network.connect }));
    expect(bridge.setNetworkConnectionActive).toHaveBeenCalledWith('c1', true);
  });

  it('disconnects an up connection through the bridge', async () => {
    bridge.getNetworkState.mockResolvedValue(netState({ connections: [conn({ status: 'up' })] }));
    render1();
    const row = await rowFor('Mullvad');
    expect(within(row).getByText(s.network.statusUp)).toBeTruthy();
    fireEvent.click(within(row).getByRole('button', { name: s.network.disconnect }));
    expect(bridge.setNetworkConnectionActive).toHaveBeenCalledWith('c1', false);
  });

  it('removes a connection through the confirm dialog', async () => {
    bridge.getNetworkState.mockResolvedValue(netState({ connections: [conn()] }));
    render1();
    const row = await rowFor('Mullvad');
    fireEvent.click(within(row).getByRole('button', { name: s.network.remove }));
    const confirm = screen.getAllByRole('button', { name: s.network.remove });
    fireEvent.click(confirm[confirm.length - 1]!);
    expect(bridge.removeNetworkConnection).toHaveBeenCalledWith('c1');
  });

  it('offers New identity on a Tor connection, and not on a VPN one', async () => {
    // A VPN or SOCKS reconnect lands on the same exit address, so the button there would name
    // something the product cannot deliver. Main refuses it too — this is the presentation half.
    bridge.getNetworkState.mockResolvedValue(
      netState({
        connections: [conn(), conn({ id: 't1', label: 'Onion', kind: 'tor' })],
      }),
    );
    render1();
    const vpnRow = await rowFor('Mullvad');
    expect(within(vpnRow).queryByRole('button', { name: s.network.newIdentity })).toBeNull();
    const torRow = await rowFor('Onion');
    expect(within(torRow).getByRole('button', { name: s.network.newIdentity })).toBeTruthy();
  });

  it('names how many tabs it will disturb before taking a new identity', async () => {
    // The phase's own requirement: this action "says which tabs it will disturb". A confirmation that
    // did not would replace an afternoon's reading with reloads as a surprise.
    bridge.getNetworkState.mockResolvedValue(
      netState({ connections: [conn({ id: 't1', label: 'Onion', kind: 'tor', boundTabs: 3 })] }),
    );
    render1();
    const row = await rowFor('Onion');
    fireEvent.click(within(row).getByRole('button', { name: s.network.newIdentity }));
    expect(screen.getByText(s.network.newIdentityTabs.replace('{count}', '3'))).toBeTruthy();
    // Both halves named, not just the circuits.
    expect(screen.getByText(s.network.newIdentityBody.replace('{name}', 'Onion'))).toBeTruthy();

    const buttons = screen.getAllByRole('button', { name: s.network.newIdentity });
    fireEvent.click(buttons[buttons.length - 1]!);
    expect(bridge.newNetworkIdentity).toHaveBeenCalledWith('t1');
    await waitFor(() => {
      expect(screen.getByText(s.network.newIdentityDone)).toBeTruthy();
    });
  });

  it('says the site data was cleared even when the tunnel did not come back', async () => {
    // Not a failed new identity — the circuits and the jar are gone either way. Reporting it as an
    // error would tell the user to retry an action that already did what it promised.
    bridge.newNetworkIdentity.mockResolvedValue({ reconnected: false });
    bridge.getNetworkState.mockResolvedValue(
      netState({ connections: [conn({ id: 't1', label: 'Onion', kind: 'tor' })] }),
    );
    render1();
    const row = await rowFor('Onion');
    fireEvent.click(within(row).getByRole('button', { name: s.network.newIdentity }));
    const buttons = screen.getAllByRole('button', { name: s.network.newIdentity });
    fireEvent.click(buttons[buttons.length - 1]!);
    await waitFor(() => {
      expect(screen.getByText(s.network.newIdentityDownAfter)).toBeTruthy();
    });
  });

  it('sets the profile-wide default route', async () => {
    bridge.getNetworkState.mockResolvedValue(netState({ connections: [conn()] }));
    render1();
    await rowFor('Mullvad');
    const select = screen
      .getAllByRole('combobox')
      .find((el) => el.id === 'network-general') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'c1' } });
    expect(bridge.setGeneralNetworkBinding).toHaveBeenCalledWith({
      kind: 'connection',
      connectionId: 'c1',
    });
  });

  it('resets the default route to Direct through the bridge', async () => {
    bridge.getNetworkState.mockResolvedValue(
      netState({ connections: [conn()], general: { kind: 'connection', connectionId: 'c1' } }),
    );
    render1();
    await rowFor('Mullvad');
    const select = screen
      .getAllByRole('combobox')
      .find((el) => el.id === 'network-general') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'direct' } });
    expect(bridge.setGeneralNetworkBinding).toHaveBeenCalledWith({ kind: 'direct' });
  });

  it('marks an auto-detected (non-override) helper binary as such', async () => {
    bridge.getNetworkState.mockResolvedValue(
      netState({
        binaries: {
          wireproxy: {
            found: true,
            path: '/usr/bin/wireproxy',
            isOverride: false,
            dropInDir: '/opt/bin',
          },
          tor: { found: false, path: '', isOverride: false, dropInDir: '/opt/bin' },
        },
      }),
    );
    render1();
    await waitFor(() => expect(screen.getByText(s.network.binaryAutoDetected)).toBeTruthy());
  });

  it('adds a new connection through the embedded form and refetches', async () => {
    render1();
    await waitFor(() => expect(bridge.getNetworkState).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText(s.network.kindLabel), {
      target: { value: 'byo-socks' },
    });
    fireEvent.change(screen.getByLabelText(s.network.nameLabel), {
      target: { value: 'Local SOCKS' },
    });
    fireEvent.change(screen.getByLabelText(s.network.portLabel), { target: { value: '1080' } });
    fireEvent.click(screen.getByRole('button', { name: s.network.add }));

    await waitFor(() =>
      expect(bridge.addNetworkConnection).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'byo-socks', label: 'Local SOCKS', socksPort: 1080 }),
      ),
    );
    await waitFor(() => expect(bridge.getNetworkState).toHaveBeenCalledTimes(2));
  });

  it('labels a SOCKS connection and shows a connecting badge mid-handshake', async () => {
    bridge.getNetworkState.mockResolvedValue(
      netState({
        connections: [conn({ label: 'Local', kind: 'byo-socks', status: 'connecting' })],
      }),
    );
    render1();
    const row = await rowFor('Local');
    expect(within(row).getByText(s.network.protocolByo)).toBeTruthy();
    expect(within(row).getByText(s.network.statusConnecting)).toBeTruthy();
  });

  it('shows the "chained via" note for a connection routed through another', async () => {
    bridge.getNetworkState.mockResolvedValue(
      netState({
        connections: [
          conn({ id: 'c1', label: 'Mullvad' }),
          conn({ id: 'c2', label: 'Tor exit', kind: 'tor', upstreamConnectionId: 'c1' }),
        ],
      }),
    );
    render1();
    const row = await rowFor('Tor exit');
    expect(within(row).getByText(s.network.chainedVia.replace('{name}', 'Mullvad'))).toBeTruthy();
  });

  it('browsing for a helper folder refetches on a pick and surfaces a rejection', async () => {
    render1();
    const wpRow = await rowFor('wireproxy');

    bridge.pickBinaryFolder.mockResolvedValueOnce('/opt/bin');
    fireEvent.click(within(wpRow).getByRole('button', { name: s.network.binaryBrowse }));
    await waitFor(() => expect(bridge.getNetworkState).toHaveBeenCalledTimes(2));

    bridge.pickBinaryFolder.mockRejectedValueOnce(new Error('searched /wrong/parent'));
    fireEvent.click(within(wpRow).getByRole('button', { name: s.network.binaryBrowse }));
    await waitFor(() => expect(screen.getByText('searched /wrong/parent')).toBeTruthy());
  });

  it('shows a helper-folder rejection that is not an Error', async () => {
    // The message names the folder that was searched, and the usual mistake is picking the parent of
    // the right one — so an empty line here is the difference between a fixable mistake and a dialog
    // that just refuses. A rejection crossing the bridge need not arrive as an Error.
    render1();
    const wpRow = await rowFor('wireproxy');

    bridge.pickBinaryFolder.mockRejectedValueOnce('EACCES reading /opt/bin');
    fireEvent.click(within(wpRow).getByRole('button', { name: s.network.binaryBrowse }));

    await waitFor(() => expect(screen.getByText('EACCES reading /opt/bin')).toBeTruthy());
  });

  it('a missing helper binary offers Browse; an overridden one offers Clear', async () => {
    bridge.getNetworkState.mockResolvedValue(
      netState({
        binaries: {
          wireproxy: { found: false, path: '', isOverride: false, dropInDir: '/opt/bin' },
          tor: { found: true, path: '/usr/bin/tor', isOverride: true, dropInDir: '/opt/bin' },
        },
      }),
    );
    render1();
    const wpRow = await rowFor('wireproxy');
    expect(within(wpRow).getByRole('button', { name: s.network.binaryBrowse })).toBeTruthy();

    const torRow = screen.getByText('/usr/bin/tor').closest('li') as HTMLElement;
    fireEvent.click(within(torRow).getByRole('button', { name: s.network.binaryClear }));
    expect(bridge.setNetworkBinaryPath).toHaveBeenCalledWith('tor', '');
  });
});
