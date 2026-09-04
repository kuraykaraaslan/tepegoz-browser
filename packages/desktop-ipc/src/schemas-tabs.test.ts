import { describe, expect, it } from 'vitest';
import {
  ContentVisibleSchema,
  CreateBackgroundTabSchema,
  CreateTabInputSchema,
  FindInPageQuerySchema,
  NavHistoryDirectionSchema,
  NavigateInputSchema,
  ProcessEndInputSchema,
  ReopenClosedSchema,
  TabDragBeginSchema,
  TabDragPointSchema,
  TabFaviconSchema,
  TabGroupAssignSchema,
  TabGroupColorSchema,
  TabGroupCreateSchema,
  TabGroupMoveSchema,
  TabGroupSettingsSchema,
  TabGroupSettingValueSchema,
  TabGroupUpdateSchema,
  TabHiddenSchema,
  TabIdSchema,
  TabMoveSchema,
  TabPinSchema,
  TabStripGeometrySchema,
  ZoomCommandSchema,
} from './schemas-tabs';

/**
 * Runtime (zod) guards for the `tabs:*` + find + zoom IPC channels. The load-bearing one is
 * `TabFaviconSchema`: a favicon crossing into the trusted, proxy-less tab strip MUST be an inline
 * `data:image/` URL — a remote one would be the chrome making a clear-path request to the site the
 * user may be viewing behind a VPN.
 */

describe('the id / colour primitives', () => {
  it('TabIdSchema bounds 1..64; TabGroupColorSchema is the fixed palette', () => {
    expect(TabIdSchema.parse('t1')).toBe('t1');
    expect(TabIdSchema.safeParse('').success).toBe(false);
    expect(TabGroupColorSchema.parse('cyan')).toBe('cyan');
    expect(TabGroupColorSchema.safeParse('teal').success).toBe(false);
  });
});

describe('the simple tab ops', () => {
  it('move / pin / set-hidden wrap an id with their payload', () => {
    expect(TabMoveSchema.parse({ id: 't1', toIndex: 2, intoGroupId: null })).toMatchObject({
      toIndex: 2,
    });
    expect(TabPinSchema.parse({ id: 't1', pinned: true })).toMatchObject({ pinned: true });
    expect(TabHiddenSchema.parse({ id: 't1', hidden: false })).toMatchObject({ hidden: false });
    expect(TabMoveSchema.safeParse({ id: 't1', toIndex: -1 }).success).toBe(false);
  });

  it('reopen-closed takes an optional id; nav-history is back|forward', () => {
    expect(ReopenClosedSchema.parse({})).toEqual({});
    expect(ReopenClosedSchema.parse({ id: 'c1' })).toEqual({ id: 'c1' });
    expect(NavHistoryDirectionSchema.parse('back')).toBe('back');
    expect(NavHistoryDirectionSchema.safeParse('sideways').success).toBe(false);
  });
});

describe('the tab-group ops', () => {
  it('group-create / group-move / group-assign', () => {
    expect(TabGroupCreateSchema.parse({ memberIds: ['t1', 't2'] })).toMatchObject({
      memberIds: ['t1', 't2'],
    });
    expect(TabGroupCreateSchema.parse({})).toEqual({});
    expect(TabGroupMoveSchema.parse({ groupId: 'g1', toIndex: 0 })).toMatchObject({ groupId: 'g1' });
    expect(TabGroupAssignSchema.parse({ tabId: 't1', groupId: 'g1' })).toMatchObject({ tabId: 't1' });
  });

  it('TabGroupSettingValueSchema is a flat JSON-safe union; the settings bag is a bounded record', () => {
    for (const v of ['x', 3, true, null]) expect(TabGroupSettingValueSchema.parse(v)).toBe(v);
    expect(TabGroupSettingValueSchema.safeParse({ nested: 1 }).success).toBe(false);
    expect(TabGroupSettingsSchema.parse({ agentEnabled: true })).toMatchObject({ agentEnabled: true });
  });

  it('group-update is a partial patch over name/color/collapsed/settings', () => {
    expect(TabGroupUpdateSchema.parse({ groupId: 'g1', name: 'X' })).toEqual({
      groupId: 'g1',
      name: 'X',
    });
    expect(TabGroupUpdateSchema.safeParse({ groupId: 'g1', color: 'chartreuse' }).success).toBe(false);
    expect(TabGroupUpdateSchema.safeParse({ name: 'X' }).success).toBe(false); // groupId required
  });
});

describe('TabFaviconSchema', () => {
  it('accepts an inline data:image/ URL and null, rejects a remote URL', () => {
    expect(TabFaviconSchema.parse('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(TabFaviconSchema.parse(null)).toBeNull();
    expect(TabFaviconSchema.safeParse('https://x.test/f.ico').success).toBe(false);
  });
});

describe('the tear-off drag schemas', () => {
  const item = { kind: 'tab' as const, id: 't1' };
  const dragBegin = {
    item,
    title: 'Tab',
    faviconUrl: null,
    grabOffset: { x: 1, y: 2 },
    width: 120,
    height: 30,
    active: true,
    pinned: false,
    groupColor: null,
  };

  it('drag-begin describes the item + the preview chip', () => {
    expect(TabDragBeginSchema.parse(dragBegin)).toMatchObject({ item: { kind: 'tab' } });
    expect(TabDragBeginSchema.safeParse({ ...dragBegin, item: { kind: 'window', id: 't1' } }).success).toBe(
      false,
    );
  });

  it('drag-move/-end is a screen point + torn flag', () => {
    expect(TabDragPointSchema.parse({ screenX: 10, screenY: 20, torn: true })).toMatchObject({
      torn: true,
    });
    expect(TabDragPointSchema.safeParse({ screenX: 10, screenY: 20 }).success).toBe(false);
  });

  it('report-strip carries the strip rect + bounded slot list', () => {
    expect(
      TabStripGeometrySchema.parse({
        strip: { x: 0, y: 0, width: 100, height: 40 },
        slots: [{ id: 't1', left: 0, width: 50 }],
      }),
    ).toMatchObject({ slots: [{ id: 't1' }] });
    expect(
      TabStripGeometrySchema.safeParse({
        strip: { x: 0, y: 0, width: 100 },
        slots: [],
      }).success,
    ).toBe(false);
  });
});

describe('navigate / create / find / zoom / process-end', () => {
  it('the navigate + create payloads are bounded strings', () => {
    expect(NavigateInputSchema.parse('example.com')).toBe('example.com');
    expect(CreateTabInputSchema.parse(undefined)).toBeUndefined();
    expect(CreateBackgroundTabSchema.parse('https://x.test')).toBe('https://x.test');
    expect(CreateBackgroundTabSchema.safeParse('').success).toBe(false);
    expect(ContentVisibleSchema.parse(true)).toBe(true);
  });

  it('FindInPageQuerySchema rejects an empty query (Chromium throws on it)', () => {
    expect(
      FindInPageQuerySchema.parse({
        query: 'x',
        forward: true,
        findNext: false,
        matchCase: false,
      }),
    ).toMatchObject({ query: 'x' });
    expect(
      FindInPageQuerySchema.safeParse({ query: '', forward: true, findNext: false, matchCase: false })
        .success,
    ).toBe(false);
  });

  it('ZoomCommandSchema is in|out|reset; ProcessEndInputSchema wraps a tab id', () => {
    expect(ZoomCommandSchema.parse({ direction: 'reset' })).toMatchObject({ direction: 'reset' });
    expect(ZoomCommandSchema.safeParse({ direction: 'fit' }).success).toBe(false);
    expect(ProcessEndInputSchema.parse({ tabId: 't1' })).toEqual({ tabId: 't1' });
  });
});
