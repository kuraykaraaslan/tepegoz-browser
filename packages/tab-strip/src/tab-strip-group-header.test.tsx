// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TabStrip, type TabGroupDescriptor } from './tab-strip';
import { createStripRenderers, group, tab } from './tab-strip-test-helpers';

afterEach(cleanup);

const { renderFull } = createStripRenderers(vi, render);

describe('the group header', () => {
  const withGroup = (
    g: Partial<TabGroupDescriptor>,
    over: Partial<Parameters<typeof TabStrip>[0]> = {},
  ) =>
    renderFull({
      tabs: [tab('m', 'Member', { groupId: 'g1' })],
      groups: [group('g1', 'Work', g)],
      activeId: 'm',
      ...over,
    });

  it('names an unnamed group by the label rather than showing a blank pill', () => {
    withGroup({ name: '   ' });
    expect(screen.getByText('Group')).toBeDefined();
  });

  it('shows the member count only while collapsed, when the tabs are not there to count', () => {
    withGroup({ collapsed: false });
    expect(screen.queryByText('1')).toBeNull();

    cleanup();
    withGroup({ collapsed: true });
    expect(screen.getByText('1')).toBeDefined();
  });

  it('shows no count for a collapsed group with nothing in it', () => {
    renderFull({
      tabs: [tab('a', 'Loose')],
      groups: [group('g1', 'Empty', { collapsed: true })],
      activeId: 'a',
    });
    // the header only renders for a run of members, so an empty group contributes no pill at all
    expect(screen.queryByText('Empty')).toBeNull();
  });

  it('escapes a rename without writing it', () => {
    const h = withGroup({});
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Toggle group' }));

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Discarded' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(h.onRenameGroup).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Work')).toBeDefined();
  });

  it('commits a rename on blur, so clicking away keeps the edit instead of losing it', () => {
    const h = withGroup({});
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Toggle group' }));

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '  Research  ' } });
    fireEvent.blur(input);

    // trimmed: a name that is only visibly different by whitespace is the same name
    expect(h.onRenameGroup).toHaveBeenCalledWith('g1', 'Research');
  });

  it('ignores a key that is neither Enter nor Escape', () => {
    const h = withGroup({});
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Toggle group' }));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'a' });

    expect(h.onRenameGroup).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toBeDefined();
  });

  it('keeps a click inside the rename box from reaching the pill behind it', () => {
    // The pill toggles collapse on click. Without stopPropagation, clicking into the field to place
    // the cursor would fold the group away underneath the editor.
    const h = withGroup({});
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Toggle group' }));
    fireEvent.click(screen.getByRole('textbox'));

    expect(h.onToggleGroupCollapsed).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toBeDefined();
  });

  it('re-seeds the editor from the group when it is reopened', () => {
    // A draft abandoned with Escape must not come back the next time the editor opens.
    withGroup({});
    const toggle = (): HTMLElement => screen.getByRole('button', { name: 'Toggle group' });

    fireEvent.doubleClick(toggle());
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Abandoned' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });

    fireEvent.doubleClick(toggle());
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('Work');
  });

  it('shows the route shield beside the name when the group is bound to a connection', () => {
    // The route sits next to the name because it is a property of the group the way its colour is —
    // and a group is the scope people actually bind a VPN to.
    withGroup({ network: { vpn: 'up', tor: null, label: 'FRA' } });
    expect(screen.getByRole('img', { name: /FRA/ })).toBeDefined();
  });

  it('shows no shield for a Direct group', () => {
    withGroup({});
    expect(screen.queryByRole('img')).toBeNull();
  });
});
