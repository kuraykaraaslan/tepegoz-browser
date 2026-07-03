import { describe, it, expect } from 'vitest';
import { PUBLIC_SETTING_KEYS, SETTINGS_VISIBILITY } from '@tepegoz/desktop-ipc';
import { PublicSettingsSchema } from './preferences.model';

/**
 * These guards make the public/private allowlist, the exposed shape, and its zod validator impossible
 * to drift apart — the whole security value of the public-settings surface rests on them agreeing.
 */
describe('public settings allowlist ↔ schema parity', () => {
  it('every "public"-classified preference appears in PUBLIC_SETTING_KEYS (and vice-versa)', () => {
    const publicByVisibility = Object.entries(SETTINGS_VISIBILITY)
      .filter(([, v]) => v === 'public')
      .map(([k]) => k)
      .sort((a, b) => a.localeCompare(b));
    expect([...PUBLIC_SETTING_KEYS].sort((a, b) => a.localeCompare(b))).toEqual(publicByVisibility);
  });

  it('PublicSettingsSchema exposes exactly the public keys plus resolvedLocale (no private leakage)', () => {
    const schemaKeys = Object.keys(PublicSettingsSchema.shape).sort((a, b) => a.localeCompare(b));
    const expected = [...PUBLIC_SETTING_KEYS, 'resolvedLocale'].sort((a, b) => a.localeCompare(b));
    expect(schemaKeys).toEqual(expected);
  });

  it('strips any key not in the public set (a projection bug cannot leak a private field)', () => {
    const parsed = PublicSettingsSchema.parse({
      theme: 'system',
      themeColor: '',
      locale: 'en',
      telemetryEnabled: false,
      notificationsEnabled: true,
      useLocalModelForSimpleTasks: false,
      defaultProvider: 'anthropic',
      resolvedLocale: 'en',
      // a private field accidentally included by a buggy projection:
      mcpServers: [{ secret: 'should-be-stripped' }],
    });
    expect(parsed).not.toHaveProperty('mcpServers');
  });
});
