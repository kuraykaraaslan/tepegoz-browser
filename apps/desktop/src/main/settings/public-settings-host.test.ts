import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The main-process owner of the PUBLIC settings surface handed to extensions. The guarantee it makes
 * is a security one: the projection is built by iterating `PUBLIC_SETTING_KEYS`, never by spreading
 * raw prefs, and the result is zod-validated so a projection bug still cannot leak a private field.
 * Both halves are pinned here — the allowlist projection AND the schema stripping anything else — plus
 * that `broadcastPublicSettings` pushes that same snapshot through the app-surface seam.
 */

const prefs = vi.hoisted((): { value: Record<string, unknown> } => ({ value: {} }));

vi.mock('@tepegoz/preferences', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tepegoz/preferences')>();
  return { ...actual, default: { getAll: () => prefs.value } };
});

const broadcastToAppSurfaces = vi.hoisted(() => vi.fn());
vi.mock('../lib/app-surfaces', () => ({ broadcastToAppSurfaces }));
vi.mock('../lib/i18n-main', () => ({ mainLocale: () => 'tr' }));

const { getPublicSettings, broadcastPublicSettings } = await import('./public-settings-host');
const { IpcChannels } = await import('@tepegoz/desktop-ipc');

const PUBLIC = {
  theme: 'dark',
  themeColor: '#0a84ff',
  locale: 'en',
  telemetryEnabled: true,
  notificationsEnabled: false,
  useLocalModelForSimpleTasks: true,
  defaultProvider: 'anthropic',
};

beforeEach(() => {
  broadcastToAppSurfaces.mockClear();
  prefs.value = {
    ...PUBLIC,
    // A private preference sitting right next to the public ones.
    agentTokenQuota: 999,
    networkBinaries: { wireproxy: '/secret/path', tor: '/secret/tor' },
  };
});

describe('getPublicSettings', () => {
  it('projects exactly the allowlisted public keys plus the resolved locale', () => {
    expect(getPublicSettings()).toEqual({ ...PUBLIC, resolvedLocale: 'tr' });
  });

  it('never carries a private preference, even one adjacent in the prefs object', () => {
    const snapshot = getPublicSettings() as unknown as Record<string, unknown>;
    expect(snapshot).not.toHaveProperty('agentTokenQuota');
    expect(snapshot).not.toHaveProperty('networkBinaries');
  });

  it('throws rather than emit a malformed snapshot when a public value is the wrong type', () => {
    prefs.value = { ...prefs.value, telemetryEnabled: 'yes' };
    expect(() => getPublicSettings()).toThrow();
  });
});

describe('broadcastPublicSettings', () => {
  it('pushes the current snapshot to every app surface on the public-settings channel', () => {
    broadcastPublicSettings();
    expect(broadcastToAppSurfaces).toHaveBeenCalledTimes(1);
    expect(broadcastToAppSurfaces).toHaveBeenCalledWith(IpcChannels.publicSettingsChanged, {
      ...PUBLIC,
      resolvedLocale: 'tr',
    });
  });
});
