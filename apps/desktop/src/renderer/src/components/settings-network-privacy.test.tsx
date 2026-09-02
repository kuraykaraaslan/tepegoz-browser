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
  setGeneralNetworkBinding: vi.fn(() => Promise.resolve()),
  pickBinaryFolder: vi.fn(() => Promise.resolve(null)),
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

  it('echoes the exit note as the user\'s own claim and shows a verbatim error while down', async () => {
    bridge.getNetworkState.mockResolvedValue(
      netState({
        connections: [conn({ note: 'Mullvad SE', lastError: 'wireproxy not found', status: 'down' })],
      }),
    );
    render1();
    const row = await rowFor('Mullvad');
    expect(within(row).getByText(s.network.notedAs.replace('{note}', 'Mullvad SE'))).toBeTruthy();
    expect(within(row).getByText('wireproxy not found')).toBeTruthy();
    expect(within(row).getByRole('button', { name: s.network.connect })).toBeTruthy();
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

    const torRow = (screen.getByText('/usr/bin/tor').closest('li')) as HTMLElement;
    fireEvent.click(within(torRow).getByRole('button', { name: s.network.binaryClear }));
    expect(bridge.setNetworkBinaryPath).toHaveBeenCalledWith('tor', '');
  });
});
