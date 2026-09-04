// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { settingsDict } from '@tepegoz/settings-ui';
import type { NetworkConnectionView, PickedWireguardProfile } from '@tepegoz/desktop-ipc';
import { AddConnectionRow } from './settings-network-forms';

/**
 * The single "add a connection" row for the network manager (Phase 5). One row, protocol dropdown,
 * and exactly one protocol-specific field. Under test: the Add button's enable gate per protocol
 * (label required; WireGuard needs a picked .conf and is blocked without the keychain; SOCKS needs a
 * 1..65535 port); the discriminated input each protocol submits; the Tor upstream list excludes Tor
 * connections; and a picked profile auto-names the connection.
 */

const s = settingsDict.en;

const view = (over: Partial<NetworkConnectionView> = {}): NetworkConnectionView =>
  ({ id: 'fra', label: 'FRA', kind: 'wireguard', ...over }) as unknown as NetworkConnectionView;

const picked: PickedWireguardProfile = {
  path: '/tmp/home.conf',
  fileName: 'home.conf',
  endpoint: '1.2.3.4:51820',
  dns: ['1.1.1.1'],
} as unknown as PickedWireguardProfile;

const pickWireguardProfile = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: { pickWireguardProfile },
  });
});
afterEach(cleanup);

function renderRow(
  opts: {
    secretsAvailable?: boolean;
    connections?: NetworkConnectionView[];
    onAddImpl?: () => Promise<void>;
  } = {},
) {
  const onAdd = vi.fn(opts.onAddImpl ?? (() => Promise.resolve()));
  render(
    <AddConnectionRow
      s={s}
      connections={opts.connections ?? []}
      secretsAvailable={opts.secretsAvailable ?? true}
      onAdd={onAdd}
    />,
  );
  return { onAdd };
}

const addBtn = () => screen.getByRole<HTMLButtonElement>('button', { name: s.network.add });
const kindSelect = () => screen.getByLabelText(s.network.kindLabel);
const nameInput = () => screen.getByLabelText(s.network.nameLabel);

describe('AddConnectionRow', () => {
  it('keeps Add disabled until a WireGuard profile is chosen', () => {
    pickWireguardProfile.mockResolvedValue(picked);
    renderRow();
    fireEvent.change(nameInput(), { target: { value: 'Home' } });
    expect(addBtn().disabled).toBe(true); // no .conf yet
  });

  it('blocks WireGuard entirely when the OS keychain is unavailable', () => {
    renderRow({ secretsAvailable: false });
    fireEvent.change(nameInput(), { target: { value: 'Home' } });
    expect(addBtn().disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: s.network.chooseFile }).disabled).toBe(true);
  });

  it('picks a .conf, auto-fills the name from it, and submits a wireguard input', async () => {
    pickWireguardProfile.mockResolvedValue(picked);
    const { onAdd } = renderRow();
    fireEvent.click(screen.getByRole('button', { name: s.network.chooseFile }));
    await waitFor(() => expect((nameInput() as HTMLInputElement).value).toBe('home'));

    fireEvent.click(addBtn());
    expect(onAdd).toHaveBeenCalledWith({
      kind: 'wireguard',
      label: 'home',
      note: '',
      sourcePath: '/tmp/home.conf',
    });
  });

  it('submits a byo-socks input only with a valid port', () => {
    const { onAdd } = renderRow();
    fireEvent.change(kindSelect(), { target: { value: 'byo-socks' } });
    fireEvent.change(nameInput(), { target: { value: 'Local' } });

    fireEvent.change(screen.getByLabelText(s.network.portLabel), { target: { value: '70000' } });
    expect(addBtn().disabled).toBe(true);
    expect(screen.getByText(s.network.portInvalid)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(s.network.portLabel), { target: { value: '1080' } });
    fireEvent.click(addBtn());
    expect(onAdd).toHaveBeenCalledWith({ kind: 'byo-socks', label: 'Local', note: '', socksPort: 1080 });
  });

  it('offers non-Tor connections as Tor upstreams and submits the chosen one', () => {
    const { onAdd } = renderRow({
      connections: [
        view({ id: 'fra', label: 'FRA', kind: 'wireguard' }),
        view({ id: 'tor1', label: 'Tor', kind: 'tor' }),
      ],
    });
    fireEvent.change(kindSelect(), { target: { value: 'tor' } });
    fireEvent.change(nameInput(), { target: { value: 'Chained' } });

    const upstream = screen.getByLabelText(s.network.torUpstream);
    // one "none" option + FRA, but NOT the Tor connection
    expect(upstream.querySelectorAll('option')).toHaveLength(2);

    fireEvent.change(upstream, { target: { value: 'fra' } });
    fireEvent.click(addBtn());
    expect(onAdd).toHaveBeenCalledWith({
      kind: 'tor',
      label: 'Chained',
      note: '',
      upstreamConnectionId: 'fra',
    });
  });

  it('surfaces the parser error when picking a .conf rejects', async () => {
    pickWireguardProfile.mockRejectedValue(new Error('no DNS line in [Interface]'));
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: s.network.chooseFile }));
    await waitFor(() => expect(screen.getByText('no DNS line in [Interface]')).toBeTruthy());
  });

  it('shows the error when onAdd itself rejects', async () => {
    const { onAdd } = renderRow({ onAddImpl: () => Promise.reject(new Error('daemon refused the profile')) });
    fireEvent.change(kindSelect(), { target: { value: 'byo-socks' } });
    fireEvent.change(nameInput(), { target: { value: 'Local' } });
    fireEvent.change(screen.getByLabelText(s.network.portLabel), { target: { value: '1080' } });
    fireEvent.click(addBtn());
    expect(onAdd).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('daemon refused the profile')).toBeTruthy());
  });

  it('keeps the typed note and submits it with the connection', () => {
    const { onAdd } = renderRow();
    fireEvent.change(kindSelect(), { target: { value: 'byo-socks' } });
    fireEvent.change(nameInput(), { target: { value: 'Local' } });
    fireEvent.change(screen.getByLabelText(s.network.noteLabel), { target: { value: 'lab box' } });
    fireEvent.change(screen.getByLabelText(s.network.portLabel), { target: { value: '1080' } });
    fireEvent.click(addBtn());
    expect(onAdd).toHaveBeenCalledWith({ kind: 'byo-socks', label: 'Local', note: 'lab box', socksPort: 1080 });
  });
});
