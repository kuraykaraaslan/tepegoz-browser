// @vitest-environment jsdom
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { CHAT_MESSAGE_BODY_MAX } from '@tepegoz/shared-types';
import { Composer } from './Composer';

afterEach(cleanup);

const wrap = (ui: ReactElement) => render(<I18nProvider locale="en">{ui}</I18nProvider>);

describe('Composer', () => {
  it('sends a trimmed body on plain Enter and clears the field', () => {
    const onSubmit = vi.fn();
    wrap(<Composer onSubmit={onSubmit} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '  hello  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith({ text: 'hello', replyToId: null, editMessageId: null });
    expect(input).toHaveProperty('value', '');
  });

  it('Shift+Enter does not send', () => {
    const onSubmit = vi.fn();
    wrap(<Composer onSubmit={onSubmit} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'line' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables send for an empty or whitespace draft', () => {
    wrap(<Composer onSubmit={vi.fn()} />);
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
    expect(send).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x' } });
    expect(send).toHaveProperty('disabled', false);
  });

  it('carries the reply target and shows the banner, cleared on Escape', () => {
    const onSubmit = vi.fn();
    const onCancelContext = vi.fn();
    wrap(
      <Composer
        onSubmit={onSubmit}
        replyingTo={{ messageId: 'm7', author: 'Bob' }}
        onCancelContext={onCancelContext}
      />,
    );
    expect(screen.getByText('Replying to Bob')).toBeDefined();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'yes' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith({ text: 'yes', replyToId: 'm7', editMessageId: null });

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancelContext).toHaveBeenCalled();
  });

  it('seeds the field from an edit target and submits as an edit', () => {
    const onSubmit = vi.fn();
    wrap(<Composer onSubmit={onSubmit} editing={{ messageId: 'm3', body: 'draft text' }} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveProperty('value', 'draft text');
    expect(screen.getByText('Editing message')).toBeDefined();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith({
      text: 'draft text',
      replyToId: null,
      editMessageId: 'm3',
    });
  });

  it('blocks an over-long body and shows the error', () => {
    const onSubmit = vi.fn();
    wrap(<Composer onSubmit={onSubmit} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'x'.repeat(CHAT_MESSAGE_BODY_MAX + 1) } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('This message is too long to send.')).toBeDefined();
    expect(input).toHaveProperty('ariaInvalid', 'true');
  });

  it('sends on a Send-button click (form submit) and shows the countdown near the limit', () => {
    const onSubmit = vi.fn();
    wrap(<Composer onSubmit={onSubmit} />);
    const input = screen.getByRole('textbox');
    const long = 'x'.repeat(CHAT_MESSAGE_BODY_MAX - 5);
    fireEvent.change(input, { target: { value: long } });
    expect(screen.getByText('5')).toBeDefined(); // remaining chars
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledWith({ text: long, replyToId: null, editMessageId: null });
  });

  it('uses a caller-supplied placeholder', () => {
    wrap(<Composer onSubmit={vi.fn()} placeholder="Say something" />);
    expect(screen.getByPlaceholderText('Say something')).toBeDefined();
  });

  it('does not send while an IME candidate is open', () => {
    const onSubmit = vi.fn();
    wrap(<Composer onSubmit={onSubmit} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'ka' } });
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalled();
  });
});
