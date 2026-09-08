/**
 * Multi-profile wire types (ADR-0045). `@tepegoz/profiles` is the single source for `Profile`; the
 * type-only re-export is erased at compile time, so the sandboxed preload stays dependency-free and
 * the `.` contract entry stays zod-free.
 */
import type { Profile } from '@tepegoz/profiles';
import type { CreateProfileInput, RenameProfileInput } from '@tepegoz/profiles/schemas';
export type { Profile, CreateProfileInput, RenameProfileInput };
