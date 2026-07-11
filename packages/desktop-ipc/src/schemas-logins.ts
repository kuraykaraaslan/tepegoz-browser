import { z } from 'zod';

// Login credential manager schemas (logins:* channels).
/** `logins:set` — the only channel that carries a plaintext secret (renderer → main). Main encrypts
 *  immediately via safeStorage; the raw value is never stored or returned. */
export const LoginSetSchema = z.object({
  url: z.string().min(1).max(4096),
  username: z.string().min(1).max(512),
  /** Plaintext — encrypted in main on arrival. */
  secret: z.string().min(1).max(4096),
  title: z.string().max(512).optional(),
  notes: z.string().max(4096).optional(),
});
export const LoginIdSchema = z.string().min(1).max(128);
export const LoginImportSchema = z.object({
  data: z.string().max(10_485_760),
  format: z.enum(['google-csv', 'generic-csv']),
});
export const LoginExportSchema = z.enum(['google-csv', 'generic-csv']);
/** `logins:fill` — renderer tells main which stored credential to inject into the active page. */
export const LoginFillSchema = z.object({
  credentialId: z.string().min(1).max(128),
  tabId: z.string().min(1).max(64).optional(),
});
