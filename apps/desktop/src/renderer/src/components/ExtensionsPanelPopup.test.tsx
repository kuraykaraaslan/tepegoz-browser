// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import { INTERNAL_EXTENSIONS_URL } from '@tepegoz/desktop-ipc';
import type { ExtensionManifestWire } from '@tepegoz/desktop-ipc';
import { extensionsDict } from '@tepegoz/extensions-ui/i18n';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { ExtensionsPanelPopup } from './ExtensionsPanelPopup';

/**
 * The puzzle button's Extensions panel — its own native window. Lists every ENABLED extension grouped
 * by page-content access, with a pin toggle per row (optimistic, reverted if main rejects the write) and
 * a `⋮` that opens the native menu. A row click relays to main (this window doesn't route surfaces).
 */

stubJsdomLayout();

const x = extensionsDict.en;

function wire(
  id: string,
  name: string,
  permissions: string[] = [],
): ExtensionManifestWire {
  return {
    id,
    name,
    version: '1.0.0',
    description: '',
    icon: 'robot',
    surfaces: [],
    actions: { click: undefined, doubleClick: undefined },
    labels: {},
    permissions,
  } as ExtensionManifestWire;
}

const bridge = {
  getPreferences: vi.fn(() => Promise.resolve({ ...DEFAULT_PREFERENCES })),
  listExtensionManifests: vi.fn<() => Promise<ExtensionManifestWire[]>>(() => Promise.resolve([])),
  updatePreferences: vi.fn(() => Promise.resolve({ ...DEFAULT_PREFERENCES })),
  requestOpenExtension: vi.fn(),
  showExtensionContextMenu: vi.fn(),
  navigateTab: vi.fn(),
  resizePopup: vi.fn(),
  closePopup: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  bridge.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES });
  bridge.listExtensionManifests.mockResolvedValue([]);
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ExtensionsPanelPopup', () => {
  it('shows the none-enabled message and reports its measured height', async () => {
    render(<ExtensionsPanelPopup />);
    await waitFor(() => expect(screen.getByText(x.noneEnabled)).toBeTruthy());
    expect(bridge.resizePopup).toHaveBeenCalled();
  });

  it('never fetches the manifest list when the preferences fetch rejects', async () => {
    bridge.getPreferences.mockRejectedValueOnce(new Error('prefs gone'));
    render(<ExtensionsPanelPopup />);
    await waitFor(() => expect(bridge.resizePopup).toHaveBeenCalled());
    expect(screen.getByText(x.noneEnabled)).toBeTruthy();
    expect(bridge.listExtensionManifests).not.toHaveBeenCalled();
  });

  it('still offers "Manage extensions" when the manifest list rejects', async () => {
    bridge.listExtensionManifests.mockRejectedValueOnce(new Error('catalog gone'));
    render(<ExtensionsPanelPopup />);
    expect(await screen.findByText(x.manage)).toBeTruthy();
    expect(screen.getByText(x.noneEnabled)).toBeTruthy();
  });

  it('groups extensions by page access, only enabled ones', async () => {
    bridge.getPreferences.mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      extensions: [{ id: 'off', status: 'disabled' }],
    });
    bridge.listExtensionManifests.mockResolvedValue([
      wire('reader', 'Reader', ['read-page']),
      wire('vault', 'Vault', []),
      wire('off', 'Disabled one', []),
    ]);
    render(<ExtensionsPanelPopup />);

    const withAccess = (await screen.findByText(x.groupPageAccess)).closest('section') as HTMLElement;
    expect(within(withAccess).getByText('Reader')).toBeTruthy();
    const noAccess = screen.getByText(x.groupNoAccess).closest('section') as HTMLElement;
    expect(within(noAccess).getByText('Vault')).toBeTruthy();
    expect(screen.queryByText('Disabled one')).toBeNull();
  });

  it('runs the row action, opens the native menu, and toggles the pin (optimistic + persisted)', async () => {
    bridge.listExtensionManifests.mockResolvedValue([wire('reader', 'Reader', ['read-page'])]);
    render(<ExtensionsPanelPopup />);

    fireEvent.click(await screen.findByRole('button', { name: 'Reader' }));
    expect(bridge.requestOpenExtension).toHaveBeenCalledWith('reader');

    fireEvent.click(screen.getByRole('button', { name: x.moreOptions }));
    expect(bridge.showExtensionContextMenu).toHaveBeenCalledWith('reader');

    const pinBtn = screen.getByRole('button', { name: x.pin });
    fireEvent.click(pinBtn);
    // optimistic flip is immediate — the label swaps to Unpin before the write settles
    expect(screen.getByRole('button', { name: x.unpin })).toBeTruthy();
    await waitFor(() =>
      expect(bridge.updatePreferences).toHaveBeenCalledWith({ pinnedExtensions: ['reader'] }),
    );
  });

  it('reverts the pin toggle when the write rejects', async () => {
    bridge.listExtensionManifests.mockResolvedValue([wire('reader', 'Reader', [])]);
    bridge.updatePreferences.mockRejectedValueOnce(new Error('write failed'));
    render(<ExtensionsPanelPopup />);

    fireEvent.click(await screen.findByRole('button', { name: x.pin }));
    expect(screen.getByRole('button', { name: x.unpin })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: x.pin })).toBeTruthy());
  });

  it('unpins an already-pinned extension', async () => {
    bridge.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES, pinnedExtensions: ['reader'] });
    bridge.listExtensionManifests.mockResolvedValue([wire('reader', 'Reader', [])]);
    render(<ExtensionsPanelPopup />);

    fireEvent.click(await screen.findByRole('button', { name: x.unpin }));
    await waitFor(() =>
      expect(bridge.updatePreferences).toHaveBeenCalledWith({ pinnedExtensions: [] }),
    );
  });

  it('opens the full Extensions page and closes the popup', async () => {
    render(<ExtensionsPanelPopup />);
    fireEvent.click(await screen.findByText(x.manage));
    expect(bridge.navigateTab).toHaveBeenCalledWith(INTERNAL_EXTENSIONS_URL);
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
  });

  it('uses a stored en/tr locale directly, skipping the navigator fallback', async () => {
    bridge.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES, locale: 'tr' });
    render(<ExtensionsPanelPopup />);
    expect(await screen.findByText(extensionsDict.tr.noneEnabled)).toBeTruthy();
  });

  it('closes on Escape', async () => {
    render(<ExtensionsPanelPopup />);
    await waitFor(() => expect(bridge.resizePopup).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
  });
});
