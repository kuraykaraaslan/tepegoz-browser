import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `typoCss` — the page stylesheet for the typo underliner, with its one CSS custom property
 * (`--tepegoz-typo-underline`) resolved from the user's theme. Pinned: a valid custom `themeColor`
 * drives a shade of itself (lightened when the colour is dark, darkened when light); an unset /
 * malformed `themeColor` falls back to the built-in primary, picking the dark or light one from
 * `theme` (and, under `system`, from the OS). The returned string always carries the `:root` var line
 * then the static rules.
 */

const prefs = vi.hoisted(() => ({
  getAll: vi.fn((): { theme: string; themeColor: string } => ({
    theme: 'light',
    themeColor: 'auto',
  })),
}));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));

const native = vi.hoisted(() => ({ shouldUseDarkColors: false }));
vi.mock('electron', () => ({ nativeTheme: native }));

const { typoCss } = await import('./typo-page-injector-theme.electron');

/** Pull the resolved value of the underline custom property out of the returned stylesheet. */
function underline(css: string): string {
  return /--tepegoz-typo-underline:\s*([^;]+);/.exec(css)?.[1]?.trim() ?? '';
}

const LIGHT_PRIMARY = '#06AEC4';
const DARK_PRIMARY = '#22C6DA';

beforeEach(() => {
  prefs.getAll.mockReset().mockReturnValue({ theme: 'light', themeColor: 'auto' });
  native.shouldUseDarkColors = false;
});

describe('a valid custom themeColor', () => {
  it('lightens a dark colour toward white (mix 0.38)', () => {
    prefs.getAll.mockReturnValue({ theme: 'light', themeColor: '#000000' });
    // target 255, p 0.38 → round(255 * 0.38) = 97 = 0x61 on every channel
    expect(underline(typoCss())).toBe('#616161');
  });

  it('darkens a light colour toward black (mix 0.3)', () => {
    prefs.getAll.mockReturnValue({ theme: 'dark', themeColor: '#ffffff' });
    // target 0, p 0.3 → round(255 - 255 * 0.3) = round(178.5) = 179 = 0xb3
    expect(underline(typoCss())).toBe('#b3b3b3');
  });

  it('accepts upper-case hex', () => {
    prefs.getAll.mockReturnValue({ theme: 'light', themeColor: '#0A0A0A' });
    expect(underline(typoCss())).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('no / malformed themeColor → built-in primary', () => {
  it('theme "dark" → the dark primary', () => {
    prefs.getAll.mockReturnValue({ theme: 'dark', themeColor: 'auto' });
    expect(underline(typoCss())).toBe(DARK_PRIMARY);
  });

  it('theme "light" → the light primary', () => {
    prefs.getAll.mockReturnValue({ theme: 'light', themeColor: '' });
    expect(underline(typoCss())).toBe(LIGHT_PRIMARY);
  });

  it('theme "system" follows the OS: dark', () => {
    prefs.getAll.mockReturnValue({ theme: 'system', themeColor: 'not-a-hex' });
    native.shouldUseDarkColors = true;
    expect(underline(typoCss())).toBe(DARK_PRIMARY);
  });

  it('theme "system" follows the OS: light', () => {
    prefs.getAll.mockReturnValue({ theme: 'system', themeColor: '#12345' }); // 5 digits, invalid
    native.shouldUseDarkColors = false;
    expect(underline(typoCss())).toBe(LIGHT_PRIMARY);
  });
});

describe('shape', () => {
  it('is the :root var line followed by the static rules', () => {
    const css = typoCss();
    expect(css.startsWith(':root { --tepegoz-typo-underline: ')).toBe(true);
    expect(css).toContain('.tepegoz-typo-word');
    expect(css).toContain('.tepegoz-typo-popover');
  });
});
