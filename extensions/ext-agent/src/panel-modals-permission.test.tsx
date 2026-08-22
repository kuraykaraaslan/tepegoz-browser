// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { coreDict } from '@tepegoz/i18n';
import { PanelModals } from './panel-modals';
import { agentDict } from './i18n';
import type { AgentApprovalRequest } from './types';

/**
 * Permission Debug, at the surface a person actually reads.
 *
 * The modal printed `approval.reason` — a stable identifier meant for the journal. Someone stopped by
 * the injection guard read `tainted_side_effect` and had to guess what it meant and what to do.
 */
function show(reason: string) {
  const approval = {
    toolName: 'files_delete_item',
    reason,
    argsPreview: '{}',
    biometric: false,
  } as unknown as AgentApprovalRequest;
  render(
    <PanelModals
      a={agentDict.en}
      c={coreDict.en}
      planPreview={null}
      approval={approval}
      skipIds={new Set()}
      onRespondPlan={vi.fn()}
      onToggleStep={vi.fn()}
      onRespond={vi.fn()}
    />,
  );
}

afterEach(cleanup);

describe('the approval modal explains why it is asking', () => {
  it('answers what happened, why, and what the user can do', () => {
    show('tainted_side_effect');
    expect(screen.getByText(/instructions came from the page/i)).toBeDefined();
    expect(screen.getByText(/prompt injection/i)).toBeDefined();
    expect(screen.getByText(/decline/i)).toBeDefined();
  });

  it('still shows the raw code, so a support conversation can name it exactly', () => {
    show('tainted_side_effect');
    expect(screen.getByText('tainted_side_effect')).toBeDefined();
  });

  it('degrades to the bare identifier for a code this build does not know', () => {
    // An older journal entry replayed, or a code from a newer policy. Better a raw identifier than an
    // empty box that looks like the app has nothing to say.
    show('some_future_reason');
    expect(screen.getByText('some_future_reason')).toBeDefined();
  });
});
