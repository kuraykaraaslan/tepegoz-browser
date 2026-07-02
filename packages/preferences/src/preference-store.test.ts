import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
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
