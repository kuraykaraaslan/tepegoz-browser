// @vitest-environment jsdom
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PanelThread } from './panel-thread';
import { agentDict } from './i18n';
import type { AgentHostApi } from './types';
import type { Turn } from './panel-state';

/**
 * Message-level copy (S8 A4). Only code blocks were copyable; now the user's prompt and each prose
 * response carry a copy button that writes the message text to the clipboard.
 */

const a = agentDict.en;
const api = { createTab: vi.fn(), openAgentFile: vi.fn() } as unknown as AgentHostApi;

function turn(over: Partial<Turn> = {}): Turn {
  return {
    id: 't1',
    prompt: 'Book me a flight to Rome',
    runId: 'r1',
    events: [
      {
        runId: 'r1',
        groupId: 'g1',
        kind: 'done',
        message: 'Booked it — confirmation ABC123.',
        ts: 1,
      },
    ],
    ...over,
  };
}

function renderThread(turns: Turn[] = [turn()]) {
  return render(
    <PanelThread
      a={a}
      api={api}
      listRef={createRef()}
      turns={turns}
      running={false}
      liveDelta=""
      openReasoning={new Set()}
      openSteps={new Set()}
      onToggleReasoning={vi.fn()}
      onToggleSteps={vi.fn()}
    />,
  );
}

afterEach(cleanup);

describe('PanelThread — message-level copy', () => {
  it('copies the user prompt, and shows a brief confirmation', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    renderThread();
    // The prompt's copy button is the first one in document order.
    const btn = screen.getAllByRole('button', { name: a.thread.copyMessage })[0]!;
    fireEvent.click(btn);

    expect(writeText).toHaveBeenCalledWith('Book me a flight to Rome');
    await waitFor(() => expect(screen.getByRole('button', { name: a.thread.copied })).toBeTruthy());
    vi.unstubAllGlobals();
  });

  it('copies a prose response message', () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    renderThread();
    // Two copy buttons now: the prompt's and the response's.
    const buttons = screen.getAllByRole('button', { name: a.thread.copyMessage });
    expect(buttons.length).toBe(2);
    fireEvent.click(buttons[1]!);
    expect(writeText).toHaveBeenCalledWith('Booked it — confirmation ABC123.');
    vi.unstubAllGlobals();
  });

  it('does not throw when the clipboard API is unavailable', () => {
    vi.stubGlobal('navigator', {});
    renderThread();
    expect(() =>
      fireEvent.click(screen.getAllByRole('button', { name: a.thread.copyMessage })[0]!),
    ).not.toThrow();
    vi.unstubAllGlobals();
  });

  it('renders no copy button when there are no turns', () => {
    renderThread([]);
    expect(screen.queryByRole('button', { name: a.thread.copyMessage })).toBeNull();
  });

  it('keeps the user prompt readable next to its copy button', () => {
    renderThread();
    const bubble = screen.getByLabelText(a.thread.you);
    expect(
      within(bubble.parentElement as HTMLElement).getByText('Book me a flight to Rome'),
    ).toBeTruthy();
  });
});
