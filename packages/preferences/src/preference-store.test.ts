import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import PreferenceStore from './preference-store';
import { DEFAULT_PREFERENCES } from './preferences.model';

let dir: string;
let filePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tepegoz-prefs-'));
  filePath = join(dir, 'preferences.json');
  PreferenceStore.reset();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('PreferenceStore', () => {
  it('returns defaults when no file exists', () => {
    PreferenceStore.init({ filePath });
    expect(PreferenceStore.getAll()).toEqual(DEFAULT_PREFERENCES);
    expect(PreferenceStore.getAll().onboardingCompleted).toBe(false);
  });

  it('treats existing profiles without an onboarding sentinel as already completed', () => {
    writeFileSync(filePath, JSON.stringify({ locale: 'tr' }), 'utf8');
    PreferenceStore.init({ filePath });
    expect(PreferenceStore.getAll().locale).toBe('tr');
    expect(PreferenceStore.getAll().onboardingCompleted).toBe(true);
  });

  it('merges a partial update without clobbering other keys', () => {
    PreferenceStore.init({ filePath });
    const next = PreferenceStore.update({ theme: 'dark', useLocalModelForSimpleTasks: true });
    expect(next.theme).toBe('dark');
    expect(next.useLocalModelForSimpleTasks).toBe(true);
    expect(next.telemetryEnabled).toBe(false); // untouched default
  });

  it('persists across re-init', () => {
    PreferenceStore.init({ filePath });
    PreferenceStore.update({ locale: 'tr' });
    PreferenceStore.reset();
    PreferenceStore.init({ filePath });
    expect(PreferenceStore.getAll().locale).toBe('tr');
  });

  it('falls back to defaults on a corrupt patch value', () => {
    PreferenceStore.init({ filePath });
    expect(() => PreferenceStore.update({ theme: 'neon' as unknown as 'dark' })).toThrow();
    // store unchanged after the rejected update
    expect(PreferenceStore.getAll().theme).toBe('system');
  });

  it('defaults httpsOnlyOnTunnel to true for an old file without the key', () => {
    writeFileSync(filePath, JSON.stringify({ locale: 'tr' }), 'utf8');
    PreferenceStore.init({ filePath });
    expect(PreferenceStore.getAll().httpsOnlyOnTunnel).toBe(true);
  });

  it('round-trips httpsOnlyOnTunnel=false across re-init', () => {
    PreferenceStore.init({ filePath });
    PreferenceStore.update({ httpsOnlyOnTunnel: false });
    PreferenceStore.reset();
    PreferenceStore.init({ filePath });
    expect(PreferenceStore.getAll().httpsOnlyOnTunnel).toBe(false);
  });

  it('rejects a non-boolean httpsOnlyOnTunnel patch and leaves the store unchanged', () => {
    PreferenceStore.init({ filePath });
    expect(() =>
      PreferenceStore.update({ httpsOnlyOnTunnel: 'yes' as unknown as boolean }),
    ).toThrow();
    expect(PreferenceStore.getAll().httpsOnlyOnTunnel).toBe(true);
  });

  it('falls back to the default when the stored httpsOnlyOnTunnel is corrupt', () => {
    writeFileSync(filePath, JSON.stringify({ httpsOnlyOnTunnel: 'nope' }), 'utf8');
    PreferenceStore.init({ filePath });
    expect(PreferenceStore.getAll().httpsOnlyOnTunnel).toBe(true);
  });

  it('defaults startupTabs to restore for an old file, and round-trips newtab', () => {
    writeFileSync(filePath, JSON.stringify({ locale: 'tr' }), 'utf8');
    PreferenceStore.init({ filePath });
    expect(PreferenceStore.getAll().startupTabs).toBe('restore');
    PreferenceStore.update({ startupTabs: 'newtab' });
    PreferenceStore.reset();
    PreferenceStore.init({ filePath });
    expect(PreferenceStore.getAll().startupTabs).toBe('newtab');
  });

  it('rejects an unknown startupTabs value and falls back when the stored one is corrupt', () => {
    PreferenceStore.init({ filePath });
    expect(() =>
      PreferenceStore.update({ startupTabs: 'pages' as unknown as 'restore' }),
    ).toThrow();
    expect(PreferenceStore.getAll().startupTabs).toBe('restore');
    PreferenceStore.reset();
    writeFileSync(filePath, JSON.stringify({ startupTabs: 'nope' }), 'utf8');
    PreferenceStore.init({ filePath });
    expect(PreferenceStore.getAll().startupTabs).toBe('restore');
  });

  it('defaults confirmCloseMultiTab to off for an old file, and round-trips true', () => {
    writeFileSync(filePath, JSON.stringify({ locale: 'tr' }), 'utf8');
    PreferenceStore.init({ filePath });
    expect(PreferenceStore.getAll().confirmCloseMultiTab).toBe(false);
    PreferenceStore.update({ confirmCloseMultiTab: true });
    PreferenceStore.reset();
    PreferenceStore.init({ filePath });
    expect(PreferenceStore.getAll().confirmCloseMultiTab).toBe(true);
  });

  it('rejects a non-boolean confirmCloseMultiTab patch', () => {
    PreferenceStore.init({ filePath });
    expect(() =>
      PreferenceStore.update({ confirmCloseMultiTab: 'yes' as unknown as boolean }),
    ).toThrow();
    expect(PreferenceStore.getAll().confirmCloseMultiTab).toBe(false);
  });

  it('defaults mcpServers to [] and round-trips a valid stdio server', () => {
    PreferenceStore.init({ filePath });
    expect(PreferenceStore.getAll().mcpServers).toEqual([]);
    const next = PreferenceStore.update({
      mcpServers: [
        { id: 'files', label: 'Files', transport: 'stdio', command: 'srv', enabled: true },
      ],
    });
    expect(next.mcpServers[0]?.command).toBe('srv');
  });

  it('round-trips all six brokered site-permission capabilities, not just notifications', () => {
    // Regression: the `sitePermissions` value schema once declared only notifications + clipboard
    // read/write, so `z.object` silently stripped camera/microphone/geolocation on every write —
    // Settings and the consent prompt's "Remember" checkbox both discarded those decisions.
    PreferenceStore.init({ filePath });
    const origin = 'https://example.com';
    const next = PreferenceStore.update({
      sitePermissions: {
        [origin]: {
          notifications: 'allowed',
          clipboardRead: 'denied',
          clipboardWrite: 'prompt',
          camera: 'allowed',
          microphone: 'denied',
          geolocation: 'allowed',
        },
      },
    });
    expect(next.sitePermissions[origin]).toEqual({
      notifications: 'allowed',
      clipboardRead: 'denied',
      clipboardWrite: 'prompt',
      camera: 'allowed',
      microphone: 'denied',
      geolocation: 'allowed',
    });
  });

  it('rejects an stdio MCP server with no command and an invalid transport', () => {
    PreferenceStore.init({ filePath });
    expect(() =>
      PreferenceStore.update({
        mcpServers: [{ id: 'x', label: 'X', transport: 'stdio', enabled: true }],
      }),
    ).toThrow();
    expect(() =>
      PreferenceStore.update({
        mcpServers: [
          {
            id: 'x',
            label: 'X',
            transport: 'ws' as unknown as 'stdio',
            command: 'c',
            enabled: true,
          },
        ],
      }),
    ).toThrow();
  });
});
