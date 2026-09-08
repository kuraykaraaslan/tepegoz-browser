// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { coreDict } from '@tepegoz/i18n';
import { PanelHeader } from './panel-header';
import { agentDict } from './i18n';
import type { AgentHostApi, TokenUsageSnapshot } from './types';

/**
 * The token chip's hover breakdown (input vs output) used to be assembled from hardcoded English
 * fragments (`… in / … out (this run)`). It now renders from the parity-tested dict — the last
 * user-facing literal on the panel's own React surfaces (S8 "localized to the same bar").
 */

const a = agentDict.en;
const c = coreDict.en;
const api = {
  onAgentConversationsState: () => () => {},
  listAgentConversations: () => Promise.resolve([]),
} as unknown as AgentHostApi;

function renderHeader(tokens: TokenUsageSnapshot | null) {
  return render(
    <PanelHeader
      a={a}
      c={c}
      api={api}
      activeGroupId="g1"
      tokens={tokens}
      turnCount={1}
      logExported={false}
      exportError={null}
      onExportLog={vi.fn()}
      onNewTask={vi.fn()}
      onClose={vi.fn()}
      onSchedule={vi.fn()}
      onOpenConversation={vi.fn()}
      onDismissExportError={vi.fn()}
    />,
  );
}

afterEach(cleanup);

describe('PanelHeader — token chip breakdown is localized', () => {
  it('renders the per-run in/out split from the dict on the lifetime-quota chip', () => {
    renderHeader({
      inputTokens: 120,
      outputTokens: 34,
      totalTokens: 154,
      quota: 1000,
      lifetimeTokens: 500,
    });
    const expected = `${a.tokens}: ${a.tokenUsage.breakdownThisRun
      .replace('{in}', '120')
      .replace('{out}', '34')}`;
    expect(screen.getByTitle(expected)).toBeTruthy();
  });

  it('renders the in/out split from the dict on the plain running-total chip', () => {
    renderHeader({
      inputTokens: 7,
      outputTokens: 3,
      totalTokens: 10,
      quota: 0,
      lifetimeTokens: 0,
    });
    const expected = `${a.tokens}: ${a.tokenUsage.breakdown
      .replace('{in}', '7')
      .replace('{out}', '3')}`;
    expect(screen.getByTitle(expected)).toBeTruthy();
  });

  it('carries a first-class Turkish translation with the same placeholders', () => {
    const tr = agentDict.tr.tokenUsage;
    expect(tr.breakdown).toContain('{in}');
    expect(tr.breakdown).toContain('{out}');
    expect(tr.breakdownThisRun).toContain('{in}');
    expect(tr.breakdownThisRun).toContain('{out}');
    // Actually translated, not the English string left in place.
    expect(tr.breakdown).not.toBe(agentDict.en.tokenUsage.breakdown);
    expect(tr.breakdownThisRun).not.toBe(agentDict.en.tokenUsage.breakdownThisRun);
  });
});
