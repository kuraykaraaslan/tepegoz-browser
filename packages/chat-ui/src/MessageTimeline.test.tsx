// @vitest-environment jsdom
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import type { ChatMessage } from '@tepegoz/shared-types';
import { MessageTimeline } from './MessageTimeline';

afterEach(cleanup);

const T0 = new Date(2026, 2, 15, 10, 0, 0).getTime();

function msg(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    conversationId: 'c1',
    accountId: 'work',
    protocolId: 'p1',
    senderAddress: 'alice@x.example',
    senderName: 'Alice',
    kind: 'text',
    body: 'hi',
    mediaRef: null,
    replyToId: null,
    reactions: [],
    editedAt: null,
    redacted: false,
    originTs: T0,
    receivedAt: T0,
    deliveryState: 'delivered',
    ...over,
  };
}

const wrap = (ui: ReactElement) => render(<I18nProvider locale="en">{ui}</I18nProvider>);

describe('MessageTimeline', () => {
  it('renders a day separator and the message body', () => {
    wrap(<MessageTimeline messages={[msg({ body: 'hello world' })]} now={T0} />);
    expect(screen.getByText('Today')).toBeDefined();
    expect(screen.getByText('hello world')).toBeDefined();
  });

  it('shows the sender header only on the first message of a group', () => {
    wrap(
      <MessageTimeline
        messages={[
          msg({ id: 'a', body: 'one', originTs: T0 }),
          msg({ id: 'b', body: 'two', originTs: T0 + 30_000 }),
        ]}
        now={T0}
      />,
    );
    expect(screen.getAllByText('Alice')).toHaveLength(1);
  });

  it('renders the "new messages" divider', () => {
    wrap(
      <MessageTimeline
        messages={[msg({ id: 'a' }), msg({ id: 'b', originTs: T0 + 1000 })]}
        lastReadId="a"
        now={T0}
      />,
    );
    expect(screen.getByText('New messages')).toBeDefined();
  });

  it('shows a redacted placeholder instead of the body', () => {
    wrap(<MessageTimeline messages={[msg({ redacted: true, body: 'secret' })]} now={T0} />);
    expect(screen.queryByText('secret')).toBeNull();
    expect(screen.getByText('Message deleted')).toBeDefined();
  });

  it('marks an edited message and shows own-message delivery state', () => {
    wrap(
      <MessageTimeline
        messages={[msg({ editedAt: T0 + 5000, deliveryState: 'read' })]}
        isOwn={() => true}
        now={T0}
      />,
    );
    expect(screen.getByText('(edited)')).toBeDefined();
    expect(screen.getByText('Read')).toBeDefined();
  });

  it('routes a link click through onOpenLink and never navigates itself', () => {
    const onOpenLink = vi.fn();
    wrap(
      <MessageTimeline
        messages={[msg({ body: 'see https://tepegoz.example/x' })]}
        onOpenLink={onOpenLink}
        now={T0}
      />,
    );
    const link = screen.getByText('https://tepegoz.example/x');
    fireEvent.click(link);
    expect(onOpenLink).toHaveBeenCalledWith('https://tepegoz.example/x');
  });

  it('renders links as inert text when no onOpenLink is given', () => {
    wrap(<MessageTimeline messages={[msg({ body: 'x https://a.example y' })]} now={T0} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('https://a.example')).toBeDefined();
  });

  it('honours a custom groupWindowMs', () => {
    wrap(
      <MessageTimeline
        messages={[
          msg({ id: 'a', body: 'one', originTs: T0 }),
          msg({ id: 'b', body: 'two', originTs: T0 + 90_000 }),
        ]}
        groupWindowMs={60_000}
        now={T0}
      />,
    );
    // 90s gap now exceeds the 60s window → the second message opens a new group (its own header)
    expect(screen.getAllByText('Alice')).toHaveLength(2);
  });

  it('falls back to the sender address when there is no display name', () => {
    wrap(
      <MessageTimeline
        messages={[msg({ senderName: '   ', senderAddress: 'ghost@x.example' })]}
        now={T0}
      />,
    );
    expect(screen.getByText('ghost@x.example')).toBeDefined();
  });

  it('renders an attachment through resolveMedia and passes mediaRef only as an opaque key', async () => {
    const resolveMedia = vi.fn(() =>
      Promise.resolve({ url: 'blob:local-1', mime: 'image/png', name: 'pic.png' }),
    );
    wrap(
      <MessageTimeline
        messages={[msg({ body: '', kind: 'media', mediaRef: 'https://evil.example/beacon.png' })]}
        resolveMedia={resolveMedia}
        now={T0}
      />,
    );
    const img = await screen.findByRole('img');
    expect(img.getAttribute('src')).toBe('blob:local-1');
    // the message's "mediaRef" URL is never used as a src — only handed to resolveMedia verbatim
    expect(resolveMedia).toHaveBeenCalledWith('https://evil.example/beacon.png');
    expect(document.querySelector('img[src^="http"]')).toBeNull();
  });

  it('does not render attachments when no resolveMedia is supplied', () => {
    wrap(<MessageTimeline messages={[msg({ body: '', kind: 'media', mediaRef: 'ref' })]} now={T0} />);
    expect(screen.queryByText('Loading attachment…')).toBeNull();
  });

  it('renders a reactions row', () => {
    wrap(
      <MessageTimeline
        messages={[msg({ reactions: [{ emoji: '👍', count: 3, me: true }] })]}
        now={T0}
      />,
    );
    expect(screen.getByText('👍 3')).toBeDefined();
  });

  it('windows a very long conversation and shows an "earlier messages" row', () => {
    const many = Array.from({ length: 260 }, (_, i) => msg({ id: `m${i}`, body: `line ${i}`, originTs: T0 + i * 1000 }));
    wrap(<MessageTimeline messages={many} now={T0 + 260_000} maxMessages={200} />);
    expect(screen.getByText('60 earlier messages not shown')).toBeDefined();
    // the oldest kept line is 60, line 59 is windowed out
    expect(screen.getByText('line 60')).toBeDefined();
    expect(screen.queryByText('line 59')).toBeNull();
  });

  it('quotes the original of a reply that is in the window', () => {
    wrap(
      <MessageTimeline
        messages={[
          msg({ id: 'a', protocolId: 'orig', senderName: 'Alice', body: 'the original point' }),
          msg({ id: 'b', protocolId: 'p2', senderName: 'Bob', senderAddress: 'bob@x', body: 'I agree', replyToId: 'orig' }),
        ]}
        now={T0}
      />,
    );
    const quote = screen.getByLabelText('In reply to Alice');
    expect(quote.textContent).toContain('Alice');
    expect(quote.textContent).toContain('the original point');
  });

  it('renders no quote when the reply target is not loaded', () => {
    wrap(
      <MessageTimeline
        messages={[msg({ protocolId: 'p2', body: 'reply into the void', replyToId: 'missing' })]}
        now={T0}
      />,
    );
    expect(screen.queryByLabelText(/In reply to/)).toBeNull();
  });

  it('makes the quote a button that jumps to the original when onJumpToMessage is given', () => {
    const onJumpToMessage = vi.fn();
    wrap(
      <MessageTimeline
        messages={[
          msg({ id: 'a', protocolId: 'orig', body: 'source' }),
          msg({ id: 'b', protocolId: 'p2', body: 'echo', replyToId: 'orig' }),
        ]}
        now={T0}
        onJumpToMessage={onJumpToMessage}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /In reply to/ }));
    expect(onJumpToMessage).toHaveBeenCalledWith('orig');
  });

  it('trims a long quoted body', () => {
    const long = 'x'.repeat(400);
    wrap(
      <MessageTimeline
        messages={[
          msg({ id: 'a', protocolId: 'orig', body: long }),
          msg({ id: 'b', protocolId: 'p2', body: 'ok', replyToId: 'orig' }),
        ]}
        now={T0}
      />,
    );
    expect(screen.getByText(`${'x'.repeat(120)}…`)).toBeDefined();
  });
});
