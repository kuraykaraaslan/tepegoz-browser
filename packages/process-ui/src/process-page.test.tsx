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
      {
        pid: 100,
        kind: 'browser',
        label: 'Browser',
        cpuPercent: 1.2,
        memoryBytes: 200 * 1024 * 1024,
      },
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

  /** Character offset of a row's label in the rendered table — i.e. its visual position. */
  function pos(label: string): number {
    const body = screen.getByRole('table').textContent ?? '';
    const at = body.indexOf(label);
    expect(at).toBeGreaterThanOrEqual(0);
    return at;
  }

  it('sorts by a column when its header is clicked, and reverses on a second click', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Example')).toBeDefined());

    // CPU: Browser 1.2, GPU 0, Example 5, Sleeping 0 → first click is descending.
    fireEvent.click(screen.getByRole('button', { name: /CPU/ }));
    expect(pos('Example')).toBeLessThan(pos('Browser'));
    expect(pos('Browser')).toBeLessThan(pos('GPU'));

    // Second click flips to ascending — Example (heaviest CPU) now last.
    fireEvent.click(screen.getByRole('button', { name: /CPU/ }));
    expect(pos('GPU')).toBeLessThan(pos('Browser'));
    expect(pos('Browser')).toBeLessThan(pos('Example'));
  });

  it('keeps equal-key rows in their incoming order (stable)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Example')).toBeDefined());
    // GPU and Sleeping tab both report CPU 0; GPU comes first in the snapshot, so it stays first.
    fireEvent.click(screen.getByRole('button', { name: /CPU/ }));
    expect(pos('GPU')).toBeLessThan(pos('Sleeping tab'));
  });

  it('reflects the sort in aria-sort on the header cell', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Example')).toBeDefined());
    const cpuHeader = screen.getByRole('columnheader', { name: /CPU/ });
    const memHeader = screen.getByRole('columnheader', { name: /Memory/ });
    expect(cpuHeader.getAttribute('aria-sort')).toBe('none');

    fireEvent.click(screen.getByRole('button', { name: /CPU/ }));
    expect(cpuHeader.getAttribute('aria-sort')).toBe('descending');
    expect(memHeader.getAttribute('aria-sort')).toBe('none');

    fireEvent.click(screen.getByRole('button', { name: /CPU/ }));
    expect(cpuHeader.getAttribute('aria-sort')).toBe('ascending');
  });

  it('keeps the chosen sort across a data refresh', async () => {
    const first = snapshot();
    const second = snapshot();
    // Example's CPU collapses on the next poll; a default re-sort would drop it, the chosen one holds.
    second.rows = second.rows.map((r) => (r.label === 'Example' ? { ...r, cpuPercent: 0.1 } : r));
    const poll = vi
      .fn<() => Promise<ProcessSnapshot>>()
      .mockResolvedValueOnce(first)
      .mockResolvedValue(second);
    const end = vi.fn<(tabId: string) => void>();
    render(
      <I18nProvider locale="en">
        <ProcessPage poll={poll} end={end} intervalMs={100000} />
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.getByText('Example')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /CPU/ }));
    fireEvent.click(screen.getByRole('button', { name: /CPU/ })); // ascending
    fireEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
    await waitFor(() => expect(poll).toHaveBeenCalledTimes(2));

    // Still ascending by CPU after the new data landed: GPU 0, Sleeping 0, Example 0.1, Browser 1.2.
    const cpuHeader = screen.getByRole('columnheader', { name: /CPU/ });
    expect(cpuHeader.getAttribute('aria-sort')).toBe('ascending');
    expect(pos('GPU')).toBeLessThan(pos('Sleeping tab'));
    expect(pos('Sleeping tab')).toBeLessThan(pos('Example'));
    expect(pos('Example')).toBeLessThan(pos('Browser'));
  });
});
