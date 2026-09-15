// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { coreDict } from '@tepegoz/i18n';
import { PanelModals } from './panel-modals';
import { agentDict } from './i18n';
import type { AgentPlanPreview } from './types';

/**
 * The plan-preview modal's per-step declared-danger-class badge, "sites touched" line, and
 * "guaranteed approvals" count (Phase 7 "Pre-flight Cost & Risk Contract" — the corners achievable
 * before any step runs).
 */
function show(
  steps: AgentPlanPreview['steps'],
  sites: string[] = [],
  guaranteedApprovals = 0,
) {
  const preview: AgentPlanPreview = {
    runId: 'run-1',
    groupId: 'g1',
    planId: 'plan-1',
    goal: 'Buy milk',
    steps,
    sites,
    guaranteedApprovals,
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

describe('the plan-preview modal shows which sites the plan will touch', () => {
  it('lists the sites when the plan names any', () => {
    show([{ id: 's1', tool: 'nav', rationale: 'go' }], ['a.example', 'b.example']);
    expect(screen.getByText('Sites this plan will touch:')).toBeDefined();
    expect(screen.getByText(/a\.example, b\.example/)).toBeDefined();
  });

  it('shows no sites line at all when nothing could be identified', () => {
    show([{ id: 's1', tool: 'nav', rationale: 'go' }], []);
    expect(screen.queryByText('Sites this plan will touch:')).toBeNull();
  });
});

describe('the plan-preview modal shows a floor count of guaranteed approvals', () => {
  it('shows the count when at least one step is guaranteed to need approval', () => {
    show([{ id: 's1', tool: 'files_delete_item', rationale: 'clean up' }], [], 2);
    expect(screen.getByText('Steps that will always need your approval:')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
  });

  it('shows no line at all when the count is zero — this field is a FLOOR, so "0" would misleadingly read as "nothing will ask for approval" when other prompts can still fire', () => {
    show([{ id: 's1', tool: 'nav', rationale: 'go' }], [], 0);
    expect(screen.queryByText('Steps that will always need your approval:')).toBeNull();
  });
});
