// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import type { ExtensionState } from '@tepegoz/desktop-ipc';
import type { ExtensionManifest } from '@tepegoz/extension-sdk';
import type { ExtensionDef } from '../extensions/registry';
import { ExtensionsPage } from './ExtensionsPage';

/**
 * tepegoz://extensions — the projection from the built-in registry into the generic grid. Under test:
 * the localized label wins over the manifest default, the meta line is `v<version> · <id>`, the
 * enabled flag comes from the persisted state list (absent === enabled), and a toggle forwards the
 * extension id.
 */

function manifest(over: Partial<ExtensionManifest> & { id: string }): ExtensionManifest {
  return {
    name: 'Agent',
    version: '1.2.3',
    description: 'Runs tasks',
    labels: {},
    ...over,
  } as ExtensionManifest;
}

function def(m: ExtensionManifest): ExtensionDef {
  return { id: m.id, manifest: m, icon: null, surfaces: {} };
}

afterEach(cleanup);

function renderPage(
  extensions: ExtensionDef[],
  states: ExtensionState[],
  locale: 'en' | 'tr' = 'en',
) {
  const onToggle = vi.fn();
  render(
    <I18nProvider locale={locale}>
      <ExtensionsPage locale={locale} extensions={extensions} states={states} onToggle={onToggle} />
    </I18nProvider>,
  );
  return { onToggle };
}

const sw = (name: RegExp) => screen.getByRole<HTMLInputElement>('switch', { name });

describe('ExtensionsPage', () => {
  it('renders one card per extension with a "v<version> · <id>" meta line', () => {
    renderPage([def(manifest({ id: 'com.tepegoz.agent' }))], []);
    expect(screen.getByText('Agent')).toBeTruthy();
    expect(screen.getByText('v1.2.3 · com.tepegoz.agent')).toBeTruthy();
  });

  it('prefers the locale label override over the manifest default', () => {
    renderPage(
      [
        def(
          manifest({
            id: 'com.tepegoz.agent',
            labels: { tr: { name: 'Ajan', description: 'Görev yürütür' } },
          }),
        ),
      ],
      [],
      'tr',
    );
    expect(screen.getByText('Ajan')).toBeTruthy();
    expect(screen.queryByText('Agent')).toBeNull();
  });

  it('marks an extension disabled when the state list says so, enabled when absent', () => {
    renderPage(
      [
        def(manifest({ id: 'com.tepegoz.agent' })),
        def(manifest({ id: 'com.tepegoz.adblock', name: 'Adblock', description: '' })),
      ],
      [{ id: 'com.tepegoz.adblock', status: 'disabled' }],
    );
    expect(sw(/Agent/).checked).toBe(true);
    expect(sw(/Adblock/).checked).toBe(false);
  });

  it('forwards the extension id and the new value when a card is toggled', () => {
    const { onToggle } = renderPage([def(manifest({ id: 'com.tepegoz.agent' }))], []);
    fireEvent.click(sw(/Agent/));
    expect(onToggle).toHaveBeenCalledWith('com.tepegoz.agent', false);
  });
});
