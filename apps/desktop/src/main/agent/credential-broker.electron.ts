import { Logger } from '@tepegoz/libs';
import { matchCredential, requireOsAuth } from '@tepegoz/security-policy';
import { passwordVault } from '../stores.electron';

/**
 * The credential broker's fill, in main (S6 PR6).
 *
 * The design property is what the agent is *never given*: it names a field and a ref, main does
 * everything else, and the result carries no secret, no username, and no length. A model that never had
 * the password cannot be talked into leaking it — which is the only version of this that survives a
 * prompt injection.
 *
 * The origin is read from the **live tab**, never from the agent. An agent-supplied origin is precisely
 * how a poisoned page would aim a saved credential at a site of its choosing.
 *
 * Every refusal is honest and reason-carrying, because the agent's correct next move differs: no vault →
 * ask the user to save one; no OS auth → the user declined; ambiguous → ask which identity.
 */
export async function fillCredential(
  ref: number,
  field: 'username' | 'password',
  tabId: string | undefined,
  deps: {
    pageUrl: (tabId?: string) => string;
    fill: (ref: number, text: string, tabId?: string) => Promise<unknown>;
    /**
     * The text the OS-auth prompt shows the user. Injected because it is a **localized, user-facing**
     * string and this module runs in main, where there is no dictionary — the same pattern the handoff
     * copy already uses. The English fallback is a developer default, not the shipping surface: the
     * localized prompt lands with the platform gate itself (the phase's spike-first item).
     */
    promptText?: (field: 'username' | 'password', origin: string) => string;
  },
): Promise<{ filled: boolean; field: 'username' | 'password'; origin: string; reason?: string }> {
  const origin = deps.pageUrl(tabId);
  const refuse = (reason: string): { filled: false; field: typeof field; origin: string; reason: string } => {
    // Logged WITHOUT the secret or the username — a refusal is an event, not a disclosure.
    Logger.info('[s6] credential fill refused', { field, origin, reason });
    return { filled: false, field, origin, reason };
  };

  const saved = await passwordVault.findByUrl(origin).catch(() => []);
  const match = matchCredential(
    origin,
    saved.map((entry) => ({ id: entry.id, origin: entry.url })),
  );
  if (!match.ok) return refuse(match.reason);

  // Ask the human BEFORE the secret is decrypted. Ordering matters: a declined prompt must leave the
  // plaintext having never existed in this process's memory.
  const approved = await requireOsAuth(
    deps.promptText?.(field, origin) ??
      (field === 'password'
        ? `Fill your saved password on ${origin}`
        : `Fill your saved username on ${origin}`),
  );
  if (!approved) {
    return refuse('the user did not confirm the credential fill');
  }

  const entry = saved.find((candidate) => candidate.id === match.credentialId);
  if (entry === undefined) return refuse('the saved credential disappeared before it could be used');

  let value: string;
  try {
    value = field === 'username' ? entry.username : passwordVault.decrypt(entry);
  } catch {
    return refuse('the saved credential could not be decrypted on this device');
  }
  if (value.length === 0) return refuse('the saved credential has no value for that field');

  await deps.fill(ref, value, tabId);
  // The audit line records THAT it happened and where — never what was typed.
  Logger.info('[s6] credential filled', { field, origin });
  return { filled: true, field, origin };
}
