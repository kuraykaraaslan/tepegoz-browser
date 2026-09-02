// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useExtensionCatalog } from './useExtensionCatalog';

/**
 * Fetches the built-in catalog once over IPC. The contract callers rely on: it starts with an empty
 * registry and `ready: false`, flips to `ready: true` exactly once the bridge call settles, and a
 * bridge rejection is swallowed (still `ready`, still an empty registry) so the chrome renders anyway.
 */

const listExtensionManifests = vi.fn();

beforeEach(() => {
  listExtensionManifests.mockReset();
  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: { listExtensionManifests },
  });
});
afterEach(cleanup);

const AGENT_MANIFEST = {
  id: 'com.tepegoz.agent',
  name: 'Agent',
  version: '1.0.0',
  description: '',
  icon: 'robot',
  surfaces: ['sidebar'] as const,
  actions: { click: 'sidebar' as const },
  labels: {},
  permissions: [],
};

describe('useExtensionCatalog', () => {
  it('starts empty and not ready before the fetch resolves', () => {
    listExtensionManifests.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useExtensionCatalog());
    expect(result.current.registry).toEqual([]);
    expect(result.current.ready).toBe(false);
  });

  it('builds the registry from the delivered manifests and becomes ready', async () => {
    listExtensionManifests.mockResolvedValue([AGENT_MANIFEST]);
    const { result } = renderHook(() => useExtensionCatalog());

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });
    expect(result.current.registry.map((e) => e.id)).toEqual(['com.tepegoz.agent']);
  });

  it('swallows a bridge rejection: ready, with an empty registry', async () => {
    listExtensionManifests.mockRejectedValue(new Error('bridge unavailable'));
    const { result } = renderHook(() => useExtensionCatalog());

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });
    expect(result.current.registry).toEqual([]);
  });

  it('does not update state after unmount', async () => {
    let resolve: (v: unknown[]) => void = () => {};
    listExtensionManifests.mockReturnValue(
      new Promise<unknown[]>((r) => {
        resolve = r;
      }),
    );
    const { result, unmount } = renderHook(() => useExtensionCatalog());
    unmount();
    resolve([AGENT_MANIFEST]);
    await Promise.resolve();
    // The `alive` guard means the post-unmount resolve is a no-op; nothing threw and state is untouched.
    expect(result.current.ready).toBe(false);
  });
});
