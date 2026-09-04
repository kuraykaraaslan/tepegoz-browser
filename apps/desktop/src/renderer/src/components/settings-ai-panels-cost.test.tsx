// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { settingsDict } from '@tepegoz/settings-ui';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import type { AIAdaptor, Preferences } from '@tepegoz/desktop-ipc';
import { LocalActionsSection, TokenBudgetSection } from './settings-ai-panels-cost';

/**
 * Settings → Cost & performance. LocalActionsSection: the master local-model toggle writes both the
 * flag and the localProvider mode; a per-action "run on device" toggle is disabled while the master
 * is off; a mechanical action (localCapable false) shows "Native · no AI" and no toggle.
 * TokenBudgetSection: 0 means unlimited (no progress bar), a quota draws the bar with the right
 * percentage and threshold colour, and the quota input is clamped to a non-negative integer.
 */

const s = settingsDict.en;

const listAiAdaptors = vi.fn();
const getTokenUsage = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  listAiAdaptors.mockResolvedValue([]);
  getTokenUsage.mockResolvedValue({ lifetimeTokens: 0 });
  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: { listAiAdaptors, getTokenUsage },
  });
});
afterEach(cleanup);

function adaptor(over: Partial<AIAdaptor> = {}): AIAdaptor {
  return {
    id: 'browser',
    title: 'Browser',
    kind: 'system',
    actions: [
      {
        id: 'browser.click',
        description: '',
        dangerClass: 'state_changing',
        source: 'browser',
        requiresIdempotencyKey: false,
        aiTask: 'none',
        localCapable: true,
        adaptorId: 'browser',
      },
      {
        id: 'browser.readDom',
        description: '',
        dangerClass: 'read',
        source: 'browser',
        requiresIdempotencyKey: false,
        aiTask: 'none',
        localCapable: false,
        adaptorId: 'browser',
      },
    ],
    ...over,
  } as AIAdaptor;
}

function renderLocal(over: Partial<Preferences> = {}) {
  const setPref = vi.fn();
  render(
    <I18nProvider locale="en">
      <LocalActionsSection prefs={{ ...DEFAULT_PREFERENCES, ...over }} setPref={setPref} />
    </I18nProvider>,
  );
  return { setPref };
}

function renderBudget(over: Partial<Preferences> = {}) {
  const setPref = vi.fn();
  render(
    <I18nProvider locale="en">
      <TokenBudgetSection prefs={{ ...DEFAULT_PREFERENCES, ...over }} setPref={setPref} />
    </I18nProvider>,
  );
  return { setPref };
}

describe('LocalActionsSection', () => {
  it('the master toggle writes the flag and the localProvider mode together', () => {
    const { setPref } = renderLocal({ useLocalModelForSimpleTasks: false });
    fireEvent.click(screen.getByRole('switch', { name: new RegExp(s.localModel, 'i') }));
    const patch = setPref.mock.calls[0]![0] as Partial<Preferences>;
    expect(patch.useLocalModelForSimpleTasks).toBe(true);
    expect(patch.localProvider?.mode).toBe('simple');
  });

  it('shows the empty state when no adaptors are reported', async () => {
    renderLocal();
    await waitFor(() => expect(listAiAdaptors).toHaveBeenCalled());
    expect(screen.getByText(s.noActionsYet)).toBeTruthy();
  });

  it('falls back to the empty state when listing adaptors rejects', async () => {
    listAiAdaptors.mockRejectedValueOnce(new Error('registry down'));
    renderLocal();
    await waitFor(() => expect(listAiAdaptors).toHaveBeenCalled());
    expect(screen.getByText(s.noActionsYet)).toBeTruthy();
  });

  it('offers a per-action toggle for a local-capable action and "Native · no AI" for a mechanical one', async () => {
    listAiAdaptors.mockResolvedValue([adaptor()]);
    renderLocal({ useLocalModelForSimpleTasks: true });
    await screen.findByText('browser.click');

    expect(screen.getByRole('switch', { name: s.runLocallyLabel })).toBeTruthy();
    expect(screen.getByText(s.nativeNoAiLabel)).toBeTruthy();
  });

  it('disables the per-action toggle while the master local-model switch is off', async () => {
    listAiAdaptors.mockResolvedValue([adaptor()]);
    renderLocal({ useLocalModelForSimpleTasks: false });
    await screen.findByText('browser.click');
    expect(screen.getByRole<HTMLInputElement>('switch', { name: s.runLocallyLabel }).disabled).toBe(true);
  });

  it('writes a per-action override', async () => {
    listAiAdaptors.mockResolvedValue([adaptor()]);
    const { setPref } = renderLocal({ useLocalModelForSimpleTasks: true });
    await screen.findByText('browser.click');
    fireEvent.click(screen.getByRole('switch', { name: s.runLocallyLabel }));
    expect(setPref).toHaveBeenCalledWith({ localActions: { 'browser.click': false } });
  });
});

describe('TokenBudgetSection', () => {
  it('draws no progress bar when the quota is 0 (unlimited)', async () => {
    getTokenUsage.mockResolvedValue({ lifetimeTokens: 500 });
    renderBudget({ agentTokenQuota: 0 });
    await waitFor(() => expect(getTokenUsage).toHaveBeenCalled());
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('shows no usage figure or bar when getTokenUsage rejects', async () => {
    getTokenUsage.mockRejectedValueOnce(new Error('ledger offline'));
    renderBudget({ agentTokenQuota: 1000 });
    await waitFor(() => expect(getTokenUsage).toHaveBeenCalled());
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('draws the bar at the used/quota percentage when capped', async () => {
    getTokenUsage.mockResolvedValue({ lifetimeTokens: 900 });
    renderBudget({ agentTokenQuota: 1000 });
    const bar = await screen.findByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('90');
  });

  it('clamps the percentage at 100 when usage exceeds the cap', async () => {
    getTokenUsage.mockResolvedValue({ lifetimeTokens: 5000 });
    renderBudget({ agentTokenQuota: 1000 });
    const bar = await screen.findByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
  });

  it('normalises a typed quota to a non-negative integer on blur', () => {
    const { setPref } = renderBudget({ agentTokenQuota: 0 });
    const input = screen.getByLabelText(s.tokenBudget.label);
    fireEvent.change(input, { target: { value: '-42.9' } });
    fireEvent.blur(input);
    expect(setPref).toHaveBeenCalledWith({ agentTokenQuota: 0 });

    fireEvent.change(input, { target: { value: '1234.7' } });
    fireEvent.blur(input);
    expect(setPref).toHaveBeenCalledWith({ agentTokenQuota: 1234 });
  });
});
