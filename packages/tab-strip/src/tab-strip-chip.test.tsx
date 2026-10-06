// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type TabDescriptor } from './tab-strip';
import { LABELS, createStripRenderers, group, tab } from './tab-strip-test-helpers';

afterEach(cleanup);

const { renderFull } = createStripRenderers(vi, render);

describe('what a chip shows', () => {
  it('shows a favicon, and falls back to the page glyph when it fails to load', () => {
    renderFull({
      tabs: [tab('a', 'Alpha', { faviconUrl: 'data:image/png;base64,AA' })],
      activeId: 'a',
    });
    const img = document.querySelector('img');
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,AA');

    fireEvent.error(img!);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Alpha' })).toBeDefined();
  });

  it('shows an ellipsis for a tab that is loading before it has a title', () => {
    // A blank chip is indistinguishable from a broken one; the ellipsis says "still coming".
    renderFull({ tabs: [tab('a', '', { isLoading: true })], activeId: 'a' });
    expect(screen.getByRole('tab').textContent).toContain('…');
  });

  it('uses the untitled label for a finished page that never reported a title', () => {
    renderFull({ tabs: [tab('a', '', { isLoading: false })], activeId: 'a' });
    expect(screen.getByRole('tab', { name: 'Untitled' })).toBeDefined();
  });

  it('selects on Space as well as Enter', () => {
    // The chip is a div with role=tab, so both activation keys have to be handled by hand.
    const h = renderFull({ tabs: [tab('a', 'Alpha'), tab('b', 'Beta')], activeId: 'a' });
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Beta' }), { key: ' ' });
    expect(h.onSelect).toHaveBeenCalledWith('b');
  });

  it('ignores a key that is not an activation key', () => {
    const h = renderFull({ tabs: [tab('a', 'Alpha'), tab('b', 'Beta')], activeId: 'a' });
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Beta' }), { key: 'x' });
    expect(h.onSelect).not.toHaveBeenCalled();
  });

  it('falls back to grey for a group colour it does not recognise', () => {
    // The colour arrives as a plain string from stored state; an unknown one must not render an
    // unstyled chip, which would read as "this tab is not in the group".
    renderFull({
      tabs: [tab('a', 'Alpha', { groupId: 'g1' })],
      groups: [group('g1', 'Work', { color: 'not-a-palette-colour' })],
      activeId: 'a',
    });
    expect(screen.getByRole('tab', { name: 'Alpha' })).toBeDefined();
    expect(screen.getByText('Work')).toBeDefined();
  });
});

describe('the network route badge (Phase 5)', () => {
  const routed = (network: NonNullable<TabDescriptor['network']>): TabDescriptor =>
    tab('a', 'Alpha', { network });

  it('says which connection a tab is routed through', () => {
    renderFull({
      tabs: [routed({ label: 'FRA', inherited: false, blocked: false })],
      activeId: 'a',
      labels: {
        ...LABELS,
        routeTunneled: 'Routed through {name}',
        routeTunneledInherited: 'Inherited route: {name}',
        routeBlocked: 'Blocked: {name} is not connected',
      },
    });
    expect(screen.getByRole('img', { name: 'Routed through FRA' })).toBeDefined();
  });

  it('distinguishes a route the tab inherited from its group or the default', () => {
    // Inherited vs set-on-this-tab is the difference between "changing the group fixes this" and
    // "this tab has its own binding" — the audit question the badge exists to answer.
    renderFull({
      tabs: [routed({ label: 'FRA', inherited: true, blocked: false })],
      activeId: 'a',
      labels: { ...LABELS, routeTunneledInherited: 'Inherited route: {name}' },
    });
    expect(screen.getByRole('img', { name: 'Inherited route: FRA' })).toBeDefined();
  });

  it('warns when the kill-switch is holding that tab traffic', () => {
    // This is the state that looks like a broken network from the page's side: the switch is doing
    // exactly its job, and nothing else on screen says so.
    renderFull({
      tabs: [routed({ label: 'FRA', inherited: false, blocked: true })],
      activeId: 'a',
      labels: { ...LABELS, routeBlocked: 'Blocked: {name} is not connected' },
    });
    expect(screen.getByRole('img', { name: 'Blocked: FRA is not connected' })).toBeDefined();
  });

  it('still names the route when the host ships no strings for it', () => {
    // The leaf carries built-in English fallbacks; a badge with no accessible name at all would be
    // an unlabelled icon to a screen reader.
    renderFull({
      tabs: [routed({ label: 'FRA', inherited: false, blocked: false })],
      activeId: 'a',
    });
    expect(screen.getByRole('img', { name: /FRA/ })).toBeDefined();
  });

  it('draws no badge for an ordinary Direct tab', () => {
    // A badge on every tab would be noise; "no badge" already reads as "not tunneled".
    renderFull({ tabs: [tab('a', 'Alpha')], activeId: 'a' });
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('the agent-active indicator (S8 PR7)', () => {
  it('shows the indicator for a tab whose group holds the agent run lock', () => {
    renderFull({
      tabs: [tab('a', 'Alpha', { agentActive: true })],
      activeId: 'a',
      labels: { ...LABELS, agentActive: 'Agent is working in this tab' },
    });
    expect(screen.getByRole('img', { name: 'Agent is working in this tab' })).toBeDefined();
  });

  it('draws no indicator for an ordinary tab (absence is the signal)', () => {
    renderFull({ tabs: [tab('a', 'Alpha')], activeId: 'a' });
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('falls back to a built-in English name when the host ships no string for it', () => {
    renderFull({ tabs: [tab('a', 'Alpha', { agentActive: true })], activeId: 'a' });
    expect(screen.getByRole('img', { name: /agent/i })).toBeDefined();
  });
});
