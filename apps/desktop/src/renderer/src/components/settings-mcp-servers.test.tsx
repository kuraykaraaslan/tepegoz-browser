// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { settingsDict } from '@tepegoz/settings-ui';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import type { McpServerPref, McpServerStatusInfo, Preferences } from '@tepegoz/desktop-ipc';
import { McpServersSection } from './settings-mcp-servers';

/**
 * Settings → MCP servers (the surface that replaced editing a JSON blob on the Developer page). Under
 * test: the draft validation that mirrors the schema's superRefine (name required; stdio needs a
 * command; http_sse needs a real URL), args parsed as a whitespace-separated list (empty ⇒ none), the
 * transport-specific server shape, add-vs-update keyed on id, enable toggle, and remove.
 */

const s = settingsDict.en;
const getMcpStatus = vi.fn<() => Promise<McpServerStatusInfo[]>>(() => Promise.resolve([]));

beforeEach(() => {
  vi.clearAllMocks();
  getMcpStatus.mockResolvedValue([]);
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: { getMcpStatus } });
});
afterEach(cleanup);

function renderSection(over: Partial<Preferences> = {}) {
  const setPref = vi.fn();
  render(
    <I18nProvider locale="en">
      <McpServersSection prefs={{ ...DEFAULT_PREFERENCES, ...over }} setPref={setPref} />
    </I18nProvider>,
  );
  return { setPref };
}

const addBtn = () => screen.getByRole<HTMLButtonElement>('button', { name: s.mcp.add });
const field = (label: string) => screen.getByLabelText(label);
const lastPatch = (setPref: ReturnType<typeof vi.fn>): Partial<Preferences> =>
  setPref.mock.calls.at(-1)![0] as Partial<Preferences>;

describe('McpServersSection', () => {
  it('shows the empty state and keeps Add disabled with no name', () => {
    renderSection();
    expect(screen.getByText(s.mcp.empty)).toBeTruthy();
    expect(addBtn().disabled).toBe(true);
  });

  it('adds a stdio server with whitespace-split args', () => {
    const { setPref } = renderSection();
    fireEvent.change(field(s.mcp.labelField), { target: { value: 'FS' } });
    fireEvent.change(field(s.mcp.command), { target: { value: 'npx' } });
    fireEvent.change(field(s.mcp.args), { target: { value: '-y   server-fs   /home' } });
    fireEvent.click(addBtn());

    const servers = lastPatch(setPref).mcpServers as McpServerPref[];
    expect(servers).toHaveLength(1);
    expect(servers[0]).toMatchObject({
      label: 'FS',
      transport: 'stdio',
      enabled: true,
      command: 'npx',
      args: ['-y', 'server-fs', '/home'],
    });
  });

  it('keeps Add disabled for a stdio server with no command', () => {
    renderSection();
    fireEvent.change(field(s.mcp.labelField), { target: { value: 'FS' } });
    expect(addBtn().disabled).toBe(true);
  });

  it('switches to the URL field for http_sse and validates the address', () => {
    const { setPref } = renderSection();
    fireEvent.change(field(s.mcp.labelField), { target: { value: 'Remote' } });
    fireEvent.change(field(s.mcp.transport), { target: { value: 'http_sse' } });
    expect(screen.queryByLabelText(s.mcp.command)).toBeNull();

    fireEvent.change(field(s.mcp.url), { target: { value: 'not-a-url' } });
    expect(addBtn().disabled).toBe(true);

    fireEvent.change(field(s.mcp.url), { target: { value: 'https://mcp.example/sse' } });
    fireEvent.click(addBtn());
    const servers = lastPatch(setPref).mcpServers as McpServerPref[];
    expect(servers[0]).toMatchObject({ transport: 'http_sse', url: 'https://mcp.example/sse' });
    expect(servers[0]).not.toHaveProperty('command');
  });

  it('updates an existing server in place (same id) when edited', () => {
    const existing: McpServerPref = {
      id: 'mcp-1',
      label: 'Old',
      transport: 'stdio',
      enabled: true,
      command: 'old',
      args: [],
    };
    const { setPref } = renderSection({ mcpServers: [existing] });

    fireEvent.click(screen.getByRole('button', { name: s.searchEngineEdit }));
    fireEvent.change(field(s.mcp.labelField), { target: { value: 'New' } });
    fireEvent.click(screen.getByRole('button', { name: s.searchEngineSave }));

    const servers = lastPatch(setPref).mcpServers as McpServerPref[];
    expect(servers).toHaveLength(1);
    expect(servers[0]).toMatchObject({ id: 'mcp-1', label: 'New' });
  });

  it('toggles a server enabled flag', () => {
    const existing: McpServerPref = {
      id: 'mcp-1',
      label: 'S',
      transport: 'stdio',
      enabled: true,
      command: 'c',
      args: [],
    };
    const { setPref } = renderSection({ mcpServers: [existing] });
    fireEvent.click(screen.getByRole('switch', { name: s.mcp.enabled }));
    expect((lastPatch(setPref).mcpServers as McpServerPref[])[0]).toMatchObject({ enabled: false });
  });

  it('removes a server through the confirm dialog', () => {
    const existing: McpServerPref = {
      id: 'mcp-1',
      label: 'S',
      transport: 'stdio',
      enabled: true,
      command: 'c',
      args: [],
    };
    const { setPref } = renderSection({ mcpServers: [existing] });
    fireEvent.click(screen.getByRole('button', { name: s.remove }));
    const all = screen.getAllByRole('button', { name: s.remove });
    fireEvent.click(all[all.length - 1]!); // the dialog's destructive confirm
    expect(lastPatch(setPref).mcpServers).toEqual([]);
  });

  it('abandons the edit form when Cancel is pressed', () => {
    const existing: McpServerPref = {
      id: 'mcp-1', label: 'Old', transport: 'stdio', enabled: true, command: 'old', args: [],
    };
    renderSection({ mcpServers: [existing] });
    fireEvent.click(screen.getByRole('button', { name: s.searchEngineEdit }));
    fireEvent.change(field(s.mcp.labelField), { target: { value: 'Half typed' } });
    fireEvent.click(screen.getByRole('button', { name: s.cancel }));
    // back to the add form: the label field is blank again and Save is gone
    expect((field(s.mcp.labelField) as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('button', { name: s.searchEngineSave })).toBeNull();
  });

  it('clears the edit form if the server being edited is removed underneath it', () => {
    const existing: McpServerPref = {
      id: 'mcp-1', label: 'Old', transport: 'stdio', enabled: true, command: 'old', args: [],
    };
    const { setPref } = renderSection({ mcpServers: [existing] });
    fireEvent.click(screen.getByRole('button', { name: s.searchEngineEdit }));
    fireEvent.click(screen.getByRole('button', { name: s.remove }));
    const all = screen.getAllByRole('button', { name: s.remove });
    fireEvent.click(all[all.length - 1]!);
    expect(lastPatch(setPref).mcpServers).toEqual([]);
    expect((field(s.mcp.labelField) as HTMLInputElement).value).toBe('');
  });

  it('renders an http_sse server by its URL and flags the env-var reminder', async () => {
    const existing: McpServerPref = {
      id: 'mcp-http',
      label: 'Remote',
      transport: 'http_sse',
      enabled: true,
      url: 'https://mcp.example/sse',
      env: { TOKEN: 'x' },
    };
    renderSection({ mcpServers: [existing] });
    expect(await screen.findByText('https://mcp.example/sse')).toBeTruthy();
    expect(screen.getByText(s.mcp.envNote)).toBeTruthy();
  });

  it('shows the live connection badge and tool count from the status poll', async () => {
    getMcpStatus.mockResolvedValue([
      { id: 'mcp-1', label: 'S', transport: 'stdio', state: 'ready', toolCount: 4 },
    ]);
    const existing: McpServerPref = {
      id: 'mcp-1',
      label: 'S',
      transport: 'stdio',
      enabled: true,
      command: 'c',
      args: [],
    };
    renderSection({ mcpServers: [existing] });
    await waitFor(() =>
      expect(screen.getByText(`4 ${s.mcpToolsLabel}`)).toBeTruthy(),
    );
    expect(screen.getByText(s.mcpStateLabels.ready)).toBeTruthy();
  });

  it('stops polling the status endpoint once unmounted', () => {
    vi.useFakeTimers();
    renderSection({ mcpServers: [] });
    const callsBefore = getMcpStatus.mock.calls.length;
    cleanup(); // unmount → the effect cleanup clears the interval
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(getMcpStatus.mock.calls.length).toBe(callsBefore);
    vi.useRealTimers();
  });
});
