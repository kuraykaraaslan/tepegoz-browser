// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import type { ProcessSnapshot } from '@tepegoz/desktop-ipc';
import { ProcessPage } from './process-page';

function snapshot(): ProcessSnapshot {
  return {
    sampledAt: 1,
    rows: [
      { pid: 100, kind: 'browser', label: 'Browser', cpuPercent: 1.2, memoryBytes: 200 * 1024 * 1024 },
      { pid: 200, kind: 'gpu', label: 'GPU', cpuPercent: 0, memoryBytes: 80 * 1024 * 1024 },
      {
        pid: 300,
        kind: 'tab',
        label: 'Example',
        cpuPercent: 5,
        memoryBytes: 120 * 1024 * 1024,
        tabId: 't-1',
        discarded: false,
      },
      {
        pid: 0,
        kind: 'tab',
        label: 'Sleeping tab',
        cpuPercent: 0,
        memoryBytes: 0,
        tabId: 't-2',
        discarded: true,
      },
    ],
  };
}

function renderPage(over: Partial<Parameters<typeof ProcessPage>[0]> = {}) {
  const poll = vi.fn<() => Promise<ProcessSnapshot>>(() => Promise.resolve(snapshot()));
  const end = vi.fn<(tabId: string) => void>();
  render(
    <I18nProvider locale="en">
      <ProcessPage poll={poll} end={end} intervalMs={100000} {...over} />
    </I18nProvider>,
  );
  return { poll, end };
}

afterEach(cleanup);

describe('ProcessPage', () => {
  it('renders one row per process, kind-ordered, with the total row', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Example')).toBeDefined());
    const body = screen.getByRole('table').textContent ?? '';
    // browser → gpu → tab → sleeping tab, in that source order.
    expect(body.indexOf('Browser')).toBeLessThan(body.indexOf('GPU'));
    expect(body.indexOf('GPU')).toBeLessThan(body.indexOf('Example'));
    expect(body.indexOf('Example')).toBeLessThan(body.indexOf('Sleeping tab'));
    expect(screen.getByText('Total')).toBeDefined();
  });

  it('shows “—” for a discarded tab and no End-process button on it', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Sleeping tab')).toBeDefined());
    // Exactly one End-process button — the live tab, not the sleeping one, not the infra rows.
    expect(screen.getAllByRole('button', { name: 'End process' })).toHaveLength(1);
    expect(screen.getByText('—')).toBeDefined();
  });

  it('ends the right tab when End process is clicked', async () => {
    const { end } = renderPage();
    await waitFor(() => expect(screen.getByText('Example')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'End process' }));
    expect(end).toHaveBeenCalledWith('t-1');
  });

  it('re-polls when the manual refresh control is clicked', async () => {
    const { poll } = renderPage();
    await waitFor(() => expect(poll).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
    await waitFor(() => expect(poll).toHaveBeenCalledTimes(2));
  });
});
