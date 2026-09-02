// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { settingsDict } from '@tepegoz/settings-ui';
import type { AgentModelInfo } from '@tepegoz/desktop-ipc';
import { KeyModelMenu, useProviderModels } from './settings-ai-panels-key-model';

/**
 * The per-KEY model picker (the model is pinned on the key, not the provider). Under test:
 * useProviderModels reads the config's provider-keyed catalog into a Map (empty Map on failure);
 * KeyModelMenu renders nothing without a catalog, shows the model in effect (or "Auto"), opens a
 * portalled radio menu, and saves immediately — only when the choice actually changed.
 */

const s = settingsDict.en;
const getAgentConfig = vi.fn();

const models: AgentModelInfo[] = [
  { id: 'sonnet', label: 'Sonnet 4.6' },
  { id: 'opus', label: 'Opus 4.6' },
];

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: { getAgentConfig } });
});
afterEach(cleanup);

describe('useProviderModels', () => {
  it('reads the provider-keyed catalog from the agent config', async () => {
    getAgentConfig.mockResolvedValue({ models: { anthropic: models, openai: [] } });
    const { result } = renderHook(() => useProviderModels());
    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.get('anthropic')).toEqual(models);
  });

  it('is an empty Map when the config call fails', async () => {
    getAgentConfig.mockRejectedValue(new Error('no config'));
    const { result } = renderHook(() => useProviderModels());
    await waitFor(() => expect(getAgentConfig).toHaveBeenCalled());
    expect(result.current.size).toBe(0);
  });
});

describe('KeyModelMenu', () => {
  function renderMenu(props: Partial<Parameters<typeof KeyModelMenu>[0]> = {}) {
    const onChange = vi.fn();
    render(
      <I18nProvider locale="en">
        <KeyModelMenu keyId="k1" models={models} value="" onChange={onChange} {...props} />
      </I18nProvider>,
    );
    return { onChange };
  }

  it('renders nothing without a catalog', () => {
    const { container } = render(
      <I18nProvider locale="en">
        <KeyModelMenu keyId="k1" models={undefined} value="" onChange={vi.fn()} />
      </I18nProvider>,
    );
    expect(container.querySelector('button')).toBeNull();
  });

  it('shows "Auto" on the trigger when no model is pinned, the model label otherwise', () => {
    const { onChange } = renderMenu({ value: 'opus' });
    void onChange;
    expect(screen.getByRole('button', { name: s.keyModel.label }).textContent).toContain('Opus 4.6');
  });

  it('opens a portalled radio menu listing Auto + every model', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: s.keyModel.label }));
    const menu = screen.getByRole('menu');
    const items = screen.getAllByRole('menuitemradio');
    expect(items).toHaveLength(models.length + 1); // + Auto
    expect(within(menu).getByText(s.keyModel.auto)).toBeTruthy();
    // "Auto" is checked because value is ''
    expect(items[0]!.getAttribute('aria-checked')).toBe('true');
  });

  it('saves a new choice immediately and closes', () => {
    const { onChange } = renderMenu({ value: '' });
    fireEvent.click(screen.getByRole('button', { name: s.keyModel.label }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Sonnet 4\.6/ }));
    expect(onChange).toHaveBeenCalledWith('sonnet');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does not call onChange when the current model is re-selected', () => {
    const { onChange } = renderMenu({ value: 'sonnet' });
    fireEvent.click(screen.getByRole('button', { name: s.keyModel.label }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Sonnet 4\.6/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: s.keyModel.label }));
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
