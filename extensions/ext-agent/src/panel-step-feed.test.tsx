// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
