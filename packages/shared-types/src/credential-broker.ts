import { z } from 'zod';

/**
 * The credential-broker contract (S6 PR6).
 *
 * The whole point is what is **absent**. The agent asks for a field to be filled; it never asks for a
 * secret, never receives one, and has no shape here that a secret could travel in. Main resolves the
 * credential, gates it behind OS auth, and types it into the page itself — so a compromised model, a
 * poisoned page, and the run transcript all see the same thing: that a fill happened, and nothing more.
 *
 * This is the difference between "the model is instructed not to leak the password" and "the model was
 * never given the password". Only the second survives an injection.
 */

/** Which field of a login form to fill. Deliberately closed — a free-form field name is a foothold. */
export const CREDENTIAL_FIELDS = ['username', 'password'] as const;
export type CredentialField = (typeof CREDENTIAL_FIELDS)[number];
export const CredentialFieldSchema = z.enum(CREDENTIAL_FIELDS);

/**
 * What the agent may ask for: *fill this field, on this element*. There is no origin argument — the
 * origin is read from the live tab in main, because an agent-supplied origin is exactly how a poisoned
 * page would aim a credential at a site of its choosing.
 */
export const CredentialFillIntentSchema = z.object({
  ref: z.number().int().positive().max(10_000),
  field: CredentialFieldSchema,
  tabId: z.string().min(1).max(128).optional(),
});
export type CredentialFillIntent = z.infer<typeof CredentialFillIntentSchema>;

/**
 * What comes back. No secret, no username value, no length — only whether it happened and where.
 *
 * `reason` is present exactly when `filled` is false, and says which of the several honest refusals
 * occurred, so the agent can hand off to the user instead of retrying blindly.
 */
export const CredentialFillResultSchema = z.object({
  filled: z.boolean(),
  field: CredentialFieldSchema,
  /** The origin main resolved from the live tab — so the transcript records where this was aimed. */
  origin: z.string().max(2048),
  reason: z.string().max(300).optional(),
});
export type CredentialFillResult = z.infer<typeof CredentialFillResultSchema>;
