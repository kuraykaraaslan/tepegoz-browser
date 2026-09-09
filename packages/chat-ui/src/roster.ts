import { foldForSearch, turkishCompare } from '@tepegoz/i18n';
import type { ChatContact, ChatPresence } from '@tepegoz/shared-types';

/**
 * The pure grouping / ordering / filtering behind `<RosterPanel>`. A contact can sit in several
 * groups (XMPP roster groups); one with none lands in a single "ungrouped" bucket that always sorts
 * last. Within a group: connected contacts first (by presence rank), then Turkish-aware by name.
 */

const PRESENCE_RANK: Record<ChatPresence, number> = {
  online: 0,
  away: 1,
  xa: 2,
  dnd: 3,
  offline: 4,
};

/** The bucket key for a contact in no group — an empty string, rendered under a caller-supplied label. */
export const ROSTER_UNGROUPED = '';

export function contactDisplayName(contact: Pick<ChatContact, 'name' | 'address'>): string {
  const name = contact.name.trim();
  return name.length > 0 ? name : contact.address;
}

function compareContacts(a: ChatContact, b: ChatContact): number {
  const byPresence = PRESENCE_RANK[a.presence] - PRESENCE_RANK[b.presence];
  if (byPresence !== 0) return byPresence;
  return turkishCompare(contactDisplayName(a), contactDisplayName(b));
}

export interface RosterGroup {
  /** `ROSTER_UNGROUPED` (`''`) for contacts in no group. */
  readonly group: string;
  readonly contacts: readonly ChatContact[];
}

export function filterRoster(contacts: readonly ChatContact[], query: string): ChatContact[] {
  const needle = foldForSearch(query.trim());
  if (needle === '') return [...contacts];
  return contacts.filter(
    (c) =>
      foldForSearch(c.name).includes(needle) || foldForSearch(c.address).includes(needle),
  );
}

/**
 * Bucket contacts by group, sorted: named groups Turkish-alphabetically, then the ungrouped bucket.
 * Empty groups are dropped. Pass an already-filtered list if you want search applied.
 */
export function groupRoster(contacts: readonly ChatContact[]): RosterGroup[] {
  const buckets = new Map<string, ChatContact[]>();
  const add = (group: string, contact: ChatContact): void => {
    const bucket = buckets.get(group) ?? [];
    bucket.push(contact);
    buckets.set(group, bucket);
  };

  for (const contact of contacts) {
    if (contact.groups.length === 0) add(ROSTER_UNGROUPED, contact);
    else for (const group of contact.groups) add(group, contact);
  }

  const named = [...buckets.keys()].filter((g) => g !== ROSTER_UNGROUPED).sort(turkishCompare);
  const order = buckets.has(ROSTER_UNGROUPED) ? [...named, ROSTER_UNGROUPED] : named;

  return order.map((group) => ({
    group,
    contacts: [...(buckets.get(group) ?? [])].sort(compareContacts),
  }));
}

export function onlineCount(contacts: readonly Pick<ChatContact, 'presence'>[]): number {
  return contacts.reduce((n, c) => n + (c.presence === 'offline' ? 0 : 1), 0);
}
