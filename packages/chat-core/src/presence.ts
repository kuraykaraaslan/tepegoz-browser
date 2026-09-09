import type { ChatPresence } from '@tepegoz/shared-types';
import { bareJid, parseJid } from './address';

/**
 * Per-contact presence folding. A contact (bare JID) may have several connected resources, each with
 * its own show value and priority. `PresenceTracker` keeps them and computes the one **effective**
 * presence a UI shows: the highest-priority resource, ties broken by availability (RFC 6121 §4.4 —
 * "most available"). When a resource goes `unavailable` it is dropped; with no resources left the
 * contact is `offline`.
 */

/** Availability rank — higher is "more available". Used only to break priority ties. */
const RANK: Record<ChatPresence, number> = {
  online: 4,
  away: 3,
  xa: 2,
  dnd: 1,
  offline: 0,
};

interface ResourceState {
  presence: ChatPresence;
  statusText: string;
  priority: number;
}

export interface EffectivePresence {
  presence: ChatPresence;
  statusText: string;
}

export class PresenceTracker {
  /** bare JID → (resource → state). A bare-only presence uses the empty-string resource key. */
  private readonly contacts = new Map<string, Map<string, ResourceState>>();

  /** Apply one presence update. `address` is a full JID (`user@host/res`) or a bare JID. */
  apply(address: string, presence: ChatPresence, statusText = '', priority = 0): void {
    const bare = bareJid(address);
    if (bare === null || bare.length === 0) return;
    const resource = parseJid(address)?.resource ?? '';
    let resources = this.contacts.get(bare);

    if (presence === 'offline') {
      if (resources === undefined) return;
      resources.delete(resource);
      if (resources.size === 0) this.contacts.delete(bare);
      return;
    }

    if (resources === undefined) {
      resources = new Map();
      this.contacts.set(bare, resources);
    }
    resources.set(resource, { presence, statusText: statusText.slice(0, 512), priority });
  }

  /** Apply a normalized `presence` `ChatEvent`. */
  applyEvent(event: { address: string; presence: ChatPresence; statusText?: string }): void {
    this.apply(event.address, event.presence, event.statusText ?? '');
  }

  /** The folded presence for a contact (accepts a bare or full JID). */
  effective(address: string): EffectivePresence {
    const bare = bareJid(address);
    const resources = bare === null ? undefined : this.contacts.get(bare);
    if (resources === undefined || resources.size === 0) {
      return { presence: 'offline', statusText: '' };
    }
    let best: ResourceState | null = null;
    for (const state of resources.values()) {
      if (
        best === null ||
        state.priority > best.priority ||
        (state.priority === best.priority && RANK[state.presence] > RANK[best.presence])
      ) {
        best = state;
      }
    }
    return best === null
      ? { presence: 'offline', statusText: '' }
      : { presence: best.presence, statusText: best.statusText };
  }

  /** Number of connected resources for a contact. */
  resourceCount(address: string): number {
    const bare = bareJid(address);
    return bare === null ? 0 : (this.contacts.get(bare)?.size ?? 0);
  }

  /** Bare JIDs currently showing any non-offline presence. */
  onlineContacts(): string[] {
    return [...this.contacts.keys()];
  }

  /** Forget one contact (all its resources), or everything when no argument is given. */
  clear(address?: string): void {
    if (address === undefined) {
      this.contacts.clear();
      return;
    }
    const bare = bareJid(address);
    if (bare !== null) this.contacts.delete(bare);
  }
}
