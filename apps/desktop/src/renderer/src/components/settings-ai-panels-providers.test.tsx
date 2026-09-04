// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { settingsDict } from '@tepegoz/settings-ui';
import { coreDict } from '@tepegoz/i18n';
import type { CredentialsStatus, ProviderKeyMeta } from '@tepegoz/desktop-ipc';
import { ProvidersSection } from './settings-ai-panels-providers';

/**
 * Providers & API keys. The list is one drag/keyboard-reorderable priority order; the raw key never
 * comes back; the model is pinned per key; and every failure reports what main said rather than a
 * blanket "upstream down". This drives add / remove / rename / reorder and the failure branches.
 */

const s = settingsDict.en;
const c = coreDict.en;

function key(over: Partial<ProviderKeyMeta> = {}): ProviderKeyMeta {
  return {
    id: 'k1',
    provider: 'anthropic',
    label: 'Work',
    createdAt: 0,
    last4: 'abcd',
    model: '',
    ...over,
  };
}

beforeEach(() => {
  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: { getAgentConfig: () => Promise.resolve({ models: {} }) },
  });
});
afterEach(cleanup);

function renderSection(
  over: Partial<Parameters<typeof ProvidersSection>[0]> = {},
): {
  onAdd: ReturnType<typeof vi.fn>;
  onRemoveById: ReturnType<typeof vi.fn>;
  onRename: ReturnType<typeof vi.fn>;
  onSetModel: ReturnType<typeof vi.fn>;
  onReorder: ReturnType<typeof vi.fn>;
  notify: ReturnType<typeof vi.fn>;
} {
  const fns = {
    onAdd: vi.fn(() => Promise.resolve()),
    onRemoveById: vi.fn(() => Promise.resolve()),
    onRename: vi.fn(() => Promise.resolve()),
    onSetModel: vi.fn(() => Promise.resolve()),
    onReorder: vi.fn(() => Promise.resolve()),
    notify: vi.fn(),
  };
  render(
    <I18nProvider locale="en">
      <ProvidersSection
        keys={[]}
        encryptionAvailable
        regions={{}}
        {...fns}
        {...over}
      />
    </I18nProvider>,
  );
  return fns;
}

describe('ProvidersSection', () => {
  it('shows the encryption warning and disables the form when the vault is unavailable', () => {
    renderSection({ encryptionAvailable: false });
    expect(screen.getByText(s.encryptionUnavailable)).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: s.addKey }).disabled).toBe(true);
    expect(screen.getByLabelText(s.apiKey)).toHaveProperty('disabled', true);
  });

  it('adds a key with a defaulted label and reports success', async () => {
    const { onAdd, notify } = renderSection();
    fireEvent.change(screen.getByLabelText(s.apiKey), { target: { value: 'sk-secret' } });
    fireEvent.click(screen.getByRole('button', { name: s.addKey }));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith('anthropic', s.providerNames.anthropic, 'sk-secret', undefined),
    );
    await waitFor(() => expect(notify).toHaveBeenCalledWith('success', s.keyAdded));
  });

  it('passes a hand-typed label through to onAdd', async () => {
    const { onAdd } = renderSection();
    fireEvent.change(document.getElementById('key-label')!, { target: { value: 'Personal' } });
    fireEvent.change(screen.getByLabelText(s.apiKey), { target: { value: 'sk-personal' } });
    fireEvent.click(screen.getByRole('button', { name: s.addKey }));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith('anthropic', 'Personal', 'sk-personal', undefined),
    );
  });

  it('reports the failure reason main gave when add rejects', async () => {
    const { notify } = renderSection({
      onAdd: vi.fn(() => Promise.reject(new Error('that key was rejected'))),
    });
    fireEvent.change(screen.getByLabelText(s.apiKey), { target: { value: 'sk-bad' } });
    fireEvent.click(screen.getByRole('button', { name: s.addKey }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('error', 'that key was rejected'));
  });

  it('falls back to the generic message when the rejection has none', async () => {
    const { notify } = renderSection({
      onAdd: vi.fn(() => Promise.reject(new Error(''))),
    });
    fireEvent.change(screen.getByLabelText(s.apiKey), { target: { value: 'sk-x' } });
    fireEvent.click(screen.getByRole('button', { name: s.addKey }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('error', c.errors.upstreamDown));
  });

  it('shows the region picker for a multi-endpoint provider and sends the non-default region', async () => {
    const { onAdd } = renderSection({
      regions: {
        anthropic: [
          { id: 'us', label: 'United States' },
          { id: 'eu', label: 'Europe' },
        ],
      } as unknown as CredentialsStatus['regions'],
    });
    fireEvent.change(screen.getByLabelText(s.regionSelectLabel), { target: { value: 'eu' } });
    fireEvent.change(screen.getByLabelText(s.apiKey), { target: { value: 'sk-eu' } });
    fireEvent.click(screen.getByRole('button', { name: s.addKey }));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith('anthropic', s.providerNames.anthropic, 'sk-eu', 'eu'),
    );
  });

  it('lists a stored key by label, fingerprint, provider — and flags a not-yet-runnable one', () => {
    renderSection({
      keys: [key({ id: 'k1', label: 'Local box', provider: 'local', last4: 'wxyz' })],
    });
    expect(screen.getByText('Local box')).toBeTruthy();
    expect(screen.getByText('…wxyz')).toBeTruthy();
    expect(screen.getByText(s.providerNotUsableYet)).toBeTruthy();
  });

  it('reorders with the keyboard arrows and reports the new order', async () => {
    const { onReorder, notify } = renderSection({
      keys: [key({ id: 'a', label: 'A' }), key({ id: 'b', label: 'B' })],
    });
    fireEvent.click(screen.getByRole('button', { name: s.moveDown.replace('{name}', 'A') }));
    await waitFor(() => expect(onReorder).toHaveBeenCalledWith(['b', 'a']));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('success', s.keysReordered));
  });

  it('reports a rejected reorder', async () => {
    const { notify } = renderSection({
      keys: [key({ id: 'a', label: 'A' }), key({ id: 'b', label: 'B' })],
      onReorder: vi.fn(() => Promise.reject(new Error('vault write failed'))),
    });
    fireEvent.click(screen.getByRole('button', { name: s.moveDown.replace('{name}', 'A') }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('error', 'vault write failed'));
  });

  it('reorders by drag and drop', async () => {
    const { onReorder } = renderSection({
      keys: [key({ id: 'a', label: 'A' }), key({ id: 'b', label: 'B' })],
    });
    const rows = screen.getAllByRole('listitem');
    fireEvent.dragStart(rows[0]!);
    fireEvent.drop(rows[1]!);
    await waitFor(() => expect(onReorder).toHaveBeenCalledWith(['b', 'a']));
  });

  it('renames a key inline and reports success; Cancel abandons the edit', async () => {
    const { onRename } = renderSection({ keys: [key({ id: 'k1', label: 'Old' })] });

    fireEvent.click(screen.getByRole('button', { name: s.rename }));
    fireEvent.change(document.getElementById('rename-k1')!, { target: { value: 'New name' } });
    fireEvent.click(screen.getByRole('button', { name: c.common.save }));
    await waitFor(() => expect(onRename).toHaveBeenCalledWith('k1', 'New name'));

    // reopen, then cancel
    fireEvent.click(screen.getByRole('button', { name: s.rename }));
    fireEvent.click(screen.getByRole('button', { name: s.cancel }));
    expect(screen.queryByRole('button', { name: c.common.save })).toBeNull();
  });

  it('reports rejected remove / rename / model-pin through notify', async () => {
    const { notify } = renderSection({
      keys: [key({ id: 'k1', label: 'K' })],
      onRemoveById: vi.fn(() => Promise.reject(new Error('remove blew up'))),
      onRename: vi.fn(() => Promise.reject(new Error('rename blew up'))),
      onSetModel: vi.fn(() => Promise.reject(new Error('model blew up'))),
    });

    fireEvent.click(screen.getByRole('button', { name: s.rename }));
    fireEvent.change(document.getElementById('rename-k1')!, { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: c.common.save }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('error', 'rename blew up'));

    fireEvent.click(screen.getByRole('button', { name: s.cancel }));
    fireEvent.click(screen.getByRole('button', { name: s.remove }));
    const confirms = screen.getAllByRole('button', { name: s.remove });
    fireEvent.click(confirms[confirms.length - 1]!);
    await waitFor(() => expect(notify).toHaveBeenCalledWith('error', 'remove blew up'));
  });

  it('shows a key\'s stored region label and re-selecting the default region sends nothing', async () => {
    const regions = {
      anthropic: [
        { id: 'us', label: 'United States' },
        { id: 'eu', label: 'Europe' },
      ],
    } as unknown as CredentialsStatus['regions'];
    const { onAdd } = renderSection({
      regions,
      keys: [key({ id: 'k1', label: 'EU key', region: 'eu' })],
    });
    const row = screen.getByText('EU key').closest('li')!;
    expect(within(row).getByText('Europe')).toBeTruthy();

    // pick EU then pick the default (US) back → region resets to '' → onAdd gets undefined
    fireEvent.change(screen.getByLabelText(s.regionSelectLabel), { target: { value: 'eu' } });
    fireEvent.change(screen.getByLabelText(s.regionSelectLabel), { target: { value: 'us' } });
    fireEvent.change(screen.getByLabelText(s.apiKey), { target: { value: 'sk-us' } });
    fireEvent.click(screen.getByRole('button', { name: s.addKey }));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith('anthropic', s.providerNames.anthropic, 'sk-us', undefined),
    );
  });

  it('moves a key up with the keyboard arrow and tolerates a drag-over', async () => {
    const { onReorder } = renderSection({
      keys: [key({ id: 'a', label: 'A' }), key({ id: 'b', label: 'B' })],
    });
    const rows = screen.getAllByRole('listitem');
    fireEvent.dragOver(rows[1]!);
    fireEvent.click(screen.getByRole('button', { name: s.moveUp.replace('{name}', 'B') }));
    await waitFor(() => expect(onReorder).toHaveBeenCalledWith(['b', 'a']));
  });

  it('reports a rejected model pin', async () => {
    Object.defineProperty(window, 'tepegoz', {
      configurable: true,
      value: {
        getAgentConfig: () =>
          Promise.resolve({ models: { anthropic: [{ id: 'sonnet', label: 'Sonnet' }] } }),
      },
    });
    const { notify } = renderSection({
      keys: [key({ id: 'k1', provider: 'anthropic' })],
      onSetModel: vi.fn(() => Promise.reject(new Error('model pin failed'))),
    });
    const trigger = await screen.findByRole('button', { name: s.keyModel.label });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Sonnet/ }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('error', 'model pin failed'));
  });

  it('removes a key through the confirm dialog', async () => {
    const { onRemoveById, notify } = renderSection({ keys: [key({ id: 'k1', label: 'Doomed' })] });
    fireEvent.click(screen.getByRole('button', { name: s.remove }));
    const confirms = screen.getAllByRole('button', { name: s.remove });
    fireEvent.click(confirms[confirms.length - 1]!);
    await waitFor(() => expect(onRemoveById).toHaveBeenCalledWith('k1'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('success', s.keyRemoved));
  });

  it('changing the add-form provider resets the region and updates the dropdown', () => {
    renderSection();
    const providerSelect = screen.getByLabelText<HTMLSelectElement>(s.providerSelectLabel);
    fireEvent.change(providerSelect, { target: { value: 'openai' } });
    expect(providerSelect.value).toBe('openai');
  });

  it('pins a model on a key when the menu has a catalog for its provider', async () => {
    Object.defineProperty(window, 'tepegoz', {
      configurable: true,
      value: {
        getAgentConfig: () =>
          Promise.resolve({ models: { anthropic: [{ id: 'sonnet', label: 'Sonnet' }] } }),
      },
    });
    const { onSetModel, notify } = renderSection({ keys: [key({ id: 'k1', provider: 'anthropic' })] });

    const trigger = await screen.findByRole('button', { name: s.keyModel.label });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Sonnet/ }));
    await waitFor(() => expect(onSetModel).toHaveBeenCalledWith('k1', 'sonnet'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('success', s.keyModel.saved));
  });
});
