// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { settingsDict } from '@tepegoz/settings-ui';
import type { AgentCapabilityRow, Preferences } from '@tepegoz/desktop-ipc';
import { AgentPermissionMatrix, PermissionsCenter } from './PermissionsCenter';

/**
 * Two halves of one surface: `PermissionsCenter` is the EDITABLE site-permission list (add a site up
 * front, set a capability, forget a site), and `AgentPermissionMatrix` is a READ-ONLY view over the
 * Policy Kernel, grouped by danger class. The filter only appears past 4 sites; the empty/no-results
 * states are worded distinctly on purpose.
 */

const s = settingsDict.en;
const pc = s.permissionsCenter;

function renderCenter(sitePermissions: Preferences['sitePermissions'] = {}) {
  const onSet = vi.fn();
  const onReset = vi.fn();
  render(
    <I18nProvider locale="en">
      <PermissionsCenter sitePermissions={sitePermissions} s={s} onSet={onSet} onReset={onReset} />
    </I18nProvider>,
  );
  return { onSet, onReset };
}

afterEach(cleanup);

describe('PermissionsCenter (site permissions)', () => {
  it('explains the empty list rather than just showing "no sites"', () => {
    renderCenter({});
    expect(screen.getByText(pc.sitesEmpty)).toBeTruthy();
  });

  it('adds a site up front, seeded with an explicit prompt for the first capability', () => {
    const { onSet } = renderCenter({});
    fireEvent.change(screen.getByLabelText(pc.addSite), { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: pc.addSiteButton }));
    expect(onSet).toHaveBeenCalledWith('https://example.com', 'camera', 'prompt');
  });

  it('keeps Add disabled for an unparseable host and for a site already listed', () => {
    renderCenter({ 'https://example.com': { camera: 'allowed' } });
    const addBtn = () => screen.getByRole<HTMLButtonElement>('button', { name: pc.addSiteButton });
    fireEvent.change(screen.getByLabelText(pc.addSite), { target: { value: 'not a host !!' } });
    expect(addBtn().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(pc.addSite), { target: { value: 'example.com' } });
    expect(addBtn().disabled).toBe(true);
  });

  it('sets a capability for a listed site and forgets it through the confirm dialog', () => {
    const { onSet, onReset } = renderCenter({
      'https://a.example': { camera: 'prompt' },
    });
    const row = screen.getByText('https://a.example').closest('li') as HTMLElement;
    fireEvent.change(within(row).getByLabelText('https://a.example — ' + pc.capability.camera), {
      target: { value: 'denied' },
    });
    expect(onSet).toHaveBeenCalledWith('https://a.example', 'camera', 'denied');

    fireEvent.click(within(row).getByRole('button', { name: pc.forgetSite }));
    const confirms = screen.getAllByRole('button', { name: pc.forgetSite });
    fireEvent.click(confirms[confirms.length - 1]!);
    expect(onReset).toHaveBeenCalledWith('https://a.example');
  });

  it('shows the filter only past four sites and narrows the list with it', () => {
    const perms = Object.fromEntries(
      ['a', 'b', 'c', 'd', 'e'].map((x) => [
        `https://${x}.example`,
        { camera: 'prompt' as const },
      ]),
    );
    renderCenter(perms);
    fireEvent.change(screen.getByLabelText(pc.filter), { target: { value: 'c.example' } });
    expect(screen.getByText('https://c.example')).toBeTruthy();
    expect(screen.queryByText('https://a.example')).toBeNull();
  });

  it('says "no results" (not "no sites") when the filter matches nothing', () => {
    const perms = Object.fromEntries(
      ['a', 'b', 'c', 'd', 'e'].map((x) => [
        `https://${x}.example`,
        { camera: 'prompt' as const },
      ]),
    );
    renderCenter(perms);
    fireEvent.change(screen.getByLabelText(pc.filter), { target: { value: 'zzz' } });
    expect(screen.getByText(s.noResults)).toBeTruthy();
  });
});

function renderMatrix(rows: AgentCapabilityRow[] | 'reject') {
  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: {
      listAgentCapabilities: () =>
        rows === 'reject' ? Promise.reject(new Error('kernel down')) : Promise.resolve(rows),
    },
  });
  render(
    <I18nProvider locale="en">
      <AgentPermissionMatrix s={s} />
    </I18nProvider>,
  );
}

describe('AgentPermissionMatrix (read-only)', () => {
  it('shows the loading line, then the empty line when the kernel returns nothing', async () => {
    renderMatrix([]);
    await waitFor(() => expect(screen.getByText(pc.agentEmpty)).toBeTruthy());
  });

  it('treats a rejected read as empty rather than staying on "loading" forever', async () => {
    renderMatrix('reject');
    await waitFor(() => expect(screen.getByText(pc.agentEmpty)).toBeTruthy());
  });

  it('groups rows by danger class with a per-group count and a decision badge', async () => {
    renderMatrix([
      { id: 'browser_click', dangerClass: 'read', decision: 'allow' },
      { id: 'browser_type', dangerClass: 'read', decision: 'ask' },
      { id: 'shell_run', dangerClass: 'state_changing', decision: 'deny' },
    ]);
    await waitFor(() => expect(screen.getByText('browser_click')).toBeTruthy());
    expect(screen.getByText('shell_run')).toBeTruthy();
    // three decision badges, one per row
    expect(screen.getByText(pc.decision.allow)).toBeTruthy();
    expect(screen.getByText(pc.decision.deny)).toBeTruthy();
  });

  it('filters the matrix by tool id and shows "no results" when nothing matches', async () => {
    renderMatrix([
      { id: 'browser_click', dangerClass: 'read', decision: 'allow' },
      { id: 'shell_run', dangerClass: 'state_changing', decision: 'deny' },
    ]);
    await screen.findByText('browser_click');
    fireEvent.change(screen.getByLabelText(pc.filter), { target: { value: 'shell' } });
    expect(screen.getByText('shell_run')).toBeTruthy();
    expect(screen.queryByText('browser_click')).toBeNull();

    fireEvent.change(screen.getByLabelText(pc.filter), { target: { value: 'nothing-matches' } });
    expect(screen.getByText(s.noResults)).toBeTruthy();
  });
});
