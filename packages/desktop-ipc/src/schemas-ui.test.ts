import { describe, expect, it } from 'vitest';
import {
  ContentBoundsSchema,
  NotificationIdSchema,
  NotificationPermissionResponseSchema,
  PageInfoGetSchema,
  PageMenuActionSchema,
  PageMenuContributionActionSchema,
  PopupOpenSchema,
  PopupResizeSchema,
  SubmenuOpenSchema,
} from './schemas-ui';

/**
 * Runtime (zod) guards for the window-chrome IPC channels — popups, submenus, the page-menu, the
 * notification prompt. `PageMenuActionSchema` in particular is a CLOSED enum: the value picks a
 * capture/command path in main, so an unknown one must fail to parse.
 */

const anchor = { x: 1, y: 2, width: 3, height: 4 };

describe('ContentBoundsSchema', () => {
  it('requires all four numeric fields', () => {
    expect(ContentBoundsSchema.parse(anchor)).toEqual(anchor);
    expect(ContentBoundsSchema.safeParse({ x: 1, y: 2, width: 3 }).success).toBe(false);
  });
});

describe('PopupOpenSchema', () => {
  it('accepts a surface + anchor, with id / height / align optional', () => {
    expect(PopupOpenSchema.parse({ surface: 'main-menu', anchor })).toMatchObject({
      surface: 'main-menu',
    });
    expect(
      PopupOpenSchema.parse({ surface: 'ext', id: 'e1', anchor, height: 300, align: 'start' }),
    ).toMatchObject({ align: 'start' });
  });

  it('rejects an empty surface, a non-positive height, and an unknown align', () => {
    expect(PopupOpenSchema.safeParse({ surface: '', anchor }).success).toBe(false);
    expect(PopupOpenSchema.safeParse({ surface: 's', anchor, height: 0 }).success).toBe(false);
    expect(PopupOpenSchema.safeParse({ surface: 's', anchor, align: 'middle' }).success).toBe(false);
  });
});

describe('PopupResizeSchema / PageInfoGetSchema / SubmenuOpenSchema', () => {
  it('resize is a positive bounded height', () => {
    expect(PopupResizeSchema.parse({ height: 420 })).toEqual({ height: 420 });
    expect(PopupResizeSchema.safeParse({ height: 3000 }).success).toBe(false);
  });

  it('page-info:get is a bounded URL', () => {
    expect(PageInfoGetSchema.parse({ url: 'https://x.test' })).toMatchObject({ url: 'https://x.test' });
    expect(PageInfoGetSchema.safeParse({ url: '' }).success).toBe(false);
  });

  it('submenu:open needs a kind + anchor', () => {
    expect(SubmenuOpenSchema.parse({ kind: 'file', anchor })).toMatchObject({ kind: 'file' });
    expect(SubmenuOpenSchema.safeParse({ kind: '', anchor }).success).toBe(false);
  });
});

describe('PageMenuActionSchema', () => {
  it('accepts a wired action and rejects anything else', () => {
    expect(PageMenuActionSchema.parse('save-as-pdf')).toBe('save-as-pdf');
    expect(PageMenuActionSchema.parse('screenshot-full-page')).toBe('screenshot-full-page');
    expect(PageMenuActionSchema.safeParse('rm-rf').success).toBe(false);
  });
});

describe('PageMenuContributionActionSchema', () => {
  it('requires the full id path, with an optional opaque payload', () => {
    expect(
      PageMenuContributionActionSchema.parse({
        menuId: 'm',
        contributorId: 'c',
        sectionId: 's',
        itemId: 'i',
        actionId: 'a',
        payload: { any: 1 },
      }),
    ).toMatchObject({ actionId: 'a' });
    expect(
      PageMenuContributionActionSchema.safeParse({ menuId: 'm', contributorId: 'c' }).success,
    ).toBe(false);
  });
});

describe('the notification prompt schemas', () => {
  it('NotificationIdSchema is a bounded id', () => {
    expect(NotificationIdSchema.parse('n1')).toBe('n1');
    expect(NotificationIdSchema.safeParse('').success).toBe(false);
  });

  it('NotificationPermissionResponseSchema needs requestId + allow + remember', () => {
    expect(
      NotificationPermissionResponseSchema.parse({ requestId: 'r1', allow: true, remember: false }),
    ).toMatchObject({ allow: true });
    expect(
      NotificationPermissionResponseSchema.safeParse({ requestId: 'r1', allow: true }).success,
    ).toBe(false);
  });
});
