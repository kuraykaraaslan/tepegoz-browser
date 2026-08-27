// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import type { TabsState } from '@tepegoz/desktop-ipc';
import type { OmniboxSuggestLabels } from '@tepegoz/omnibox';
import { useOmniboxAndHistory } from './app-omnibox-history';

/**
 * Omnibox suggestion sourcing + the `@`-command handlers. What's load-bearing: command mode
 * (`@agent` / `@download` / `@skill`) must NOT touch history; every source degrades to [] rather than
 * throwing; `@skill <name>` runs the skill's STORED PROMPT, never the name the dropdown showed; and
 * an agent run from the omnibox opens the console (panel-open group setting) before it starts.
 */

type HistRow = { url: string; title: string; visitCount: number };
type DlRow = { id: string; filename: string; url: string };
type SkillRow = { id: string; name: string; prompt: string; startUrl?: string; tombstone: boolean };

const bridge = {
  searchHistory: vi.fn<() => Promise<HistRow[]>>(() => Promise.resolve([])),
  listDownloads: vi.fn<() => Promise<DlRow[]>>(() => Promise.resolve([])),
  listAgentSkills: vi.fn<() => Promise<SkillRow[]>>(() => Promise.resolve([])),
  ensureActiveGroup: vi.fn<() => Promise<string>>(() => Promise.resolve('g1')),
  updateTabGroup: vi.fn(),
  runAgent: vi.fn<(a: unknown) => Promise<void>>(() => Promise.resolve()),
  navigateTab: vi.fn(),
  activateTab: vi.fn(),
};
const onCloseSurface = vi.fn();

const tabsRef = {
  current: { tabs: [{ id: 't1', title: 'A', url: 'https://a/' }], activeId: 't1' },
} as unknown as MutableRefObject<TabsState>;
const bookmarksRef: MutableRefObject<{ url: string; title: string }[]> = { current: [] };
const labels: OmniboxSuggestLabels = {
  search: 'Search the web',
  switchToTab: 'Switch to tab',
  bookmark: 'Bookmark',
  quickSettings: 'Settings',
  quickAppearance: 'Open Appearance settings',
  quickLanguage: 'Open Language & region settings',
  quickPrivacy: 'Open Privacy settings',
  command: 'Command',
  agentAsk: 'Ask the agent: {task}',
  agentHint: 'Hands this text to the agent',
  agentEmpty: 'Type what the agent should do',
  commandAgent: 'Give the agent a task',
  commandDownload: 'Find a download',
  commandSkill: 'Run a saved skill',
  download: 'Download',
  skill: 'Skill',
  commandNoResults: 'Nothing matched',
};

const render = () =>
  renderHook(() => useOmniboxAndHistory(tabsRef, labels, bookmarksRef, onCloseSurface));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(cleanup);

describe('onOmniboxSuggest', () => {
  it('searches history for an ordinary query', async () => {
    const { result } = render();
    await result.current.onOmniboxSuggest('weather today');
    expect(bridge.searchHistory).toHaveBeenCalledWith({ query: 'weather today' });
  });

  it('does NOT touch history in @-command mode', async () => {
    const { result } = render();
    await result.current.onOmniboxSuggest('@agent book a flight');
    expect(bridge.searchHistory).not.toHaveBeenCalled();
  });

  it('fetches downloads for @download', async () => {
    const { result } = render();
    await result.current.onOmniboxSuggest('@download invoice');
    expect(bridge.listDownloads).toHaveBeenCalledTimes(1);
  });

  it('still returns an array when history is unavailable', async () => {
    bridge.searchHistory.mockRejectedValueOnce(new Error('db gone'));
    const { result } = render();
    await expect(result.current.onOmniboxSuggest('x')).resolves.toBeInstanceOf(Array);
  });
});

describe('the @-command handlers', () => {
  it('@agent opens the console (panel-open group setting) THEN starts the run', async () => {
    const { result } = render();
    await act(async () => {
      result.current.onAgentTaskFromOmnibox('summarize this');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onCloseSurface).toHaveBeenCalled();
    expect(bridge.ensureActiveGroup).toHaveBeenCalled();
    // The console-open signal: the group's `settings` bag gets a panel-open flag before the run.
    const [gid, patch] = bridge.updateTabGroup.mock.calls[0] as [string, { settings: Record<string, unknown> }];
    expect(gid).toBe('g1');
    expect(Object.values(patch.settings).some((v) => v === true)).toBe(true);
    expect(bridge.runAgent).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'summarize this', groupId: 'g1' }),
    );
  });

  it('@skill runs the skill’s stored prompt, and an unknown id is a no-op', async () => {
    bridge.listAgentSkills.mockResolvedValueOnce([
      { id: 'sk1', name: 'Weekly report', prompt: 'DO THE WEEKLY REPORT', tombstone: false },
    ]);
    const { result } = render();
    await result.current.onOmniboxSuggest('@skill week'); // primes the skill ref

    await act(async () => {
      result.current.onRunSkillFromOmnibox('sk1');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(bridge.runAgent).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'DO THE WEEKLY REPORT', skillId: 'sk1' }),
    );

    bridge.runAgent.mockClear();
    act(() => result.current.onRunSkillFromOmnibox('nope'));
    expect(bridge.runAgent).not.toHaveBeenCalled();
  });

  it('@download open navigates to the downloads page and closes the surface', () => {
    const { result } = render();
    act(() => result.current.onOpenDownloadFromOmnibox('d1'));
    expect(onCloseSurface).toHaveBeenCalled();
    expect(bridge.navigateTab).toHaveBeenCalledWith('tepegoz://downloads');
  });

  it('activate-tab closes the surface and switches tab', () => {
    const { result } = render();
    act(() => result.current.onActivateTabFromOmnibox('t9'));
    expect(onCloseSurface).toHaveBeenCalled();
    expect(bridge.activateTab).toHaveBeenCalledWith('t9');
  });
});
