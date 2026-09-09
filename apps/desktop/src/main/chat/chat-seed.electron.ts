import type { ChatAccount } from '@tepegoz/shared-types';
import { ChatAccountSchema } from '@tepegoz/shared-types';
import { Logger } from '@tepegoz/libs';

/**
 * Dev-only account seeding. `safeStorage` (and therefore `ChatSecrets`) only works inside the running
 * app, so a credential cannot be planted from a plain Node script — this closes that gap for local
 * testing without a UI round-trip.
 *
 * `TEPEGOZ_CHAT_SEED="jid|password;jid2|password2"` — each entry is an XMPP bare JID and its password.
 * Ignored entirely in a packaged build. An entry whose derived id already exists is skipped, so it is
 * safe to leave the variable set across restarts.
 */

const SEED_ENV = 'TEPEGOZ_CHAT_SEED';

export interface ChatSeedEntry {
  account: ChatAccount;
  secret: string;
}

/** `kklama@xmpp.jp` → `kklama-xmpp-jp` (a valid `CHAT_ACCOUNT_ID_PATTERN` slug). */
export function deriveSeedAccountId(jid: string): string {
  return jid
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Parse `TEPEGOZ_CHAT_SEED` into validated XMPP accounts; malformed entries are dropped with a log. */
export function parseChatSeed(raw: string | undefined, now = Date.now()): ChatSeedEntry[] {
  if (raw === undefined || raw.trim().length === 0) return [];
  const out: ChatSeedEntry[] = [];
  for (const chunk of raw.split(';')) {
    const entry = chunk.trim();
    if (entry.length === 0) continue;
    const sep = entry.indexOf('|');
    const jid = (sep === -1 ? entry : entry.slice(0, sep)).trim();
    const secret = sep === -1 ? '' : entry.slice(sep + 1);
    if (!jid.includes('@') || secret.length === 0) {
      Logger.warn('Ignoring a malformed TEPEGOZ_CHAT_SEED entry', { entry: jid });
      continue;
    }
    const id = deriveSeedAccountId(jid);
    const parsed = ChatAccountSchema.safeParse({
      id,
      label: jid,
      displayName: jid.slice(0, jid.indexOf('@')),
      server: { protocol: 'xmpp', jid },
      secretRef: `chat:${id}`,
      updatedAt: now,
      version: 1,
    });
    if (!parsed.success) {
      Logger.warn('Ignoring an invalid TEPEGOZ_CHAT_SEED entry', { jid });
      continue;
    }
    out.push({ account: parsed.data, secret });
  }
  return out;
}

interface SeedTarget {
  listAccounts: () => ReadonlyArray<{ id: string }>;
  addAccount: (account: ChatAccount, plainSecret: string) => Promise<void>;
}

/** Add any `TEPEGOZ_CHAT_SEED` accounts that are not already configured. Dev builds only. */
export async function seedChatAccountsFromEnv(
  service: SeedTarget,
  opts: { isPackaged: boolean; env?: string | undefined } = { isPackaged: true },
): Promise<void> {
  if (opts.isPackaged) return;
  const entries = parseChatSeed(opts.env ?? process.env[SEED_ENV]);
  if (entries.length === 0) return;
  const existing = new Set(service.listAccounts().map((a) => a.id));
  for (const { account, secret } of entries) {
    if (existing.has(account.id)) continue;
    try {
      await service.addAccount(account, secret);
      Logger.info('Seeded a chat account from TEPEGOZ_CHAT_SEED', { id: account.id });
    } catch (err) {
      Logger.error('Could not seed a chat account', { id: account.id, err: String(err) });
    }
  }
}
