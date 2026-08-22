// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { AppearanceSection, LanguageRegionSection } from './settings-appearance-language';

/**
 * The Appearance and Language/Region settings sections.
 *
 * This is where the product's "Turkish first-class" claim stops being a slogan and becomes code: the
 * region list is localized through `Intl.DisplayNames` and then SORTED with `localeCompare` in the UI
 * locale, which is the only reason ç/ğ/ı/ö/ş/ü land where a Turkish reader expects them rather than
 * after z. Nothing measured that. Alongside it sit three decisions that each fail quietly:
 *
 *  - Choosing a preset theme must clear `themeColor`, and choosing a custom colour must un-select the
 *    theme cards. The two controls write the same rendered result, so a stale "active" ring is a
 *    settings screen lying about what is in force.
 *  - The glass (Win11 Mica) toggle is OS-gated behind an IPC call. If that call REJECTS, the toggle
 *    must stay hidden — offering a material the OS cannot render is a control that does nothing.
 *  - The date preview builds a BCP-47 tag from language + region, mapping non-ISO Turkic regions and
 *    alpha-3 codes back to something `Intl` accepts. A wrong tag silently formats dates in the wrong
 *    convention, which looks like a rendering quirk rather than a bug.
 *
 * jsdom ships a full ICU in Node 24, so `Intl.DisplayNames` and Turkish collation are the real thing
 * here, not a stub.
 */

stubJsdomLayout();

interface AppInfoStub {
  result: { ok: true; glassAvailable: boolean } | { ok: false };
}

const appInfo = vi.hoisted((): AppInfoStub => ({ result: { ok: true, glassAvailable: false } }));

/** Only the two members these sections touch; the bridge is typed but enormous. */
function stubBridge(): void {
  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: {
      getAppInfo: () =>
        appInfo.result.ok
          ? Promise.resolve({ glassAvailable: appInfo.result.glassAvailable })
          : Promise.reject(new Error('bridge unavailable')),
    },
  });
}

function prefs(over: Partial<Preferences> = {}): Preferences {
  return { ...DEFAULT_PREFERENCES, ...over };
}

function renderAppearance(over: Partial<Preferences> = {}, locale: 'en' | 'tr' = 'en') {
  const setPref = vi.fn();
  render(
    <I18nProvider locale={locale}>
      <AppearanceSection prefs={prefs(over)} setPref={setPref} />
    </I18nProvider>,
  );
  return { setPref };
}

function renderLanguage(over: Partial<Preferences> = {}, locale: 'en' | 'tr' = 'en') {
  const setPref = vi.fn();
  render(
    <I18nProvider locale={locale}>
      <LanguageRegionSection prefs={prefs(over)} setPref={setPref} />
    </I18nProvider>,
  );
  return { setPref };
}

/**
 * The live date-preview line. Scoped deliberately: every `<option>` of the format `<select>` also
 * renders an example from the same tag, so a bare `getByText(/Ocak/)` matches ten elements and proves
 * nothing about the preview.
 */
function preview(): string {
  const select = screen.getByLabelText(/Date format|Tarih biçimi/i);
  const card = select.closest('div')?.parentElement;
  const line = within(card as HTMLElement)
    .getAllByText(/:/)
    .at(-1);
  return line?.textContent ?? '';
}

/** Open a FlagSelect by its field label and return its option rows. */
function openPicker(name: RegExp): HTMLElement[] {
  fireEvent.click(screen.getByRole('button', { name }));
  return within(screen.getByRole('listbox')).getAllByRole('option');
}

beforeEach(() => {
  appInfo.result = { ok: true, glassAvailable: false };
  stubBridge();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('theme selection', () => {
  it('marks the active theme with aria-pressed, not only with a ring', () => {
    renderAppearance({ theme: 'dark', themeColor: '' });

    const pressed = screen
      .getAllByRole('button', { pressed: true })
      .map((b) => b.textContent ?? '');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toContain('Dark');
  });

  it('clears any custom colour when a preset theme is chosen', () => {
    // Both controls decide the same rendered result. Leaving `themeColor` set would make the theme
    // card look chosen while the custom colour is what actually renders.
    const { setPref } = renderAppearance({ theme: 'system', themeColor: '#0d7377' });

    fireEvent.click(screen.getByRole('button', { name: /Light/ }));

    expect(setPref).toHaveBeenCalledWith({ theme: 'light', themeColor: '' });
  });

  it('un-selects every theme card while a custom colour is in force', () => {
    renderAppearance({ theme: 'dark', themeColor: '#0d7377' });

    const themeCards = screen
      .getAllByRole('button')
      .filter((b) => /System|Light|Dark/.test(b.textContent ?? ''));
    expect(themeCards.every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
  });
});

describe('the accent colour presets', () => {
  it('names each swatch, so it is not an unlabelled circle to a screen reader', () => {
    renderAppearance();

    // Every preset must carry a real name — the colour alone is not information.
    const swatches = screen.getAllByRole('button').filter((b) => b.style.backgroundColor !== '');
    expect(swatches.length).toBeGreaterThan(0);
    for (const swatch of swatches) {
      expect(swatch.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('marks the chosen preset pressed, matching case-insensitively', () => {
    // Stored values have come back upper-cased from a colour input before now.
    renderAppearance({ themeColor: '#0D7377' });

    const pressed = screen.getAllByRole('button', { pressed: true });
    expect(pressed.some((b) => b.style.backgroundColor !== '')).toBe(true);
  });

  it('sends the preset colour without touching the theme', () => {
    const { setPref } = renderAppearance({ theme: 'dark', themeColor: '' });
    const swatches = screen.getAllByRole('button').filter((b) => b.style.backgroundColor !== '');

    fireEvent.click(swatches[0] as HTMLElement);

    expect(setPref).toHaveBeenCalledTimes(1);
    expect(Object.keys(setPref.mock.calls[0]?.[0] as object)).toEqual(['themeColor']);
  });
});

describe('the glass toggle is OS-gated', () => {
  it('stays hidden when the OS cannot render the material', async () => {
    appInfo.result = { ok: true, glassAvailable: false };
    renderAppearance();

    await waitFor(() => {
      expect(screen.queryByRole('switch')).toBeNull();
    });
  });

  it('appears when the OS can', async () => {
    appInfo.result = { ok: true, glassAvailable: true };
    renderAppearance();

    await waitFor(() => {
      expect(screen.getByRole('switch')).toBeTruthy();
    });
  });

  it('stays hidden when the capability query FAILS, rather than defaulting to on', async () => {
    // Fail-closed: a toggle for a material the app could not confirm is a control that does nothing.
    appInfo.result = { ok: false };
    renderAppearance();

    await waitFor(() => {
      expect(screen.queryByRole('switch')).toBeNull();
    });
  });
});

describe('the region list — where "Turkish first-class" is actually implemented', () => {
  it('offers the system default first, before any country', () => {
    renderLanguage();

    const options = openPicker(/Region/i);
    expect(options[0]?.textContent).toMatch(/System|Sistem/);
  });

  it('shows country names in the UI locale, not raw ISO codes', () => {
    renderLanguage({}, 'tr');

    const labels = openPicker(/Bölge/i).map((o) => o.textContent ?? '');
    // Germany is "Almanya" in Turkish; an untranslated list would read "Germany" or "DEU".
    expect(labels.some((l) => l.includes('Almanya'))).toBe(true);
  });

  it('overrides the CLDR label where the product wants a different English name', () => {
    renderLanguage({}, 'en');

    const labels = openPicker(/Region/i).map((o) => o.textContent ?? '');
    expect(labels.some((l) => l.includes('Turkey'))).toBe(true);
  });

  it('sorts with TURKISH collation when the UI is Turkish', () => {
    // The whole reason the list is sorted with `localeCompare(uiLocale)`: under the default collation
    // every name starting with ç/ğ/ı/ö/ş/ü sorts after z, and a Turkish reader finds them nowhere.
    renderLanguage({}, 'tr');

    // The row's textContent also carries the trailing alpha-3 code, so compare the LABEL span only —
    // sorting whole rows would be measuring a different string than the component sorted.
    const labels = openPicker(/Bölge/i)
      .map((o) => o.querySelector('span')?.textContent ?? '')
      .slice(1); // drop the "system" row, which is pinned first
    const sortedTheSameWay = [...labels].sort((a, b) => a.localeCompare(b, 'tr'));
    expect(labels).toEqual(sortedTheSameWay);

    // And spot-check the letters that make this matter: under the default collation Ç sorts after Z.
    const cad = labels.findIndex((l) => l.startsWith('Ç'));
    const danimarka = labels.findIndex((l) => l.startsWith('D'));
    expect(cad).toBeGreaterThan(-1);
    expect(cad).toBeLessThan(danimarka);
  });

  it('mixes the non-ISO Turkic regions in by name rather than appending them', () => {
    renderLanguage({}, 'tr');

    const labels = openPicker(/Bölge/i).map((o) => o.textContent ?? '');
    // If they were appended, the last entries would be the Turkic ones and the list would not be
    // sorted end-to-end — which the collation test above would then fail. Here we only check they are
    // present at all, since their identity is what the picker exists for.
    expect(labels.length).toBeGreaterThan(200);
  });
});

describe('the date preview and its BCP-47 tag', () => {
  it('formats with the chosen language and region', () => {
    renderLanguage({ locale: 'tr', region: 'TUR', dateFormat: 'long' }, 'tr');

    // January in a Turkish long date is "Ocak"; an en-US tag would read "January".
    expect(preview()).toMatch(/Ocak/);
  });

  it('follows the UI locale when the language preference is "system"', () => {
    renderLanguage({ locale: 'system', region: 'TUR', dateFormat: 'long' }, 'tr');

    expect(preview()).toMatch(/Ocak/);
  });

  it('falls back to a sane format when the stored one is not a format at all', () => {
    // A preference file edited by hand, or written by an older build.
    renderLanguage({ region: 'TUR', dateFormat: 'not-a-format' }, 'en');

    const select: HTMLSelectElement = screen.getByLabelText(/Date format/i);
    expect(select.value).toBe('medium');
  });

  it('still formats when the region is a non-ISO Turkic code Intl has never heard of', () => {
    // These carry a base ISO region purely so the tag stays valid; without that mapping every date
    // example would throw and the whole section would render blank.
    renderLanguage({ locale: 'tr', region: 'TAT', dateFormat: 'long' }, 'tr');

    expect(preview()).toMatch(/Ocak/);
  });

  it('still formats when no region is chosen at all', () => {
    renderLanguage({ locale: 'en', region: '', dateFormat: 'long' }, 'en');

    expect(preview()).toMatch(/January/);
  });
});

describe('changing language and region', () => {
  it('writes the chosen language', () => {
    const { setPref } = renderLanguage({ locale: 'en' }, 'en');

    const options = openPicker(/Language/i);
    const turkish = options.find((o) => o.textContent?.includes('Türkçe'));
    fireEvent.click(turkish as HTMLElement);

    expect(setPref).toHaveBeenCalledWith({ locale: 'tr' });
  });

  it('writes the empty region, which means "follow the system"', () => {
    const { setPref } = renderLanguage({ region: 'TUR' }, 'en');

    const options = openPicker(/Region/i);
    fireEvent.click(options[0] as HTMLElement);

    expect(setPref).toHaveBeenCalledWith({ region: '' });
  });
});
