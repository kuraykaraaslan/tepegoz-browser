import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectBrowserProfiles, parseIniSections } from './browser-profiles';

let home: string;

function write(relative: string, contents: string): void {
  const file = join(home, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

const winEnv = (): NodeJS.ProcessEnv => ({
  LOCALAPPDATA: join(home, 'AppData', 'Local'),
  APPDATA: join(home, 'AppData', 'Roaming'),
});

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'tepegoz-profiles-'));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('detectBrowserProfiles', () => {
  it('finds every Chromium profile that actually has a Bookmarks file, and names it', () => {
    write('AppData/Local/Google/Chrome/User Data/Default/Bookmarks', '{}');
    write('AppData/Local/Google/Chrome/User Data/Profile 1/Bookmarks', '{}');
    // A profile listed in Local State with no Bookmarks file: offering it would be offering an import
    // that cannot run, so the file on disk is the test and Local State only supplies the pretty name.
    write(
      'AppData/Local/Google/Chrome/User Data/Local State',
      JSON.stringify({
        profile: {
          info_cache: { Default: { name: 'Kuray' }, 'Profile 1': { name: 'İş' }, 'Profile 9': {} },
        },
      }),
    );

    const found = detectBrowserProfiles({ platform: 'win32', home, env: winEnv() });
    expect(found.map((p) => `${p.browserLabel}/${p.profileName}`).sort()).toEqual([
      'Chrome/Kuray',
      'Chrome/İş',
    ]);
    expect(found.every((p) => p.format === 'chromium-json' && p.source === 'chrome')).toBe(true);
  });

  it('falls back to the directory name when Local State is missing or corrupt', () => {
    write('AppData/Local/Microsoft/Edge/User Data/Profile 3/Bookmarks', '{}');
    write('AppData/Local/Microsoft/Edge/User Data/Local State', 'not json');
    const found = detectBrowserProfiles({ platform: 'win32', home, env: winEnv() });
    expect(found.map((p) => [p.source, p.profileName])).toEqual([['edge', 'Profile 3']]);
  });

  it('reads Firefox profiles.ini, relative and absolute alike', () => {
    const away = join(home, 'elsewhere', 'moved-profile');
    mkdirSync(away, { recursive: true });
    writeFileSync(join(away, 'places.sqlite'), '');
    write('AppData/Roaming/Mozilla/Firefox/Profiles/abc.default-release/places.sqlite', '');
    write(
      'AppData/Roaming/Mozilla/Firefox/profiles.ini',
      [
        '[Install4F96D1932A9F858E]',
        'Default=Profiles/abc.default-release',
        '',
        '[Profile0]',
        'Name=default-release',
        'IsRelative=1',
        'Path=Profiles/abc.default-release',
        '',
        '[Profile1]',
        'Name=Moved',
        'IsRelative=0',
        `Path=${away}`,
        '',
        '[Profile2]',
        'Name=Deleted by hand',
        'IsRelative=1',
        'Path=Profiles/gone.default',
      ].join('\n'),
    );

    const found = detectBrowserProfiles({ platform: 'win32', home, env: winEnv() });
    // The `[Install…]` section is not a profile, and a profile whose directory is gone is not offered.
    expect(found.map((p) => p.profileName).sort()).toEqual(['Moved', 'default-release']);
    expect(found.every((p) => p.format === 'firefox-places' && p.source === 'firefox')).toBe(true);
  });

  it('knows the macOS and Linux layouts, not just the Windows one', () => {
    write('Library/Application Support/BraveSoftware/Brave-Browser/Default/Bookmarks', '{}');
    write('.config/google-chrome/Default/Bookmarks', '{}');

    expect(detectBrowserProfiles({ platform: 'darwin', home, env: {} }).map((p) => p.source)).toEqual(
      ['brave'],
    );
    expect(detectBrowserProfiles({ platform: 'linux', home, env: {} }).map((p) => p.source)).toEqual([
      'chrome',
    ]);
  });

  it('returns nothing — not an error — when no browser is installed', () => {
    expect(detectBrowserProfiles({ platform: 'win32', home, env: winEnv() })).toEqual([]);
  });

  it('hands the renderer a stable id that is not the path', () => {
    write('AppData/Local/Google/Chrome/User Data/Default/Bookmarks', '{}');
    const first = detectBrowserProfiles({ platform: 'win32', home, env: winEnv() })[0]!;
    const second = detectBrowserProfiles({ platform: 'win32', home, env: winEnv() })[0]!;
    // Stable, so the renderer can name the profile it picked; opaque, so it cannot name a FILE. The
    // path also carries the user's account name, which the untrusted side has no reason to hold.
    expect(first.id).toBe(second.id);
    expect(first.id.startsWith('chrome:')).toBe(true);
    expect(first.id).not.toContain(home);
    expect(first.id).not.toContain('Bookmarks');
  });

  it('offers the profile in daily use first', () => {
    write('AppData/Local/Google/Chrome/User Data/Old/Bookmarks', '{}');
    write('AppData/Local/Google/Chrome/User Data/Fresh/Bookmarks', '{}');
    // Set the times explicitly: two files written microseconds apart can share an mtime, and a test
    // that passes on filesystem timing is a test that fails on someone else's machine.
    const old = new Date(Date.now() - 86_400_000);
    utimesSync(join(home, 'AppData/Local/Google/Chrome/User Data/Old/Bookmarks'), old, old);
    const found = detectBrowserProfiles({ platform: 'win32', home, env: winEnv() });
    expect(found[0]!.profileName).toBe('Fresh');
  });
});

describe('parseIniSections', () => {
  it('parses the shape profiles.ini actually has', () => {
    const sections = parseIniSections('# c\n[Profile0]\nName=A\nIsRelative=1\nPath=p\n\n[Profile1]\nname=B\n');
    expect(sections.map((s) => s.name)).toEqual(['Profile0', 'Profile1']);
    expect(sections[0]!.values.get('isrelative')).toBe('1');
    // Firefox has written both `Name` and `name` across versions; one lookup has to find both.
    expect(sections[1]!.values.get('name')).toBe('B');
  });
});
