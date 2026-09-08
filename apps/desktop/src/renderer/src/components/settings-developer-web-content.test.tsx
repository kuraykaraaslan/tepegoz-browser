// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { settingsDict } from '@tepegoz/settings-ui';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import {
  EDITABLE_WEB_CONTENT_KEYS,
  LOCKED_WEB_CONTENT_KEYS,
} from '@tepegoz/shared-types/web-content-defaults';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { WebContentDefaultsCard } from './settings-developer-web-content';

const s = settingsDict.en;

function renderCard(over: Partial<Preferences> = {}) {
  const onUpdatePrefs = vi.fn<(patch: Partial<Preferences>) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const card = (o: Partial<Preferences>) => (
    <I18nProvider locale="en">
      <WebContentDefaultsCard
        prefs={{ ...DEFAULT_PREFERENCES, ...o }}
        onUpdatePrefs={onUpdatePrefs}
      />
    </I18nProvider>
  );
  const view = render(card(over));
  return { onUpdatePrefs, rerender: (o: Partial<Preferences>) => view.rerender(card(o)) };
}

afterEach(cleanup);

describe('WebContentDefaultsCard', () => {
  it('renders a locked badge for each isolation key and a toggle for each editable key', () => {
    renderCard();
    expect(screen.getAllByText(s.webContentDefaultsLocked)).toHaveLength(LOCKED_WEB_CONTENT_KEYS.length);
    expect(screen.getAllByRole('switch')).toHaveLength(EDITABLE_WEB_CONTENT_KEYS.length);
    for (const key of [...LOCKED_WEB_CONTENT_KEYS, ...EDITABLE_WEB_CONTENT_KEYS]) {
      expect(screen.getByText(key)).toBeTruthy();
    }
  });

  it('writes the webContentDefaults preference when an editable toggle is flipped', async () => {
    const { onUpdatePrefs } = renderCard();
    // `plugins` is the first editable row; it defaults to true → flipping turns it off.
    fireEvent.click(screen.getAllByRole('switch')[0]!);
    await waitFor(() => expect(onUpdatePrefs).toHaveBeenCalledTimes(1));
    expect(onUpdatePrefs.mock.calls[0]![0]).toEqual({
      webContentDefaults: { plugins: false, backgroundThrottling: false },
    });
  });

  it('shows the reload hint once the selection diverges from what the window booted with', () => {
    const { rerender } = renderCard();
    expect(screen.queryByText(s.webContentDefaultsReloadHint)).toBeNull();
    // A later prefs push (this window's own save, or another window's) with a changed value.
    rerender({ webContentDefaults: { plugins: false, backgroundThrottling: false } });
    expect(screen.getByText(s.webContentDefaultsReloadHint)).toBeTruthy();
  });
});
