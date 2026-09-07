// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_AGENT_MAX_STEPS } from '@tepegoz/shared-types';
import { StepFeed } from './panel-step-feed';
import { agentDict } from './i18n';
import type { AgentEvent } from './types';

const a = agentDict.en;

const step = (kind: AgentEvent['kind'], message: string, ts: number): AgentEvent => ({
  runId: 'r1',
  groupId: 'g1',
  kind,
  message,
  ts,
});

afterEach(cleanup);

describe('StepFeed', () => {
  const steps = [
    step('step_start', 'browser_get_page: allow', 1),
    step('step_ok', 'browser_get_page ✓', 2),
    step('step_error', 'browser_update_page ✗', 3),
  ];

  it('renders nothing with no steps', () => {
    const { container } = render(
      <StepFeed
        steps={[]}
        open
        working={false}
        latestMessage={undefined}
        onToggle={vi.fn()}
        a={a}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the count in the header and every step when open', () => {
    render(
      <StepFeed
        steps={steps}
        open
        working={false}
        latestMessage={undefined}
        onToggle={vi.fn()}
        a={a}
      />,
    );
    expect(screen.getByText(`${a.progress} (3)`)).toBeTruthy();
    expect(screen.getByText('browser_get_page: allow')).toBeTruthy();
    expect(screen.getByText('browser_update_page ✗')).toBeTruthy();
  });

  it('collapses to the latest step inline while working', () => {
    render(
      <StepFeed
        steps={steps}
        open={false}
        working
        latestMessage="Reading the page"
        onToggle={vi.fn()}
        a={a}
      />,
    );
    expect(screen.getByText('· Reading the page')).toBeTruthy();
    // The individual step lines are hidden while collapsed.
    expect(screen.queryByText('browser_get_page: allow')).toBeNull();
  });

  it('marks the last step as running (pulsing) only while the turn is working', () => {
    const inFlight = [step('step_ok', 'browser_get_page ✓', 1), step('step_start', 'act', 2)];
    const { container, rerender } = render(
      <StepFeed steps={inFlight} open working latestMessage={undefined} onToggle={vi.fn()} a={a} />,
    );
    // Exactly one pulsing dot — the trailing in-flight step_start.
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(1);

    // Once the run stops, the same list has no running marker.
    rerender(
      <StepFeed
        steps={inFlight}
        open
        working={false}
        latestMessage={undefined}
        onToggle={vi.fn()}
        a={a}
      />,
    );
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(0);
  });

  it('does not mark a trailing step_ok as running', () => {
    const { container } = render(
      <StepFeed
        steps={[step('step_start', 'a', 1), step('step_ok', 'a ✓', 2)]}
        open
        working
        latestMessage={undefined}
        onToggle={vi.fn()}
        a={a}
      />,
    );
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(0);
  });

  it('shows the step budget against the default cap', () => {
    render(
      <StepFeed
        steps={steps}
        open
        working={false}
        latestMessage={undefined}
        onToggle={vi.fn()}
        a={a}
      />,
    );
    // One `step_start` in the fixture → "step 1 of 25", visible whether the feed is open or collapsed.
    expect(screen.getByText(`· step 1 of ${DEFAULT_AGENT_MAX_STEPS}`)).toBeTruthy();
  });

  it('counts one acting step per step_start, not per event', () => {
    const many = [
      step('step_start', 'a', 1),
      step('step_ok', 'a ✓', 2),
      step('step_start', 'b', 3),
      step('step_ok', 'b ✓', 4),
      step('step_start', 'c', 5),
    ];
    render(
      <StepFeed steps={many} open working latestMessage={undefined} onToggle={vi.fn()} a={a} />,
    );
    expect(screen.getByText(`· step 3 of ${DEFAULT_AGENT_MAX_STEPS}`)).toBeTruthy();
  });

  it('flags the budget when the run has reached the cap', () => {
    const capped = Array.from({ length: DEFAULT_AGENT_MAX_STEPS }, (_, i) =>
      step('step_start', `s${String(i)}`, i + 1),
    );
    render(
      <StepFeed
        steps={capped}
        open
        working={false}
        latestMessage={undefined}
        onToggle={vi.fn()}
        a={a}
      />,
    );
    const budget = screen.getByText(
      `· step ${DEFAULT_AGENT_MAX_STEPS} of ${DEFAULT_AGENT_MAX_STEPS}`,
    );
    expect(budget.className).toContain('text-amber-600');
  });

  it('falls back to terminal step events when no step_start was emitted', () => {
    const terminalOnly = [step('step_ok', 'a ✓', 1), step('step_error', 'b ✗', 2)];
    render(
      <StepFeed
        steps={terminalOnly}
        open
        working={false}
        latestMessage={undefined}
        onToggle={vi.fn()}
        a={a}
      />,
    );
    expect(screen.getByText(`· step 2 of ${DEFAULT_AGENT_MAX_STEPS}`)).toBeTruthy();
  });

  it('annotates a completed step with its wall time', () => {
    render(
      <StepFeed
        steps={[
          step('step_start', 'browser_get_page: allow', 1000),
          step('step_ok', 'browser_get_page ✓', 1400),
        ]}
        open
        working={false}
        latestMessage={undefined}
        onToggle={vi.fn()}
        a={a}
      />,
    );
    expect(screen.getByText('400ms')).toBeTruthy();
  });

  it('formats multi-second calls in seconds and rounds sub-second to 10ms', () => {
    const { rerender } = render(
      <StepFeed
        steps={[step('step_start', 'a', 0), step('step_ok', 'a ✓', 1234)]}
        open
        working={false}
        latestMessage={undefined}
        onToggle={vi.fn()}
        a={a}
      />,
    );
    expect(screen.getByText('1.2s')).toBeTruthy();
    rerender(
      <StepFeed
        steps={[step('step_start', 'a', 0), step('step_error', 'a ✗', 344)]}
        open
        working={false}
        latestMessage={undefined}
        onToggle={vi.fn()}
        a={a}
      />,
    );
    // step_error is timed too.
    expect(screen.getByText('340ms')).toBeTruthy();
  });

  it('shows no timing on a step_start with nothing after it', () => {
    render(
      <StepFeed
        steps={[step('step_ok', 'a ✓', 5), step('step_start', 'b', 10)]}
        open
        working
        latestMessage={undefined}
        onToggle={vi.fn()}
        a={a}
      />,
    );
    // Neither row can be paired into a duration → no ms/s annotation anywhere.
    expect(screen.queryByText(/^\d+(\.\d+)?(ms|s)$/)).toBeNull();
  });

  it('toggles on header click', () => {
    const onToggle = vi.fn();
    render(
      <StepFeed
        steps={steps}
        open={false}
        working={false}
        latestMessage={undefined}
        onToggle={onToggle}
        a={a}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
