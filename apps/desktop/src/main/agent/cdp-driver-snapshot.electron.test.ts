import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `cdp-driver-snapshot.electron` — the perception concern for the CDP driver. Pinned: `snapshotElements`
 * uses render-DOM by default and falls back to the a11y tree when that path throws or is disabled; the
 * render-DOM path 502s a missing / malformed payload, applies identity-stable refs only when the flag is
 * on AND the table validates AND stability was not degraded, marks newly-appeared elements, and
 * populates the per-tab ref map + origin; the a11y path 502s an unreadable tree, skips ignored /
 * role-less / non-interactable nodes, and tags a file input.
 */

class AppError extends Error {
  statusCode: number;
  constructor(m: string, s: number) {
    super(m);
    this.statusCode = s;
  }
}
vi.mock('@tepegoz/libs', () => ({ AppError, Logger: { info: vi.fn(), warn: vi.fn() } }));

const tx = vi.hoisted(() => ({
  parseDomTree: vi.fn(() => ({
    interactables: [{ ref: 1, tag: 'a', role: 'link', name: 'Home' }],
    paths: [['0']],
    hashes: ['h1'],
  })),
  assignStableRefs: vi.fn(() => ({ refs: [5], carryOverRate: 1, degraded: false })),
  disambiguate: vi.fn((k: readonly string[]) => k),
  createRefRegistry: vi.fn((url: string) => ({ url })),
  registryTable: vi.fn(() => ({})),
  markNewElements: vi.fn(() => [false]),
  isInteractableRole: vi.fn<(r: string) => boolean>(() => true),
  MAX_INTERACTABLE_ELEMENTS: 50,
}));
vi.mock('@tepegoz/tool-executor', () => tx);

const StableRefTableSchema = vi.hoisted(() => ({ safeParse: vi.fn(() => ({ success: true })) }));
vi.mock('@tepegoz/shared-types', () => ({ StableRefTableSchema }));

const sc = vi.hoisted(() => ({
  axString: (v: unknown): string => (typeof v === 'string' ? v : ''),
  AxTreeSchema: { safeParse: vi.fn() },
  CallResultSchema: { safeParse: vi.fn() },
  DomTreeResultSchema: { safeParse: vi.fn() },
}));
vi.mock('./cdp-driver-schemas.electron.js', () => sc);
vi.mock('./build-dom-tree-script.js', () => ({ buildDomTreeExpression: () => 'EXPR' }));

const fileInputInfo = vi.hoisted(() => vi.fn((): Promise<unknown> => Promise.resolve(null)));
vi.mock('./cdp-driver-dom.electron.js', () => ({ fileInputInfo }));
const mainFrameIsolatedContext = vi.hoisted(() => vi.fn(() => Promise.resolve(7)));
vi.mock('./cdp-driver-session.electron.js', () => ({ mainFrameIsolatedContext }));

const { snapshotElements } = await import('./cdp-driver-snapshot.electron');

const cast = <T>(v: unknown): T => v as T;
let send: ReturnType<typeof vi.fn>;
let deps: {
  ensure: ReturnType<typeof vi.fn>;
  refRegistries: Map<unknown, unknown>;
  prevSnapshots: Map<unknown, unknown>;
  refMaps: Map<unknown, unknown>;
  refOrigins: Map<unknown, unknown>;
};
const wc = { getURL: () => 'https://site.test/', getTitle: () => 'Site' };
const run = () => snapshotElements(cast(wc), cast(deps));

const origEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.TEPEGOZ_PERCEPTION;
  delete process.env.TEPEGOZ_PERCEPTION_V2;
  send = vi.fn(() => Promise.resolve({}));
  (wc as unknown as { debugger: unknown }).debugger = { sendCommand: send };
  deps = {
    ensure: vi.fn(() => Promise.resolve()),
    refRegistries: new Map(),
    prevSnapshots: new Map(),
    refMaps: new Map(),
    refOrigins: new Map(),
  };
  tx.parseDomTree.mockReturnValue({
    interactables: [{ ref: 1, tag: 'a', role: 'link', name: 'Home' }],
    paths: [['0']],
    hashes: ['h1'],
  });
  tx.markNewElements.mockReturnValue([false]);
  tx.assignStableRefs.mockReturnValue({ refs: [5], carryOverRate: 1, degraded: false });
  StableRefTableSchema.safeParse.mockReturnValue({ success: true });
  sc.CallResultSchema.safeParse.mockReturnValue({
    success: true,
    data: { result: { value: { url: 'https://site.test/', title: 'Site' } } },
  });
  sc.DomTreeResultSchema.safeParse.mockReturnValue({
    success: true,
    data: { url: 'https://site.test/', title: 'Site' },
  });
  sc.AxTreeSchema.safeParse.mockReturnValue({ success: true, data: { nodes: [] } });
});

afterEach(() => {
  process.env = { ...origEnv };
});

describe('render-DOM perception', () => {
  it('returns the mapped elements and populates the per-tab ref map + origin', async () => {
    const res = await run();
    expect(res).toMatchObject({ url: 'https://site.test/', title: 'Site' });
    expect(res.elements).toHaveLength(1);
    expect(deps.refMaps.get(wc)).toBeInstanceOf(Map);
    expect((deps.refMaps.get(wc) as Map<number, unknown>).get(1)).toMatchObject({ path: ['0'] });
    expect(deps.refOrigins.get(wc)).toBe('https://site.test/');
  });

  it('marks elements that appeared since the previous snapshot of the same page', async () => {
    tx.markNewElements.mockReturnValue([true]);
    const res = await run();
    expect((res.elements[0] as { isNew?: boolean }).isNew).toBe(true);
  });

  it('502s (then falls back to a11y) on a missing or malformed payload', async () => {
    sc.CallResultSchema.safeParse.mockReturnValue({ success: false });
    const res = await run();
    // a11y fallback ran
    expect(send).toHaveBeenCalledWith('Accessibility.getFullAXTree');
    expect(res.elements).toEqual([]);
  });
});

describe('identity-stable refs (flag-gated)', () => {
  beforeEach(() => {
    process.env.TEPEGOZ_PERCEPTION_V2 = '1';
  });

  it('applies the stable ref when the table validates and stability held', async () => {
    const res = await run();
    expect((res.elements[0] as { ref: number }).ref).toBe(5);
  });

  it('falls back to positional refs when stability degraded', async () => {
    tx.assignStableRefs.mockReturnValue({ refs: [5], carryOverRate: 0.1, degraded: true });
    const res = await run();
    expect((res.elements[0] as { ref: number }).ref).toBe(1);
  });

  it('falls back to positional refs and drops the registry when the table is rejected', async () => {
    StableRefTableSchema.safeParse.mockReturnValue({ success: false });
    const res = await run();
    expect((res.elements[0] as { ref: number }).ref).toBe(1);
    expect(deps.refRegistries.has(wc)).toBe(false);
  });
});

describe('a11y fallback perception', () => {
  beforeEach(() => {
    process.env.TEPEGOZ_PERCEPTION = 'a11y';
  });

  it('502s when the accessibility tree cannot be read', async () => {
    sc.AxTreeSchema.safeParse.mockReturnValue({ success: false });
    await expect(run()).rejects.toMatchObject({ statusCode: 502 });
  });

  it('skips ignored / id-less / non-interactable nodes and keeps a real control', async () => {
    tx.isInteractableRole.mockImplementation((r: string) => r === 'button');
    sc.AxTreeSchema.safeParse.mockReturnValue({
      success: true,
      data: {
        nodes: [
          { ignored: true, backendDOMNodeId: 1, role: { value: 'button' } },
          { ignored: false, role: { value: 'button' } },
          { ignored: false, backendDOMNodeId: 2, role: { value: 'presentation' } },
          { ignored: false, backendDOMNodeId: 3, role: { value: 'button' }, name: { value: 'Go' } },
        ],
      },
    });
    const res = await run();
    expect(res.elements).toEqual([{ role: 'button', name: 'Go' }]);
    expect((deps.refMaps.get(wc) as Map<number, unknown>).get(1)).toEqual({ backendNodeId: 3 });
  });

  it('tags a file input with its accept + multiple metadata', async () => {
    fileInputInfo.mockResolvedValue({ accept: 'image/*', multiple: true });
    sc.AxTreeSchema.safeParse.mockReturnValue({
      success: true,
      data: { nodes: [{ ignored: false, backendDOMNodeId: 9, role: { value: '' } }] },
    });
    const res = await run();
    expect(res.elements[0]).toMatchObject({
      role: 'button',
      inputKind: 'file',
      accept: 'image/*',
      multiple: true,
    });
  });
});
