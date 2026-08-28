import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyChromiumSwitches, readPersistedChromiumFlags } from './chromium-flags-boot';

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tepegoz-flags-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writePrefs(value: unknown): void {
  writeFileSync(join(dir, 'preferences.json'), JSON.stringify(value), 'utf8');
}

describe('readPersistedChromiumFlags', () => {
  it('returns {} when the file is missing', () => {
    expect(readPersistedChromiumFlags(dir)).toEqual({});
  });

  it('returns {} for a corrupt file', () => {
    writeFileSync(join(dir, 'preferences.json'), '{ not json', 'utf8');
    expect(readPersistedChromiumFlags(dir)).toEqual({});
  });

  it('returns {} when chromiumFlags is absent', () => {
    writePrefs({ theme: 'dark' });
    expect(readPersistedChromiumFlags(dir)).toEqual({});
  });

  it('reads a valid allowlisted override', () => {
    writePrefs({ chromiumFlags: { 'force-dark-mode': true, 'disable-gpu': false } });
    expect(readPersistedChromiumFlags(dir)).toEqual({
      'force-dark-mode': true,
      'disable-gpu': false,
    });
  });

  it('drops the whole override object if it contains an unknown (non-allowlisted) key', () => {
    writePrefs({ chromiumFlags: { 'force-dark-mode': true, 'no-sandbox': true } });
    expect(readPersistedChromiumFlags(dir)).toEqual({});
  });
});

describe('applyChromiumSwitches', () => {
  function fakeApp(userDataDir: string) {
    const calls: Array<[string, string | undefined]> = [];
    return {
      calls,
      getPath: (name: string) => (name === 'userData' ? userDataDir : ''),
      commandLine: {
        appendSwitch: (name: string, value?: string) => calls.push([name, value]),
      },
    };
  }

  it('always applies the keep-rendering baseline', () => {
    const app = fakeApp(dir);
    applyChromiumSwitches(app as unknown as Parameters<typeof applyChromiumSwitches>[0]);
    expect(app.calls).toContainEqual(['disable-renderer-backgrounding', undefined]);
    expect(app.calls).toContainEqual(['disable-features', 'CalculateNativeWinOcclusion']);
  });

  it('adds enabled user flags, merged into a single enable-features append', () => {
    writePrefs({ chromiumFlags: { 'parallel-downloading': true, 'force-dark-mode': true } });
    const app = fakeApp(dir);
    applyChromiumSwitches(app as unknown as Parameters<typeof applyChromiumSwitches>[0]);
    expect(app.calls).toContainEqual(['force-dark-mode', undefined]);
    expect(app.calls).toContainEqual(['enable-features', 'ParallelDownloading']);
    expect(app.calls.filter(([name]) => name === 'enable-features')).toHaveLength(1);
  });

  it('applies only the baseline when a bad override object is rejected', () => {
    writePrefs({ chromiumFlags: { 'no-sandbox': true } });
    const app = fakeApp(dir);
    applyChromiumSwitches(app as unknown as Parameters<typeof applyChromiumSwitches>[0]);
    expect(app.calls.some(([name]) => name === 'no-sandbox')).toBe(false);
    expect(app.calls).toContainEqual(['disable-renderer-backgrounding', undefined]);
  });
});
