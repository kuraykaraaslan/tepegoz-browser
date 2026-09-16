// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useMcpHealthNotices } from './panel-mcp-health';
import { en } from './i18n/en';
import type { AgentHostApi, AgentMcpServerHealth } from './types';

/**
 * "Installed, panel open, nothing happens" (S8 PR7 residue): an MCP server the agent depends on can
 * silently disconnect, visible today only in a separate Settings page nobody re-checks. This hook is
 * what puts that into the panel's own notices strip instead.
 */

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function fakeApi(servers: AgentMcpServerHealth[]): Pick<AgentHostApi, 'getMcpStatus'> {
  return { getMcpStatus: () => Promise.resolve(servers) };
}

describe('useMcpHealthNotices', () => {
  it('reports nothing when no MCP server is configured', async () => {
    const { result } = renderHook(() => useMcpHealthNotices(fakeApi([]), en));
    await waitFor(() => {
      expect(result.current).toEqual([]);
    });
  });

  it('reports nothing for idle/connecting/ready servers', async () => {
    const servers: AgentMcpServerHealth[] = [
      { id: 'a', label: 'A', state: 'idle' },
      { id: 'b', label: 'B', state: 'connecting' },
      { id: 'c', label: 'C', state: 'ready' },
    ];
    const { result } = renderHook(() => useMcpHealthNotices(fakeApi(servers), en));
    await waitFor(() => {
      expect(result.current).toEqual([]);
    });
  });

  it('produces one warning notice per errored server, naming it and its cause', async () => {
    const servers: AgentMcpServerHealth[] = [
      { id: 'a', label: 'Filesystem', state: 'error', error: 'connection refused' },
      { id: 'b', label: 'Slack', state: 'ready' },
    ];
    const { result } = renderHook(() => useMcpHealthNotices(fakeApi(servers), en));
    await waitFor(() => {
      expect(result.current).toHaveLength(1);
    });
    expect(result.current[0]).toEqual({
      id: 'mcp-health-a-connection refused',
      severity: 'warning',
      title: 'Tool source unavailable: Filesystem',
      body: 'connection refused',
    });
  });

  it('falls back to a generic body when the server reports no error text', async () => {
    const servers: AgentMcpServerHealth[] = [{ id: 'a', label: 'Filesystem', state: 'error' }];
    const { result } = renderHook(() => useMcpHealthNotices(fakeApi(servers), en));
    await waitFor(() => {
      expect(result.current).toHaveLength(1);
    });
    expect(result.current[0]?.body).toBe(
      'This MCP server is not connected. Some tools may be missing until it reconnects.',
    );
  });

  it('gives a DIFFERENT error on the same server a fresh (non-dismissed) id', async () => {
    const first = { id: 'a', label: 'Filesystem', state: 'error' as const, error: 'timeout' };
    const second = { id: 'a', label: 'Filesystem', state: 'error' as const, error: 'auth failed' };
    const { result: r1 } = renderHook(() => useMcpHealthNotices(fakeApi([first]), en));
    await waitFor(() => expect(r1.current).toHaveLength(1));
    const { result: r2 } = renderHook(() => useMcpHealthNotices(fakeApi([second]), en));
    await waitFor(() => expect(r2.current).toHaveLength(1));
    expect(r1.current[0]?.id).not.toBe(r2.current[0]?.id);
  });

  it('polls again after 3s and drops a notice once the server recovers', async () => {
    vi.useFakeTimers();
    let servers: AgentMcpServerHealth[] = [{ id: 'a', label: 'Filesystem', state: 'error' }];
    const api: Pick<AgentHostApi, 'getMcpStatus'> = {
      getMcpStatus: () => Promise.resolve(servers),
    };
    const { result } = renderHook(() => useMcpHealthNotices(api, en));
    await vi.waitFor(() => expect(result.current).toHaveLength(1));

    servers = [{ id: 'a', label: 'Filesystem', state: 'ready' }];
    await vi.advanceTimersByTimeAsync(3000);
    await vi.waitFor(() => expect(result.current).toHaveLength(0));
  });
});
