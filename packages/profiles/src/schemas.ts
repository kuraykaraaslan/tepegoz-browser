import { z } from 'zod';
import { type Profile, type ProfilesFile } from './profiles-model';

/** Matches `default` or a sequential `profile-N` (see `profiles-registry.ts#nextProfileId`). */
export const ProfileIdSchema = z.string().regex(/^(default|profile-\d+)$/);

export const ProfileSchema = z.object({
  id: ProfileIdSchema,
  name: z.string().min(1).max(64),
  colorId: z.number().int().nonnegative(),
  avatarInitial: z.string().max(4).optional(),
  createdAt: z.number().int().nonnegative(),
  lastUsedAt: z.number().int().nonnegative(),
}) satisfies z.ZodType<Profile>;

export const ProfilesFileSchema = z.object({
  version: z.literal(1),
  profiles: z.array(ProfileSchema),
  defaultProfileId: ProfileIdSchema,
  lastActiveProfileId: ProfileIdSchema,
}) satisfies z.ZodType<ProfilesFile>;

/** IPC input validation (main process only) — the domain types above stay the single source; these
 *  describe the untrusted renderer→main payload shapes, not persisted records. Consumed by
 *  `@tepegoz/desktop-ipc`'s `contract-profiles.ts` (PR4). */
export const CreateProfileInputSchema = z.object({
  /** Omit for a Chrome-style auto-named profile ("Profile N") the user renames afterward. */
  name: z.string().min(1).max(64).optional(),
  colorId: z.number().int().nonnegative().optional(),
});
export type CreateProfileInput = z.infer<typeof CreateProfileInputSchema>;

export const RenameProfileInputSchema = z.object({
  id: ProfileIdSchema,
  name: z.string().min(1).max(64),
});
export type RenameProfileInput = z.infer<typeof RenameProfileInputSchema>;
