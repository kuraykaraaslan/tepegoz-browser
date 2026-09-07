// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ShortcutDialog } from './newtab-page-shortcut-dialog';
import { ShortcutMenu } from './newtab-page-shortcut-menu';
import { TepegozLogo } from './tepegoz-logo';

/**
 * The two pieces behind a new-tab shortcut tile: the right-click menu and the add/edit form.
 *
 * Both are bare overlays rather than native surfaces, so dismissal is their own responsibility —
 * a click outside, a right-click outside, and Escape all have to close them, and a click INSIDE must
 * not, or interacting with either would dismiss it.
 */

const DIALOG_LABELS = {
  name: 'Name',
  url: 'URL',
  urlPlaceholder: 'https://',
  save: 'Done',
  cancel: 'Cancel',
};

function renderDialog(over: { initialName?: string; initialUrl?: string } = {}) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(
    <ShortcutDialog
      title="Add shortcut"
      initialName={over.initialName ?? ''}
      initialUrl={over.initialUrl ?? ''}
      labels={DIALOG_LABELS}
      onCancel={onCancel}
      onSave={onSave}
    />,
  );
  return { onSave, onCancel };
}

function renderMenu(over: { canEdit?: boolean; canRemove?: boolean } = {}) {
  const onEdit = vi.fn();
  const onRemove = vi.fn();
  const onClose = vi.fn();
  render(
    <ShortcutMenu
      x={120}
      y={80}
      canEdit={over.canEdit ?? true}
      canRemove={over.canRemove ?? true}
      labels={{ edit: 'Edit', remove: 'Remove' }}
      onEdit={onEdit}
      onRemove={onRemove}
      onClose={onClose}
    />,
  );
  return { onEdit, onRemove, onClose };
}

const saveButton = (): HTMLButtonElement =>
  screen.getByRole<HTMLButtonElement>('button', { name: 'Done' });

afterEach(cleanup);

describe('the shortcut dialog', () => {
  it('focuses and selects the name so typing replaces it', () => {
    // Editing a shortcut usually means replacing its name, not appending to it.
    renderDialog({ initialName: 'Docs', initialUrl: 'https://docs.test/' });
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));
  });

  it('keeps Done disabled until there is a URL to save', () => {
    // The name is optional — the tile falls back to the host — but a shortcut with no URL points
    // nowhere.
    renderDialog();
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'example.test' } });
    expect(saveButton().disabled).toBe(false);

    fireEvent.change(screen.getByLabelText('URL'), { target: { value: '   ' } });
    expect(saveButton().disabled).toBe(true);
  });

  it('adds a scheme to a bare host, so a typed "example.test" is a real URL', () => {
    const { onSave } = renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Example  ' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'example.test' } });
    fireEvent.click(saveButton());

    // the name is trimmed; the url gains https://
    expect(onSave).toHaveBeenCalledWith('Example', 'https://example.test');
  });

  it('leaves a URL that already has a scheme alone, internal pages included', () => {
    for (const url of ['http://plain.test/', 'https://secure.test/', 'tepegoz://settings']) {
      const { onSave } = renderDialog();
      fireEvent.change(screen.getByLabelText('URL'), { target: { value: url } });
      fireEvent.click(saveButton());
      expect(onSave, url).toHaveBeenCalledWith('', url);
      cleanup();
    }
  });

  it('refuses a whitespace-only URL even if the form is submitted directly', () => {
    // Done is disabled for it, but Enter in a text field submits the form regardless.
    const { onSave } = renderDialog();
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: '   ' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Cancel' }).closest('form')!);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('cancels from the button, from Escape, and from a click on the backdrop', () => {
    const { onCancel } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);

    const form = screen.getByRole('button', { name: 'Cancel' }).closest('form')!;
    fireEvent.click(form.parentElement!);
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it('does not cancel on a click inside the form', () => {
    const { onCancel } = renderDialog();
    fireEvent.click(screen.getByLabelText('Name'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('ignores other keys, and stops listening once it is gone', () => {
    const { onCancel } = renderDialog();
    fireEvent.keyDown(window, { key: 'a' });
    expect(onCancel).not.toHaveBeenCalled();

    cleanup();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('the shortcut menu', () => {
  it('places itself at the pointer', () => {
    renderMenu();
    const menu = screen.getByRole('menu');
    expect(menu.style.left).toBe('120px');
    expect(menu.style.top).toBe('80px');
  });

  it('reports the item chosen', () => {
    const { onEdit, onRemove } = renderMenu();
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalled();

    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalled();
  });

  it('shows only the items the host can actually perform', () => {
    renderMenu({ canRemove: false });
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeDefined();
    expect(screen.queryByRole('menuitem', { name: 'Remove' })).toBeNull();

    cleanup();
    renderMenu({ canEdit: false });
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toBeDefined();
  });

  it('dismisses on a click outside, on a RIGHT-click outside, and on Escape', () => {
    // The right-click case matters: opening the menu somewhere else is the most natural way to move
    // it, and without this the first menu would stay behind the second.
    const { onClose } = renderMenu();
    const backdrop = screen.getByRole('menu').parentElement!;

    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.contextMenu(backdrop);
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('does not dismiss on a click on the menu itself', () => {
    const { onClose } = renderMenu();
    fireEvent.click(screen.getByRole('menu'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores other keys, and stops listening once it is gone', () => {
    const { onClose } = renderMenu();
    fireEvent.keyDown(window, { key: 'a' });
    expect(onClose).not.toHaveBeenCalled();

    cleanup();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('the wordmark', () => {
  it('is one labelled image to a screen reader, not a pile of decorative parts', () => {
    // The emblem and the wordmark are separate elements; without the single role/label the page
    // would announce them as unrelated graphics, or as nothing at all.
    render(<TepegozLogo label="Tepegöz" />);
    expect(screen.getByRole('img', { name: 'Tepegöz' })).toBeDefined();
  });

  it('takes a host class name, and renders without one', () => {
    const { container } = render(<TepegozLogo label="Tepegöz" className="text-text-primary" />);
    expect(container.querySelector('.text-text-primary')).not.toBeNull();

    cleanup();
    const bare = render(<TepegozLogo label="Tepegöz" />);
    expect(bare.container.querySelector('[role="img"]')).not.toBeNull();
  });
});
