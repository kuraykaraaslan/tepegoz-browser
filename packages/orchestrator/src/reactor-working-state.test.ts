import { describe, it, expect } from 'vitest';
import type { AgentWorkingState } from '@tepegoz/shared-types';
import {
  COLLAPSED_WORKING_STATE_PLACEHOLDER,
  WORKING_STATE_HEADER,
  isWorkingStateEmpty,
  mergeWorkingState,
  renderWorkingState,
} from './reactor-working-state';

describe('isWorkingStateEmpty', () => {
  it('is true for {} and for all-empty arrays', () => {
    expect(isWorkingStateEmpty({})).toBe(true);
    expect(isWorkingStateEmpty({ selectedRecords: [], completedSubtasks: [] })).toBe(true);
  });

  it('is false as soon as any section has content', () => {
    expect(isWorkingStateEmpty({ completedSubtasks: ['added to cart'] })).toBe(false);
    expect(isWorkingStateEmpty({ openTabs: [{ id: 't1' }] })).toBe(false);
  });
});

describe('mergeWorkingState', () => {
  it('carries a prior field forward when the patch OMITS it (undefined)', () => {
    const prev: AgentWorkingState = { completedSubtasks: ['a'], selectedRecords: ['x'] };
    const merged = mergeWorkingState(prev, { completedSubtasks: ['a', 'b'] });
    expect(merged.completedSubtasks).toEqual(['a', 'b']); // provided → replaced
    expect(merged.selectedRecords).toEqual(['x']); // omitted → carried forward
  });

  it('lets the patch CLEAR a section with an explicit empty array', () => {
    const prev: AgentWorkingState = { pendingVerifications: ['confirm save'] };
    const merged = mergeWorkingState(prev, { pendingVerifications: [] });
    expect(merged.pendingVerifications).toEqual([]);
  });

  it('supports a full-snapshot re-emit (every field provided)', () => {
    const prev: AgentWorkingState = { completedSubtasks: ['a'] };
    const snapshot: AgentWorkingState = {
      openTabs: [{ id: 't1', title: 'Cart' }],
      selectedRecords: ['Blue Widget'],
      filledFields: [{ field: 'email', value: 'a@b.com' }],
      completedSubtasks: ['a', 'b'],
      pendingVerifications: ['confirm order'],
    };
    expect(mergeWorkingState(prev, snapshot)).toEqual(snapshot);
  });
});

describe('renderWorkingState', () => {
  it('emits one line per non-empty section, omitting empty ones', () => {
    const rendered = renderWorkingState({
      selectedRecords: ['Blue Widget ($5)'],
      completedSubtasks: ['added to cart'],
      pendingVerifications: ['confirm order placed'],
    });
    expect(rendered).toContain('- Selected: Blue Widget ($5)');
    expect(rendered).toContain('- Completed: added to cart');
    expect(rendered).toContain('- Pending verification: confirm order placed');
    expect(rendered).not.toContain('Open tabs');
    expect(rendered).not.toContain('Filled');
  });

  it('renders a filled field with and without a value', () => {
    expect(renderWorkingState({ filledFields: [{ field: 'email', value: 'a@b.com' }] })).toContain(
      '- Filled: email = a@b.com',
    );
    expect(renderWorkingState({ filledFields: [{ field: 'agree' }] })).toContain('- Filled: agree');
  });

  it('renders a tab with its id and title', () => {
    expect(renderWorkingState({ openTabs: [{ id: 't1', title: 'Checkout' }] })).toContain('- Open tabs: [t1] Checkout');
  });
});

describe('constants', () => {
  it('the header names the ledger and the collapse placeholder is distinct', () => {
    expect(WORKING_STATE_HEADER).toContain('Working state');
    expect(COLLAPSED_WORKING_STATE_PLACEHOLDER).not.toEqual(WORKING_STATE_HEADER);
  });
});
