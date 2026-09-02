// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { AIAdaptorAction } from '@tepegoz/desktop-ipc';
import { ToolMetadataBadges } from './settings-tool-metadata';

/**
 * The little badge row beside a tool in Settings → Cost & performance. Rules under test: the first
 * badge is the category, falling back to the raw source when there is no category; the "schema" badge
 * appears only when the action actually declares a non-empty input schema; the idempotency badge
 * appears only when the action requires an idempotency key.
 */

const labels = { schema: 'schema', idempotency: 'idempotency-key' };

function action(over: Partial<AIAdaptorAction>): AIAdaptorAction {
  return {
    id: 't1',
    description: '',
    source: 'browser',
    requiresIdempotencyKey: false,
    ...over,
  } as AIAdaptorAction;
}

afterEach(cleanup);

describe('ToolMetadataBadges', () => {
  it('shows the category when present', () => {
    render(<ToolMetadataBadges action={action({ category: 'navigation' })} labels={labels} />);
    expect(screen.getByText('navigation')).toBeTruthy();
  });

  it('falls back to the source when there is no category', () => {
    render(<ToolMetadataBadges action={action({ category: undefined, source: 'files' as never })} labels={labels} />);
    expect(screen.getByText('files')).toBeTruthy();
  });

  it('shows the schema badge for a non-empty object schema', () => {
    render(
      <ToolMetadataBadges action={action({ inputSchema: { type: 'object' } })} labels={labels} />,
    );
    expect(screen.getByText('schema')).toBeTruthy();
  });

  it('shows the schema badge for a non-object truthy schema', () => {
    render(<ToolMetadataBadges action={action({ inputSchema: 'ref' })} labels={labels} />);
    expect(screen.getByText('schema')).toBeTruthy();
  });

  it('hides the schema badge for an empty object, null, or undefined schema', () => {
    for (const inputSchema of [{}, null, undefined]) {
      const { unmount } = render(
        <ToolMetadataBadges action={action({ inputSchema })} labels={labels} />,
      );
      expect(screen.queryByText('schema')).toBeNull();
      unmount();
    }
  });

  it('shows the idempotency badge only when a key is required', () => {
    const { rerender } = render(
      <ToolMetadataBadges action={action({ requiresIdempotencyKey: false })} labels={labels} />,
    );
    expect(screen.queryByText('idempotency-key')).toBeNull();

    rerender(
      <ToolMetadataBadges action={action({ requiresIdempotencyKey: true })} labels={labels} />,
    );
    expect(screen.getByText('idempotency-key')).toBeTruthy();
  });
});
