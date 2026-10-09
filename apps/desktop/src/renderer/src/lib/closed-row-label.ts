import type { ClosedTab } from '@tepegoz/desktop-ipc';

interface ClosedRowStrings {
  closedGroupOne: string;
  closedGroupOther: string;
  closedGroupUntitled: string;
}

/** The text of one "Recently closed" row: a page title (or URL), or "Name — N tabs" for a closed group. */
export function closedRowLabel(t: ClosedTab, s: ClosedRowStrings): string {
  if (t.group === undefined) return t.title.length > 0 ? t.title : t.url;
  const name = t.group.name.trim().length > 0 ? t.group.name : s.closedGroupUntitled;
  return (t.group.count === 1 ? s.closedGroupOne : s.closedGroupOther)
    .replace('{name}', () => name)
    .replace('{count}', String(t.group.count));
}
