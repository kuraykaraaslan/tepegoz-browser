// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { TransferActivityPopup } from './TransferActivityPopup';
import {
  NOW,
  bridge,
  download,
  installTransferPopupHooks,
  rowTitles,
} from './TransferActivityPopup.testkit';

/**
 * Transfer popup — its own plumbing: locale resolution, live subscriptions (and unsubscribing from BOTH
 * channels on unmount), the bridge failing, and size/time formatting across every unit.
 * Shared bridge and fixtures: `TransferActivityPopup.testkit.tsx`.
 */

stubJsdomLayout();
installTransferPopupHooks();

describe('locale resolution', () => {
  it('resolves the stored tr locale from preferences', async () => {
    bridge.locale = 'tr';
    render(<TransferActivityPopup />);
    expect(await screen.findByText('Aktarımlar')).toBeTruthy();
  });

  it('falls back through resolveLocale when the stored locale is neither en nor tr', async () => {
    bridge.locale = 'de';
    render(<TransferActivityPopup />);
    expect(await screen.findByText('Transfers')).toBeTruthy();
  });
});

describe('live updates', () => {
  it('replaces the list when the main process pushes new download state', async () => {
    render(<TransferActivityPopup />);
    await waitFor(() => {
      expect(bridge.pushDownloads).not.toBeNull();
    });

    bridge.pushDownloads?.({ items: [download({ filename: 'pushed.pdf' })] });

    await waitFor(() => {
      expect(rowTitles()).toEqual(['pushed.pdf']);
    });
  });

  it('unsubscribes from BOTH channels when the popup goes away', async () => {
    const view = render(<TransferActivityPopup />);
    await waitFor(() => {
      expect(bridge.pushUploads).not.toBeNull();
    });

    view.unmount();

    // A popup window is opened and closed all day; one leaked listener is a warning per close forever.
    expect(bridge.offDownloads).toBe(1);
    expect(bridge.offUploads).toBe(1);
  });
});

describe('when the bridge is not there', () => {
  it('renders the empty state rather than a blank window', async () => {
    bridge.downloads = { ok: false, items: [] };
    bridge.uploads = { ok: false, items: [] };

    render(<TransferActivityPopup />);

    await waitFor(() => {
      expect(screen.getByText('No downloads or uploads yet')).toBeTruthy();
    });
  });

  it('still renders its list when the preferences fetch rejects', async () => {
    bridge.prefsOk = false;
    bridge.downloads.items = [download({ filename: 'anyway.pdf' })];

    render(<TransferActivityPopup />);

    await waitFor(() => {
      expect(rowTitles()).toEqual(['anyway.pdf']);
    });
  });
});

describe('size and time formatting across every unit', () => {
  it('reports a multi-gigabyte transfer in GB', async () => {
    bridge.downloads.items = [
      download({ status: 'in_progress', receivedBytes: 1024, totalBytes: 3 * 1024 * 1024 * 1024 }),
    ];

    render(<TransferActivityPopup />);

    await waitFor(() => expect(screen.getByText(/3\.0 GB/)).toBeTruthy());
  });

  it('prints an hours-old transfer in hours and a days-old one in days', async () => {
    bridge.downloads.items = [
      download({ id: 'd-hr', filename: 'hours.pdf', updatedAt: NOW - 3 * 3_600_000 }),
      download({ id: 'd-day', filename: 'days.pdf', updatedAt: NOW - 4 * 86_400_000 }),
    ];

    render(<TransferActivityPopup />);

    await waitFor(() => expect(rowTitles()).toEqual(['hours.pdf', 'days.pdf']));
    // both relative-time branches (hour, day) are exercised by rendering these two rows
    expect(screen.getByText(/3 hr/)).toBeTruthy();
    expect(screen.getByText(/4 days? ago/)).toBeTruthy();
  });
});
