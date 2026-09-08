// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { settingsDict } from '@tepegoz/settings-ui';
import { WEB_CONTENT_DEFAULTS } from '@tepegoz/shared-types/web-content-defaults';
import { WebContentDefaultsCard } from './settings-developer-web-content';

const s = settingsDict.en;

afterEach(cleanup);

describe('WebContentDefaultsCard', () => {
  it('renders every default key and marks only the locked ones', () => {
    render(
      <I18nProvider locale="en">
        <WebContentDefaultsCard />
      </I18nProvider>,
    );

    for (const d of WEB_CONTENT_DEFAULTS) {
      expect(screen.getByText(d.key)).toBeTruthy();
    }
    const lockedCount = WEB_CONTENT_DEFAULTS.filter((d) => d.locked).length;
    expect(screen.getAllByText(s.webContentDefaultsLocked)).toHaveLength(lockedCount);
  });

  it('is read-only — no inputs or toggles', () => {
    render(
      <I18nProvider locale="en">
        <WebContentDefaultsCard />
      </I18nProvider>,
    );
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
