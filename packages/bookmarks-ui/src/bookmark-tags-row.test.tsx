// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { TagsRow } from './bookmark-tags-row';

afterEach(cleanup);

function setup(tags: string[], onSave = vi.fn().mockResolvedValue(tags)) {
  render(
    <I18nProvider locale="en">
      <TagsRow tags={tags} onSave={onSave} />
    </I18nProvider>,
  );
  return onSave;
}

function openEditor(): HTMLInputElement {
  fireEvent.click(screen.getByRole('button', { name: 'Tags' }));
  return screen.getByRole('textbox');
}

describe('TagsRow', () => {
  it('shows existing tags without an input in the way', () => {
    setup(['research', 'to read']);
    expect(screen.getByText('research')).not.toBeNull();
    // A permanently-open field on every bookmark would turn the list into a form.
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('opens an editor holding the WHOLE set, so a tag can be removed', () => {
    // A merge-only "add a tag" control gives no way to take one off, which is what people reach for
    // the instant they mistype.
    setup(['research', 'to read']);
    expect(openEditor().value).toBe('research, to read');
  });

  it('saves on Enter', () => {
    const onSave = setup([]);
    const box = openEditor();
    fireEvent.change(box, { target: { value: 'ai, papers' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    // Split, not normalized: the STORE decides the final set, and this passes it the raw pieces.
    expect(onSave).toHaveBeenCalledWith(['ai', ' papers']);
  });

  it('saves on blur — a click elsewhere after typing means yes', async () => {
    const onSave = setup([]);
    const box = openEditor();
    fireEvent.change(box, { target: { value: 'ai' } });
    fireEvent.blur(box);
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(['ai']);
    });
  });

  it('abandons on Escape, keeping what was there', () => {
    const onSave = setup(['keep']);
    const box = openEditor();
    fireEvent.change(box, { target: { value: 'keep, and more' } });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('keep')).not.toBeNull();
  });

  it('does not fire a second save while one is still in flight', () => {
    let release: (v: string[]) => void = () => undefined;
    const onSave = vi.fn().mockReturnValue(
      new Promise<string[]>((r) => {
        release = r;
      }),
    );
    setup([], onSave);
    const box = openEditor();
    fireEvent.change(box, { target: { value: 'ai' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledOnce();
    release([]);
  });

  it('keeps typing out of the row underneath', () => {
    // The row this sits in is a dnd-kit drag handle and the manager binds keys on it. Without
    // `stopPropagation` those React handlers would fire on every character of a tag being typed.
    const rowKeyDown = vi.fn();
    render(
      <I18nProvider locale="en">
        <li onKeyDown={rowKeyDown}>
          <TagsRow tags={[]} onSave={vi.fn().mockResolvedValue([])} />
        </li>
      </I18nProvider>,
    );
    const box = openEditor();
    fireEvent.keyDown(box, { key: 'a' });
    expect(rowKeyDown).not.toHaveBeenCalled();
  });
});
