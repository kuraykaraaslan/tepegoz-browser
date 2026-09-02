import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Main-process wiring shim for the Adblock Shield extension host. It hands `createAdblockHost` three
 * adapters. Pinned: `getPersisted` reads `PreferenceStore.adblock`, `setPersisted` writes it back
 * under that key, and `isExtensionEnabled` consults the global gate with the adblock extension id.
 */

type Opts = {
  getPersisted: () => unknown;
  setPersisted: (v: unknown) => void;
  isExtensionEnabled: () => boolean;
};
const cap = vi.hoisted((): { opts?: Opts } => ({}));
vi.mock('@tepegoz/ext-adblock/host', () => ({
  ADBLOCK_EXTENSION_ID: 'adblock',
  createAdblockHost: (opts: Opts) => {
    cap.opts = opts;
    return { __host: 'adblock' };
  },
}));

const isExtensionEnabled = vi.hoisted(() => vi.fn(() => true));
vi.mock('@tepegoz/desktop-ipc', () => ({ isExtensionEnabled }));

const prefs = vi.hoisted(() => ({
  getAll: vi.fn(() => ({ adblock: { blockingMode: 'balanced' }, extensions: [{ id: 'adblock' }] })),
  update: vi.fn(),
}));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));

const { default: adblockHost } = await import('./adblock-host.electron');
const opts = (): Opts => cap.opts!;

beforeEach(() => {
  vi.clearAllMocks();
  isExtensionEnabled.mockReturnValue(true);
  prefs.getAll.mockReturnValue({
    adblock: { blockingMode: 'balanced' },
    extensions: [{ id: 'adblock' }],
  });
});

describe('adblock-host wiring', () => {
  it('exports whatever the factory returned', () => {
    expect(adblockHost).toEqual({ __host: 'adblock' });
  });

  it('getPersisted reads PreferenceStore.adblock', () => {
    expect(opts().getPersisted()).toEqual({ blockingMode: 'balanced' });
  });

  it('setPersisted writes it back under the adblock key', () => {
    opts().setPersisted({ blockingMode: 'aggressive' });
    expect(prefs.update).toHaveBeenCalledWith({ adblock: { blockingMode: 'aggressive' } });
  });

  it('isExtensionEnabled consults the global gate with the adblock id', () => {
    isExtensionEnabled.mockReturnValue(false);
    expect(opts().isExtensionEnabled()).toBe(false);
    expect(isExtensionEnabled).toHaveBeenCalledWith([{ id: 'adblock' }], 'adblock');
  });
});
