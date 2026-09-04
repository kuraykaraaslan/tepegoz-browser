import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `cdp-driver-dom.electron` — the DOM query/resolution concern for the CDP driver. Every helper sends a
 * CDP command and validates the reply through a zod schema. Pinned: `fileInputInfo` recognises only a
 * real `<input type=file>`; `centerOf` averages the box-model quad and 409s an invisible element;
 * `objectIdFor` passes a live handle straight through and 409s an unresolvable backend id; `readValue`
 * / `isFocused` fall back to null / false on any failed read; `locatorsToObjectId` and `pathToObjectId`
 * surface a stale ref as null / a 409; and `probeClickPoint` / `widgetKindOf` / `findWidgetOptionInPage`
 * treat an unparseable probe as "not occluded" / "ordinary field" / "no option".
 */

const S = vi.hoisted(() => ({
  DescribeNodeSchema: { safeParse: vi.fn() },
  BoxModelSchema: { safeParse: vi.fn() },
  CallResultSchema: { safeParse: vi.fn() },
  ClickPointSchema: { safeParse: vi.fn() },
  EvalHandleSchema: { safeParse: vi.fn() },
  ResolveSchema: { safeParse: vi.fn() },
  WidgetKindSchema: { safeParse: vi.fn() },
  WidgetOptionSchema: { safeParse: vi.fn() },
}));
vi.mock('./cdp-driver-schemas.electron.js', () => ({
  ...S,
  attributesMap: (arr: string[] | undefined): Map<string, string> => {
    const m = new Map<string, string>();
    const a = arr ?? [];
    for (let i = 0; i < a.length; i += 2) m.set(a[i]!, a[i + 1] ?? '');
    return m;
  },
}));

vi.mock('@tepegoz/tool-executor', () => ({
  findByLocators: function findByLocators() {},
  findWidgetOption: function findWidgetOption() {},
  resolveNodePath: function resolveNodePath() {},
}));

class AppError extends Error {
  statusCode: number;
  constructor(m: string, s: number) {
    super(m);
    this.statusCode = s;
  }
}
vi.mock('@tepegoz/libs', () => ({ AppError }));

const mainFrameIsolatedContext = vi.hoisted(() => vi.fn(() => Promise.resolve(7)));
vi.mock('./cdp-driver-session.electron.js', () => ({ mainFrameIsolatedContext }));

const dom = await import('./cdp-driver-dom.electron');

let send: ReturnType<typeof vi.fn>;
const wc = (): { debugger: { sendCommand: ReturnType<typeof vi.fn> } } => ({
  debugger: { sendCommand: send },
});
const cast = <T>(v: unknown): T => v as T;
const ok = <T>(data: T) => ({ success: true as const, data });
const bad = { success: false as const };

beforeEach(() => {
  vi.clearAllMocks();
  send = vi.fn(() => Promise.resolve({}));
  for (const s of Object.values(S)) s.safeParse.mockReturnValue(bad);
  mainFrameIsolatedContext.mockResolvedValue(7);
});

describe('fileInputInfo', () => {
  it('returns null for a non-input node and for a non-file input', async () => {
    S.DescribeNodeSchema.safeParse.mockReturnValueOnce(bad);
    expect(await dom.fileInputInfo(cast(wc()), cast({ backendNodeId: 1 }))).toBeNull();

    S.DescribeNodeSchema.safeParse.mockReturnValueOnce(
      ok({ node: { localName: 'input', attributes: ['type', 'text'] } }),
    );
    expect(await dom.fileInputInfo(cast(wc()), cast({ backendNodeId: 1 }))).toBeNull();
  });

  it('reads accept + multiple off a real file input', async () => {
    S.DescribeNodeSchema.safeParse.mockReturnValue(
      ok({
        node: {
          localName: 'input',
          attributes: ['type', 'file', 'accept', 'image/*', 'multiple', ''],
        },
      }),
    );
    expect(await dom.fileInputInfo(cast(wc()), cast({ backendNodeId: 1 }))).toEqual({
      accept: 'image/*',
      multiple: true,
    });
  });
});

describe('centerOf', () => {
  it('averages the box-model quad', async () => {
    S.BoxModelSchema.safeParse.mockReturnValue(
      ok({ model: { content: [0, 0, 10, 0, 10, 10, 0, 10] } }),
    );
    expect(await dom.centerOf(cast(wc()), cast({ backendNodeId: 1 }))).toEqual({ x: 5, y: 5 });
  });

  it('409s when the element has no usable box', async () => {
    S.BoxModelSchema.safeParse.mockReturnValue(ok({ model: { content: [0, 0] } }));
    await expect(dom.centerOf(cast(wc()), cast({ backendNodeId: 1 }))).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe('objectIdFor', () => {
  it('returns a live objectId handle unchanged', async () => {
    expect(await dom.objectIdFor(cast(wc()), cast({ objectId: 'live-1' }))).toBe('live-1');
    expect(send).not.toHaveBeenCalled();
  });

  it('resolves a backend id, and 409s when it cannot', async () => {
    S.ResolveSchema.safeParse.mockReturnValueOnce(ok({ object: { objectId: 'resolved-1' } }));
    expect(await dom.objectIdFor(cast(wc()), cast({ backendNodeId: 9 }))).toBe('resolved-1');

    S.ResolveSchema.safeParse.mockReturnValueOnce(bad);
    await expect(dom.objectIdFor(cast(wc()), cast({ backendNodeId: 9 }))).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe('readValue', () => {
  it('returns the string value, capped, and null on a non-string or failed read', async () => {
    S.CallResultSchema.safeParse.mockReturnValueOnce(ok({ result: { value: 'hello world' } }));
    expect(await dom.readValue(cast(wc()), cast({ objectId: 'o' }))).toBe('hello world');

    S.CallResultSchema.safeParse.mockReturnValueOnce(ok({ result: { value: 42 } }));
    expect(await dom.readValue(cast(wc()), cast({ objectId: 'o' }))).toBeNull();

    S.CallResultSchema.safeParse.mockReturnValueOnce(bad);
    expect(await dom.readValue(cast(wc()), cast({ objectId: 'o' }))).toBeNull();
  });
});

describe('isFocused', () => {
  it('is true only when the call result is exactly true', async () => {
    S.CallResultSchema.safeParse.mockReturnValueOnce(ok({ result: { value: true } }));
    expect(await dom.isFocused(cast(wc()), cast({ objectId: 'o' }))).toBe(true);

    S.CallResultSchema.safeParse.mockReturnValueOnce(ok({ result: { value: false } }));
    expect(await dom.isFocused(cast(wc()), cast({ objectId: 'o' }))).toBe(false);
  });

  it('is false when a backend id cannot be resolved', async () => {
    S.ResolveSchema.safeParse.mockReturnValue(bad);
    expect(await dom.isFocused(cast(wc()), cast({ backendNodeId: 3 }))).toBe(false);
  });

  it('resolves a backend id to an objectId, then checks focus on it', async () => {
    S.ResolveSchema.safeParse.mockReturnValueOnce(ok({ object: { objectId: 'resolved-fi' } }));
    S.CallResultSchema.safeParse.mockReturnValueOnce(ok({ result: { value: true } }));

    expect(await dom.isFocused(cast(wc()), cast({ backendNodeId: 3 }))).toBe(true);
    expect(send).toHaveBeenCalledWith('DOM.resolveNode', { backendNodeId: 3 });
    expect(send).toHaveBeenCalledWith(
      'Runtime.callFunctionOn',
      expect.objectContaining({ objectId: 'resolved-fi' }),
    );
  });
});

describe('locator / path resolution', () => {
  it('locatorsToObjectId returns the handle or null', async () => {
    S.EvalHandleSchema.safeParse.mockReturnValueOnce(ok({ result: { objectId: 'h1' } }));
    expect(await dom.locatorsToObjectId(cast(wc()), cast({}))).toBe('h1');

    S.EvalHandleSchema.safeParse.mockReturnValueOnce(ok({ result: {} }));
    expect(await dom.locatorsToObjectId(cast(wc()), cast({}))).toBeNull();

    S.EvalHandleSchema.safeParse.mockReturnValueOnce(bad);
    expect(await dom.locatorsToObjectId(cast(wc()), cast({}))).toBeNull();
  });

  it('pathToObjectId returns the handle, and 409s on a stale path', async () => {
    S.EvalHandleSchema.safeParse.mockReturnValueOnce(ok({ result: { objectId: 'h2' } }));
    expect(await dom.pathToObjectId(cast(wc()), cast([0, 1]))).toBe('h2');

    S.EvalHandleSchema.safeParse.mockReturnValueOnce(ok({ result: {} }));
    await expect(dom.pathToObjectId(cast(wc()), cast([0, 1]))).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe('probeClickPoint', () => {
  it('reports the parsed probe result', async () => {
    S.ClickPointSchema.safeParse.mockReturnValue(
      ok({ result: { value: { x: 3, y: 4, blocker: 'x' } } }),
    );
    S.ResolveSchema.safeParse.mockReturnValue(ok({ object: { objectId: 'o' } }));
    expect(await dom.probeClickPoint(cast(wc()), cast({ backendNodeId: 1 }))).toEqual({
      x: 3,
      y: 4,
      blocker: 'x',
    });
  });

  it('treats an unparseable probe as not occluded', async () => {
    S.ResolveSchema.safeParse.mockReturnValue(ok({ object: { objectId: 'o' } }));
    S.ClickPointSchema.safeParse.mockReturnValue(bad);
    expect(await dom.probeClickPoint(cast(wc()), cast({ backendNodeId: 1 }))).toEqual({
      x: 0,
      y: 0,
      blocker: null,
    });
  });
});

describe('widgetKindOf', () => {
  it('returns the parsed kind, else null', async () => {
    S.ResolveSchema.safeParse.mockReturnValue(ok({ object: { objectId: 'o' } }));
    S.WidgetKindSchema.safeParse.mockReturnValueOnce(
      ok({ result: { value: { kind: 'readonly' } } }),
    );
    expect(await dom.widgetKindOf(cast(wc()), cast({ backendNodeId: 1 }))).toBe('readonly');

    S.WidgetKindSchema.safeParse.mockReturnValueOnce(bad);
    expect(await dom.widgetKindOf(cast(wc()), cast({ backendNodeId: 1 }))).toBeNull();
  });
});

describe('findWidgetOptionInPage', () => {
  it('returns the parsed option point, else null', async () => {
    S.WidgetOptionSchema.safeParse.mockReturnValueOnce(
      ok({ result: { value: { x: 1, y: 2, label: 'Tue' } } }),
    );
    expect(await dom.findWidgetOptionInPage(cast(wc()), 'Tue')).toEqual({
      x: 1,
      y: 2,
      label: 'Tue',
    });

    S.WidgetOptionSchema.safeParse.mockReturnValueOnce(bad);
    expect(await dom.findWidgetOptionInPage(cast(wc()), 'Tue')).toBeNull();
  });
});
