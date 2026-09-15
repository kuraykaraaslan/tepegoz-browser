// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { coreDict } from '@tepegoz/i18n';
import { PanelModals } from './panel-modals';
import { agentDict } from './i18n';
import type { AgentPlanPreview } from './types';

/**
 * The plan-preview modal's per-step declared-danger-class badge (Phase 7 "Pre-flight Cost & Risk
 * Contract" — the "highest danger-class node" half, visible before any step runs).
 */
function show(steps: AgentPlanPreview['steps']) {
  const preview: AgentPlanPreview = {
    runId: 'run-1',
    groupId: 'g1',
    planId: 'plan-1',
    goal: 'Buy milk',
    steps,
  };
  render(
    <PanelModals
      a={agentDict.en}
      c={coreDict.en}
      planPreview={preview}
      approval={null}
      skipIds={new Set()}
      onRespondPlan={vi.fn()}
      onToggleStep={vi.fn()}
      onRespond={vi.fn()}
    />,
  );
}

afterEach(cleanup);

describe('the plan-preview modal shows each step’s declared danger class', () => {
  it('labels a destructive step', () => {
    show([{ id: 's1', tool: 'files_delete_item', rationale: 'clean up', dangerClass: 'destructive' }]);
    expect(screen.getByText('Destructive')).toBeDefined();
  });

  it('labels a financial step', () => {
    show([{ id: 's1', tool: 'payments_send_money', rationale: 'pay', dangerClass: 'financial' }]);
    expect(screen.getByText('Financial')).toBeDefined();
  });

  it('shows no badge for a read-only step — a badge on every step trains the user to ignore it', () => {
    show([{ id: 's1', tool: 'browser_get_page', rationale: 'look', dangerClass: 'read' }]);
    expect(screen.queryByText('Read-only')).toBeNull();
  });

  it('shows no badge when the tool did not resolve in the registry (dangerClass absent)', () => {
    show([{ id: 's1', tool: 'unregistered_tool', rationale: 'unknown' }]);
    expect(screen.queryByText('Destructive')).toBeNull();
    expect(screen.queryByText('Financial')).toBeNull();
    expect(screen.queryByText('Changes something')).toBeNull();
  });
});
