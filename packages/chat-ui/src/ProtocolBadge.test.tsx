// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { ProtocolBadge } from './ProtocolBadge';

afterEach(cleanup);

describe('ProtocolBadge', () => {
  it.each([
    ['xmpp', 'XMPP'],
    ['irc', 'IRC'],
    ['matrix', 'Matrix'],
  ] as const)('labels %s as %s and carries it as data-protocol', (protocol, label) => {
    render(
      <I18nProvider locale="en">
        <ProtocolBadge protocol={protocol} />
      </I18nProvider>,
    );
    const badge = screen.getByText(label).closest('.chat-protocol-badge');
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('data-protocol')).toBe(protocol);
    expect(badge?.getAttribute('title')).toBe(label);
  });

  it('localizes to Turkish', () => {
    render(
      <I18nProvider locale="tr">
        <ProtocolBadge protocol="bridge" />
      </I18nProvider>,
    );
    expect(screen.getByText('Köprülü ağ')).toBeDefined();
  });

  it('falls back to the bridge mark for an unrecognised protocol', () => {
    render(
      <I18nProvider locale="en">
        <ProtocolBadge protocol="telegram" />
      </I18nProvider>,
    );
    const badge = screen.getByText('Bridged network').closest('.chat-protocol-badge');
    expect(badge?.getAttribute('data-protocol')).toBe('bridge');
  });
});
