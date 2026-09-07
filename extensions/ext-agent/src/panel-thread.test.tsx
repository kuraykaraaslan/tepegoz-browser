// @vitest-environment jsdom
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PanelThread } from './panel-thread';
import { agentDict } from './i18n';
import type { AgentHostApi } from './types';
import type { Turn } from './panel-state';

/**
 * Transcript adornments (S8): message-level copy (A4), the skill pill (B2), the run-config read-back
 * line (B4), and the permanent approval-history cards (B3). Each is display-only — a record of what a
 * run used or what the user allowed, so scrolling back a long transcript does not send you to the
 * journal.
 */

const a = agentDict.en;
const api = { createTab: vi.fn(), openAgentFile: vi.fn() } as unknown as AgentHostApi;
const onRetry = vi.fn();

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
      onRetry={onRetry}
    />,
  );
}

afterEach(() => {
  cleanup();
  onRetry.mockClear();
});

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

describe('PanelThread — approval history cards (B3)', () => {
  it('leaves a permanent card for each granted approval, with the remember / scope flags', () => {
    renderThread([
      turn({
        approvals: [
          { tool: 'browser_export_pdf', ts: 1, remembered: false, scoped: false },
          { tool: 'files_delete_item', ts: 2, remembered: true, scoped: true },
        ],
      }),
    ]);
    expect(screen.getByText(a.thread.allowed.replace('{tool}', 'browser_export_pdf'))).toBeTruthy();
    const second = screen.getByText(a.thread.allowed.replace('{tool}', 'files_delete_item'));
    expect(second.textContent).toContain(a.thread.allowedRemembered);
    expect(second.textContent).toContain(a.thread.allowedScoped);
  });

  it('renders nothing for a turn with no approvals', () => {
    renderThread([turn({ approvals: [] })]);
    expect(screen.queryByText(a.thread.allowed.replace('{tool}', 'browser_export_pdf'))).toBeNull();
  });
});

describe('PanelThread — humanized tool intent in the reasoning transcript (A3)', () => {
  const reasoningTurn = () =>
    turn({
      events: [
        {
          runId: 'r1',
          groupId: 'g1',
          kind: 'plan',
          message: 'Goal: find the cheapest fare',
          ts: 1,
        },
        {
          runId: 'r1',
          groupId: 'g1',
          kind: 'decision',
          message: 'browser_get_page',
          detail: 'need the fare table',
          ts: 2,
        },
        {
          runId: 'r1',
          groupId: 'g1',
          kind: 'decision',
          message: 'mcp_frobnicate_widget',
          detail: 'custom tool',
          ts: 3,
        },
        { runId: 'r1', groupId: 'g1', kind: 'done', message: 'done', ts: 4 },
      ],
    });

  function renderOpen() {
    return render(
      <PanelThread
        a={a}
        api={api}
        listRef={createRef()}
        turns={[reasoningTurn()]}
        running={false}
        liveDelta=""
        openReasoning={new Set(['t1'])}
        openSteps={new Set()}
        onToggleReasoning={vi.fn()}
        onToggleSteps={vi.fn()}
        onRetry={onRetry}
      />,
    );
  }

  it('shows a decision as its intent, with the raw tool id on hover', () => {
    renderOpen();
    const line = screen.getByText('Reading the page');
    expect(line.getAttribute('title')).toBe('browser_get_page');
    // The bare id is not shown as the visible label.
    expect(screen.queryByText('browser_get_page')).toBeNull();
  });

  it('de-snakes an unrecognised tool id rather than inventing a label', () => {
    renderOpen();
    expect(screen.getByText('mcp frobnicate widget')).toBeTruthy();
  });

  it('leaves plan text untouched', () => {
    renderOpen();
    expect(screen.getByText('Goal: find the cheapest fare')).toBeTruthy();
  });
});

describe('PanelThread — Retry a failed turn (S8)', () => {
  const errorTurn = () =>
    turn({
      prompt: 'Summarise this page',
      events: [{ runId: 'r1', groupId: 'g1', kind: 'error', message: 'Something broke', ts: 1 }],
    });

  it('offers Retry on a turn whose last event is an error, and re-runs its prompt', () => {
    renderThread([errorTurn()]);
    fireEvent.click(screen.getByRole('button', { name: a.thread.retry }));
    expect(onRetry).toHaveBeenCalledWith('Summarise this page');
  });

  it('offers no Retry while a run is in progress', () => {
    render(
      <PanelThread
        a={a}
        api={api}
        listRef={createRef()}
        turns={[errorTurn()]}
        running
        liveDelta=""
        openReasoning={new Set()}
        openSteps={new Set()}
        onToggleReasoning={vi.fn()}
        onToggleSteps={vi.fn()}
        onRetry={onRetry}
      />,
    );
    expect(screen.queryByRole('button', { name: a.thread.retry })).toBeNull();
  });

  it('offers no Retry on a turn that ended cleanly', () => {
    renderThread([turn()]); // last event is a `done`
    expect(screen.queryByRole('button', { name: a.thread.retry })).toBeNull();
  });
});
