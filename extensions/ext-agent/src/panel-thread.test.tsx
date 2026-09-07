// @vitest-environment jsdom
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PanelThread } from './panel-thread';
import { agentDict } from './i18n';
import type { AgentHostApi } from './types';
import type { Turn } from './panel-state';

/**
 * Transcript adornments: message-level copy (S8 A4) and the per-turn run-config read-back line
 * (S8 B4). Copy was code-blocks-only; the config line answers "which model / autonomy was this?"
 * when scrolling back a long run.
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

describe('PanelThread — run-config read-back (B4)', () => {
  it('shows the provider · model · autonomy the turn ran with', () => {
    renderThread([
      turn({
        config: {
          provider: 'anthropic',
          model: 'claude-sonnet-5',
          autonomy: 'act',
          effort: 'high',
        },
      }),
    ]);
    const line = screen.getByLabelText(a.thread.runConfig);
    expect(line.textContent).toContain('anthropic');
    expect(line.textContent).toContain('claude-sonnet-5');
    expect(line.textContent).toContain(a.autonomy.act.title);
  });

  it('shows the auto-routing label when no model is pinned', () => {
    renderThread([
      turn({ config: { provider: 'openai', model: '', autonomy: 'auto', effort: 'medium' } }),
    ]);
    expect(screen.getByLabelText(a.thread.runConfig).textContent).toContain(a.modelAuto);
  });

  it('renders no config line for a turn restored without one', () => {
    renderThread([turn()]);
    expect(screen.queryByLabelText(a.thread.runConfig)).toBeNull();
  });
});

describe('PanelThread — skill pill (B2)', () => {
  it('shows the name of the skill that produced a turn', () => {
    renderThread([turn({ skill: { id: 'sk1', name: 'Weekly invoice export' } })]);
    const pill = screen.getByLabelText(a.thread.skillUsed);
    expect(pill.textContent).toBe('Weekly invoice export');
  });

  it('shows the skill pill next to the run-config line when both are present', () => {
    renderThread([
      turn({
        skill: { id: 'sk1', name: 'Book a flight' },
        config: { provider: 'anthropic', model: '', autonomy: 'ask', effort: 'high' },
      }),
    ]);
    expect(screen.getByLabelText(a.thread.skillUsed)).toBeTruthy();
    expect(screen.getByLabelText(a.thread.runConfig)).toBeTruthy();
  });

  it('renders no pill for a plain turn', () => {
    renderThread([turn()]);
    expect(screen.queryByLabelText(a.thread.skillUsed)).toBeNull();
  });
});
