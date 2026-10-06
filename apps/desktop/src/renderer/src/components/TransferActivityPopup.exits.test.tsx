// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { INTERNAL_DOWNLOADS_URL, INTERNAL_UPLOADS_URL } from '@tepegoz/desktop-ipc';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { TransferActivityPopup } from './TransferActivityPopup';
import { bridge, installTransferPopupHooks } from './TransferActivityPopup.testkit';

/**
 * Transfer popup — the ways out: Escape, the close button, and the footer links to the full pages.
 * Shared bridge and fixtures: `TransferActivityPopup.testkit.tsx`.
 */

stubJsdomLayout();
installTransferPopupHooks();

describe('the ways out', () => {
  it('closes on Escape', async () => {
    render(<TransferActivityPopup />);
    await waitFor(() => {
      expect(bridge.pushDownloads).not.toBeNull();
    });

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(bridge.closed).toBe(1);
  });

  it('stops listening for Escape once unmounted', async () => {
    const view = render(<TransferActivityPopup />);
    await waitFor(() => {
      expect(bridge.pushDownloads).not.toBeNull();
    });

    view.unmount();
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(bridge.closed).toBe(0);
  });

  it('navigates to the full uploads page AND closes, so the popup does not linger over it', async () => {
    render(<TransferActivityPopup />);
    await waitFor(() => {
      expect(bridge.pushDownloads).not.toBeNull();
    });

    const footer = screen.getAllByRole('button').at(-1);
    fireEvent.click(footer as HTMLElement);

    expect(bridge.navigated).toEqual([INTERNAL_UPLOADS_URL]);
    expect(bridge.closed).toBe(1);
  });

  it('navigates to the full downloads page too', async () => {
    render(<TransferActivityPopup />);
    await waitFor(() => {
      expect(bridge.pushDownloads).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Full download history' }));

    expect(bridge.navigated).toEqual([INTERNAL_DOWNLOADS_URL]);
    expect(bridge.closed).toBe(1);
  });

  it('closes via its own close button', async () => {
    render(<TransferActivityPopup />);
    await waitFor(() => {
      expect(bridge.pushDownloads).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close transfers' }));

    expect(bridge.closed).toBe(1);
    expect(bridge.navigated).toHaveLength(0);
  });
});
