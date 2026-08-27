import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `resolveSurfaceTheme`'s runtime behaviour. `surface-theme.test.ts` (its sibling) checks the two
 * hard-mirrored token constants against `tokens.css` by reading the source as text — deliberately not
 * importing the module, which pulls in `electron`. This file DOES import it, behind mocks, to cover
 * the branch logic: custom hex wins; else the mode token; `system` follows the OS.
 */

const prefs = vi.hoisted(() => ({ value: { theme: 'system', themeColor: '' } }));
const os = vi.hoisted(() => ({ dark: false }));

vi.mock('@tepegoz/preferences', () => ({ default: { getAll: () => prefs.value } }));
vi.mock('electron', () => ({
  nativeTheme: {
    get shouldUseDarkColors() {
      return os.dark;
    },
  },
}));

const { resolveSurfaceTheme } = await import('./surface-theme');

beforeEach(() => {
  prefs.value = { theme: 'system', themeColor: '' };
  os.dark = false;
});

describe('resolveSurfaceTheme', () => {
  it('a valid custom hex colour IS the surface, and is forwarded verbatim', () => {
    prefs.value = { theme: 'light', themeColor: '#7C3AED' };
    expect(resolveSurfaceTheme()).toEqual({
      color: '#7C3AED',
      theme: 'light',
      themeColor: '#7C3AED',
    });
  });

  it('ignores a malformed themeColor and falls back to the mode token', () => {
    prefs.value = { theme: 'light', themeColor: 'purple' };
    expect(resolveSurfaceTheme().color).toBe('#ffffff');
  });

  it('light mode → the light brand surface', () => {
    prefs.value = { theme: 'light', themeColor: '' };
    expect(resolveSurfaceTheme().color).toBe('#ffffff');
  });

  it('dark mode → the dark brand surface', () => {
    prefs.value = { theme: 'dark', themeColor: '' };
    expect(resolveSurfaceTheme().color).toBe('#0c2135');
  });

  it('system mode follows the OS: light when the OS is light, dark when it is dark', () => {
    os.dark = false;
    expect(resolveSurfaceTheme().color).toBe('#ffffff');
    os.dark = true;
    expect(resolveSurfaceTheme().color).toBe('#0c2135');
  });
});
