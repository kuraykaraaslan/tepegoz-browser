// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { settingsDict } from '@tepegoz/settings-ui';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import type { NetworkState, Preferences } from '@tepegoz/desktop-ipc';
import { MirroredSettingsCard } from './settings-developer-mirrored';

/**
 * ADR-0041 Tier D — "mirrored, not re-owned": telemetry + Safe Browsing come straight off `prefs` (the
 * same read the Privacy section renders from), the default network route comes off `getNetworkState()`
 * (the same read `settings-network-privacy.tsx` uses). What is pinned here: every row shows its label
 * and current value, and "Open in Settings" deep-links to the section that actually owns the value — this
 * card itself never calls `updatePreferences` or any network-write bridge method.
 */

const s = settingsDict.en;

function netState(over: Partial<NetworkState> = {}): NetworkState {
  return {
    connections: [],
    general: { kind: 'direct' },
    tabs: {},
    groups: {},
    binaries: {
      wireproxy: { found: false, path: '', isOverride: false, dropInDir: '' },
      tor: { found: false, path: '', isOverride: false, dropInDir: '' },
    },
    secretsAvailable: true,
    ...over,
  };
}

const bridge = {
  getNetworkState: vi.fn<() => Promise<NetworkState>>(() => Promise.resolve(netState())),
  onNetworkState: vi.fn(() => () => undefined),
  navigateTab: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  bridge.getNetworkState.mockResolvedValue(netState());
  bridge.onNetworkState.mockReturnValue(() => undefined);
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(cleanup);

function renderCard(over: Partial<Preferences> = {}) {
  render(
    <I18nProvider locale="en">
      <MirroredSettingsCard prefs={{ ...DEFAULT_PREFERENCES, ...over }} />
    </I18nProvider>,
  );
}

/** The row whose label text is `label`. */
function rowFor(label: string): HTMLElement {
  return screen.getByText(label).closest('li')!;
}

describe('MirroredSettingsCard', () => {
  it('shows telemetry and Safe Browsing read off prefs, no bridge call needed for either', () => {
    renderCard({ telemetryEnabled: true, safeBrowsingEnabled: false });

    expect(
      within(rowFor(s.developerMirroredTelemetry)).getByText(s.developerMirroredEnabled),
    ).toBeTruthy();
    expect(
      within(rowFor(s.developerMirroredSafeBrowsing)).getByText(s.developerMirroredDisabled),
    ).toBeTruthy();
  });

  it('shows "Direct (no tunnel)" for the default route when general is direct', async () => {
    renderCard();
    await waitFor(() =>
      expect(
        within(rowFor(s.developerMirroredNetworkRoute)).getByText(s.network.direct),
      ).toBeTruthy(),
    );
  });

  it("shows the bound connection's label for the default route when general points at one", async () => {
    bridge.getNetworkState.mockResolvedValue(
      netState({
        general: { kind: 'connection', connectionId: 'c1' },
        connections: [
          {
            id: 'c1',
            label: 'Mullvad',
            upstreamConnectionId: null,
            lastError: null,
            note: '',
            kind: 'wireguard',
            status: 'up',
            connectedSince: null,
            lastCheckedAt: null,
            drops: 0,
            lastHandshakeAt: null,
            lastErrorAt: null,
            handshakesOk: 0,
            handshakesFailed: 0,
            reconnects: 0,
            boundTabs: 0,
            slowCause: 'insufficient_signal',
          },
        ],
      }),
    );
    renderCard();
    await waitFor(() =>
      expect(within(rowFor(s.developerMirroredNetworkRoute)).getByText('Mullvad')).toBeTruthy(),
    );
  });

  it('deep-links telemetry and Safe Browsing to the privacy section', () => {
    renderCard();
    fireEvent.click(within(rowFor(s.developerMirroredTelemetry)).getByRole('button'));
    expect(bridge.navigateTab).toHaveBeenCalledWith('tepegoz://settings#privacy');

    fireEvent.click(within(rowFor(s.developerMirroredSafeBrowsing)).getByRole('button'));
    expect(bridge.navigateTab).toHaveBeenCalledWith('tepegoz://settings#privacy');
  });

  it('deep-links the default route to the network-privacy section', async () => {
    renderCard();
    await waitFor(() => expect(bridge.getNetworkState).toHaveBeenCalled());
    fireEvent.click(within(rowFor(s.developerMirroredNetworkRoute)).getByRole('button'));
    expect(bridge.navigateTab).toHaveBeenCalledWith('tepegoz://settings#network-privacy');
  });
});
