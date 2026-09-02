// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { ConfirmAction } from './settings-confirm';

/**
 * The one confirmation dialog for irreversible settings actions. The point of consolidating it: the
 * action fires only from the modal's confirm button, never from the trigger; cancel (and the modal's
 * own close) must not fire it; and a disabled trigger opens nothing.
 */

function renderConfirm(props: Partial<Parameters<typeof ConfirmAction>[0]> = {}) {
  const onConfirm = vi.fn();
  render(
    <I18nProvider locale="en">
      <ConfirmAction
        label="Delete key"
        title="Delete the stored key?"
        body="The raw value cannot be recovered."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        {...props}
      />
    </I18nProvider>,
  );
  return { onConfirm };
}

afterEach(cleanup);

describe('ConfirmAction', () => {
  it('does not render the dialog until the trigger is pressed', () => {
    renderConfirm();
    expect(screen.queryByText('Delete the stored key?')).toBeNull();
  });

  it('opens the dialog on the trigger and does not fire the action yet', () => {
    const { onConfirm } = renderConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Delete key' }));
    expect(screen.getByText('Delete the stored key?')).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('fires the action and closes when the confirm button is pressed', () => {
    const { onConfirm } = renderConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Delete key' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Delete the stored key?')).toBeNull();
  });

  it('closes without firing the action when cancelled', () => {
    const { onConfirm } = renderConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Delete key' }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete the stored key?')).toBeNull();
  });

  it('opens nothing while disabled', () => {
    renderConfirm({ disabled: true });
    fireEvent.click(screen.getByRole('button', { name: 'Delete key' }));
    expect(screen.queryByText('Delete the stored key?')).toBeNull();
  });
});
