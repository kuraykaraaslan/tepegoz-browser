import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Fuses are flipped in the packaged binary, so they are the only hardening layer that still holds when
 * an attacker controls the command line or the environment — `webPreferences` cannot help there.
 * Nothing else in the test suite reads `electron-builder.yml`, so without this a fuse could be dropped
 * or flipped and every other gate would stay green while shipped builds quietly lost the protection.
 *
 * Verified end-to-end once, not assumed: the wire was read back out of a packaged `Tepegöz.exe` (all
 * seven land) and the binary was launched, with CDP confirming the chrome renders at
 * `app://chrome/index.html`. This test guards the config that produces that, which is the part a later
 * edit can change silently.
 */
const REQUIRED: Record<string, boolean> = {
  // ELECTRON_RUN_AS_NODE would turn the shipped browser into a Node interpreter with the app's identity.
  runAsNode: false,
  enableCookieEncryption: true,
  // Code-injection channels into the main process.
  enableNodeOptionsEnvironmentVariable: false,
  enableNodeCliInspectArguments: false,
  // The pair that makes tampering with the installed app fail closed rather than silently succeed:
  // `onlyLoadAppFromAsar` alone would still happily run an unvalidated asar.
  enableEmbeddedAsarIntegrityValidation: true,
  onlyLoadAppFromAsar: true,
  // The one fuse left OPEN. Closing it blanks the packaged chrome, because the chrome is loaded over
  // file:// from inside the asar. Asserted at `true` rather than omitted so the value stays a reviewed
  // decision with a reason in electron-builder.yml, instead of a gap nothing looks at.
  grantFileProtocolExtraPrivileges: true,
};

describe('electron-builder fuses', () => {
  const yml = readFileSync(join(__dirname, '../../electron-builder.yml'), 'utf8');

  /**
   * The `electronFuses:` block as `{ fuse: 'true' | 'false' }`. Parsed line by line rather than with a
   * regex, so a stray escape in the test itself cannot quietly make every assertion vacuous.
   */
  const declared = ((): Record<string, string> => {
    const lines = yml.split('\n').map((line) => line.replace(/\r$/, ''));
    const start = lines.findIndex((line) => line.trimEnd() === 'electronFuses:');
    if (start === -1) return {};
    const out: Record<string, string> = {};
    for (const line of lines.slice(start + 1)) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;
      if (!line.startsWith(' ')) break; // a dedent ends the block
      const [key, ...rest] = trimmed.split(':');
      const value = rest.join(':').trim();
      if (key !== undefined && (value === 'true' || value === 'false')) out[key] = value;
    }
    return out;
  })();

  it('declares an electronFuses block', () => {
    expect(Object.keys(declared).length).toBeGreaterThan(0);
  });

  for (const [fuse, expected] of Object.entries(REQUIRED)) {
    it(`sets ${fuse} to ${String(expected)}`, () => {
      expect(declared[fuse], `${fuse} is not declared in electron-builder.yml`).toBeDefined();
      expect(declared[fuse]).toBe(String(expected));
    });
  }

  it('declares no fuse beyond the reviewed set', () => {
    expect(Object.keys(declared).sort()).toEqual(Object.keys(REQUIRED).sort());
  });
});
