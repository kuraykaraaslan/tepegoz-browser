// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import { SELECTABLE_AGENT_AUTONOMY_LEVELS } from '@tepegoz/shared-types';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { AgentControlsSection } from './settings-agent-controls';

/**
 * Settings → Agent controls. The load-bearing bit: `dangerous` is a reserved level that main resolves
 * to `ask`, so the screen must render `ask` selected for a stored/doctored `dangerous` — showing it as
 * a distinct choice would advertise a permission level that does not exist. Plus: the autonomy and
 * effort radios and the strict-guard toggle each write their preference.
 */

function renderSection(over: Partial<Preferences> = {}) {
  const setPref = vi.fn();
  render(
    <I18nProvider locale="en">
      <AgentControlsSection prefs={{ ...DEFAULT_PREFERENCES, ...over }} setPref={setPref} />
    </I18nProvider>,
  );
  return { setPref };
}

const autonomyRadios = () =>
  screen.getAllByRole<HTMLInputElement>('radio').filter((r) => r.getAttribute('name') === 'agent-autonomy');

afterEach(cleanup);

describe('AgentControlsSection', () => {
  it('offers exactly the selectable autonomy levels', () => {
    renderSection();
    expect(autonomyRadios()).toHaveLength(SELECTABLE_AGENT_AUTONOMY_LEVELS.length);
  });

  it('writes the chosen autonomy level', () => {
    const { setPref } = renderSection({ agentAutonomy: 'ask' });
    const radios = autonomyRadios();
    fireEvent.click(radios[radios.length - 1]!); // 'auto', the last selectable level
    expect(setPref).toHaveBeenCalledWith({ agentAutonomy: 'auto' });
  });

  it('renders "ask" selected for a stored `dangerous` value (main resolves it to ask)', () => {
    renderSection({ agentAutonomy: 'dangerous' as Preferences['agentAutonomy'] });
    const [ask] = autonomyRadios();
    expect(ask!.checked).toBe(true);
  });

  it('writes the strict-guard toggle', () => {
    const { setPref } = renderSection({ agentStrictGuard: false });
    fireEvent.click(screen.getByRole('switch'));
    expect(setPref).toHaveBeenCalledWith({ agentStrictGuard: true });
  });
});
