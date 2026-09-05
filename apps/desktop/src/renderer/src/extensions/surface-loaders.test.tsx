// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ExtensionSurfaceKind } from '@tepegoz/extension-sdk';
import { SURFACE_LOADERS } from './surface-loaders';

/**
 * Each entry in `SURFACE_LOADERS` is a thunk that dynamically imports an extension package and wraps
 * one of its exports as a component binding `window.tepegoz` + `onClose`. What's worth pinning per
 * entry: the loader resolves to a component, and that component forwards the host bridge and the
 * `onClose` callback to the real (mocked) export — not that the real extension packages render
 * correctly, which is each package's own concern.
 */

const mocks = {
  AgentPanel: vi.fn((p: { api: unknown; onClose: () => void }) => (
    <div data-testid="AgentPanel" onClick={p.onClose}>
      {String(p.api === window.tepegoz)}
    </div>
  )),
  AgentHistoryPage: vi.fn((p: { api: unknown; onClose: () => void }) => (
    <div data-testid="AgentHistoryPage" onClick={p.onClose}>
      {String(p.api === window.tepegoz)}
    </div>
  )),
  UserAgentPopup: vi.fn((p: { api: unknown; onClose: () => void }) => (
    <div data-testid="UserAgentPopup" onClick={p.onClose}>
      {String(p.api === window.tepegoz)}
    </div>
  )),
  UserAgentPage: vi.fn((p: { api: unknown; onClose: () => void }) => (
    <div data-testid="UserAgentPage" onClick={p.onClose}>
      {String(p.api === window.tepegoz)}
    </div>
  )),
  PopupBlockerPopup: vi.fn((p: { api: unknown; onClose: () => void }) => (
    <div data-testid="PopupBlockerPopup" onClick={p.onClose}>
      {String(p.api === window.tepegoz)}
    </div>
  )),
  PopupBlockerPage: vi.fn((p: { api: unknown; onClose: () => void }) => (
    <div data-testid="PopupBlockerPage" onClick={p.onClose}>
      {String(p.api === window.tepegoz)}
    </div>
  )),
  AdblockPopup: vi.fn((p: { api: unknown; onClose: () => void }) => (
    <div data-testid="AdblockPopup" onClick={p.onClose}>
      {String(p.api === window.tepegoz)}
    </div>
  )),
  AdblockPage: vi.fn((p: { api: unknown; onClose: () => void }) => (
    <div data-testid="AdblockPage" onClick={p.onClose}>
      {String(p.api === window.tepegoz)}
    </div>
  )),
  TypoPopup: vi.fn((p: { api: unknown; onClose: () => void }) => (
    <div data-testid="TypoPopup" onClick={p.onClose}>
      {String(p.api === window.tepegoz)}
    </div>
  )),
  TypoPage: vi.fn((p: { api: unknown; onClose: () => void }) => (
    <div data-testid="TypoPage" onClick={p.onClose}>
      {String(p.api === window.tepegoz)}
    </div>
  )),
  TranslatePopup: vi.fn((p: { api: unknown; onClose: () => void }) => (
    <div data-testid="TranslatePopup" onClick={p.onClose}>
      {String(p.api === window.tepegoz)}
    </div>
  )),
  TranslatePage: vi.fn((p: { api: unknown; onClose: () => void }) => (
    <div data-testid="TranslatePage" onClick={p.onClose}>
      {String(p.api === window.tepegoz)}
    </div>
  )),
  MacrosPanel: vi.fn((p: { api: unknown; onClose: () => void }) => (
    <div data-testid="MacrosPanel" onClick={p.onClose}>
      {String(p.api === window.tepegoz)}
    </div>
  )),
  MacrosPage: vi.fn((p: { api: unknown; onClose: () => void }) => (
    <div data-testid="MacrosPage" onClick={p.onClose}>
      {String(p.api === window.tepegoz)}
    </div>
  )),
  TasksPage: vi.fn((p: { api: unknown; onClose: () => void }) => (
    <div data-testid="TasksPage" onClick={p.onClose}>
      {String(p.api === window.tepegoz)}
    </div>
  )),
  VideoPlayerPopup: vi.fn((p: { api: unknown; onClose: () => void }) => (
    <div data-testid="VideoPlayerPopup" onClick={p.onClose}>
      {String(p.api === window.tepegoz)}
    </div>
  )),
  VideoPlayerPage: vi.fn((p: { api: unknown; onClose: () => void }) => (
    <div data-testid="VideoPlayerPage" onClick={p.onClose}>
      {String(p.api === window.tepegoz)}
    </div>
  )),
};

vi.mock('@tepegoz/ext-agent/panel', () => ({ AgentPanel: mocks.AgentPanel }));
vi.mock('@tepegoz/ext-agent/history-page', () => ({ AgentHistoryPage: mocks.AgentHistoryPage }));
vi.mock('@tepegoz/ext-user-agent/panel', () => ({
  UserAgentPopup: mocks.UserAgentPopup,
  UserAgentPage: mocks.UserAgentPage,
}));
vi.mock('@tepegoz/ext-popup-blocker/panel', () => ({
  PopupBlockerPopup: mocks.PopupBlockerPopup,
  PopupBlockerPage: mocks.PopupBlockerPage,
}));
vi.mock('@tepegoz/ext-adblock/panel', () => ({
  AdblockPopup: mocks.AdblockPopup,
  AdblockPage: mocks.AdblockPage,
}));
vi.mock('@tepegoz/ext-typo/panel', () => ({ TypoPopup: mocks.TypoPopup, TypoPage: mocks.TypoPage }));
vi.mock('@tepegoz/ext-translate/panel', () => ({
  TranslatePopup: mocks.TranslatePopup,
  TranslatePage: mocks.TranslatePage,
}));
vi.mock('@tepegoz/ext-macros/panel', () => ({
  MacrosPanel: mocks.MacrosPanel,
  MacrosPage: mocks.MacrosPage,
}));
vi.mock('@tepegoz/ext-tasks/page', () => ({ TasksPage: mocks.TasksPage }));
vi.mock('@tepegoz/ext-video-player/panel', () => ({
  VideoPlayerPopup: mocks.VideoPlayerPopup,
  VideoPlayerPage: mocks.VideoPlayerPage,
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: {} });
});
afterEach(cleanup);

// One row per real SURFACE_LOADERS entry, naming the export it must resolve to.
const cases: Array<{ id: string; kind: ExtensionSurfaceKind; exportName: keyof typeof mocks }> = [
  { id: 'com.tepegoz.agent', kind: 'sidebar', exportName: 'AgentPanel' },
  { id: 'com.tepegoz.agent', kind: 'page', exportName: 'AgentHistoryPage' },
  { id: 'com.tepegoz.user-agent', kind: 'popup', exportName: 'UserAgentPopup' },
  { id: 'com.tepegoz.user-agent', kind: 'page', exportName: 'UserAgentPage' },
  { id: 'com.tepegoz.popup-blocker', kind: 'popup', exportName: 'PopupBlockerPopup' },
  { id: 'com.tepegoz.popup-blocker', kind: 'page', exportName: 'PopupBlockerPage' },
  { id: 'com.tepegoz.adblock', kind: 'popup', exportName: 'AdblockPopup' },
  { id: 'com.tepegoz.adblock', kind: 'page', exportName: 'AdblockPage' },
  { id: 'com.tepegoz.typo', kind: 'popup', exportName: 'TypoPopup' },
  { id: 'com.tepegoz.typo', kind: 'page', exportName: 'TypoPage' },
  { id: 'com.tepegoz.translate', kind: 'popup', exportName: 'TranslatePopup' },
  { id: 'com.tepegoz.translate', kind: 'page', exportName: 'TranslatePage' },
  { id: 'com.tepegoz.macros', kind: 'sidebar', exportName: 'MacrosPanel' },
  { id: 'com.tepegoz.macros', kind: 'page', exportName: 'MacrosPage' },
  { id: 'com.tepegoz.tasks', kind: 'page', exportName: 'TasksPage' },
  { id: 'com.tepegoz.video-player', kind: 'popup', exportName: 'VideoPlayerPopup' },
  { id: 'com.tepegoz.video-player', kind: 'page', exportName: 'VideoPlayerPage' },
];

describe('SURFACE_LOADERS', () => {
  it('registers exactly the cataloged (id, kind) pairs', () => {
    const actual = Object.entries(SURFACE_LOADERS).flatMap(([id, kinds]) =>
      Object.keys(kinds).map((kind) => `${id}:${kind}`),
    );
    const expected = cases.map((c) => `${c.id}:${c.kind}`);
    expect(actual.sort()).toEqual(expected.sort());
  });

  it.each(cases)('$id/$kind resolves and forwards the bridge + onClose to $exportName', async ({
    id,
    kind,
    exportName,
  }) => {
    const loader = SURFACE_LOADERS[id]![kind]!;
    const Component = await loader();
    const onClose = vi.fn();
    render(<Component onClose={onClose} />);

    const mock = mocks[exportName];
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0]![0].api).toBe(window.tepegoz);

    const node = screen.getByTestId(exportName);
    expect(node.textContent).toBe('true');
    node.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
