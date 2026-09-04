// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { settingsDict } from '@tepegoz/settings-ui';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { generalAndAiSections } from './SettingsPage-sections-general';
import type { SettingsSectionsCtx } from './SettingsPage-sections';

/**
 * `generalAndAiSections` is a pure builder — it turns the settings context into `SettingsSection`
 * descriptors whose `content` is live JSX. The bindings inside that JSX (here: the master
 * notifications toggle) never execute unless the descriptor's content is actually rendered, so this
 * mounts one section's content and drives it.
 */

const s = settingsDict.en;

function ctx(over: Partial<Preferences> = {}): { ctx: SettingsSectionsCtx; setPref: ReturnType<typeof vi.fn> } {
  const setPref = vi.fn();
  return {
    setPref,
    ctx: {
      s,
      prefs: { ...DEFAULT_PREFERENCES, ...over },
      status: {},
      setPref,
      notify: vi.fn(),
    } as unknown as SettingsSectionsCtx,
  };
}

afterEach(cleanup);

describe('generalAndAiSections', () => {
  it('the notifications section toggle writes the master preference', () => {
    const { ctx: c, setPref } = ctx({ notificationsEnabled: false });
    const section = generalAndAiSections(c).find((sec) => sec.id === 'notifications');
    expect(section).toBeTruthy();

    render(<I18nProvider locale="en">{section!.content}</I18nProvider>);
    fireEvent.click(screen.getByRole('switch'));
    expect(setPref).toHaveBeenCalledWith({ notificationsEnabled: true });
  });
});
