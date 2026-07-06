import { z } from 'zod';
import { FILE_ACCESS_MODES } from '@tepegoz/shared-types/file-access';

/**
 * Zod argument schemas for the `file_*` / `fileaccess_*` tools registered by
 * {@link registerFileOperations} (see `./file-operations-tools`). Kept separate so the
 * tool-registration file can stay focused on wiring, not shape definitions.
 */

export const PathArg = z.string().min(1).max(4096);
export const EncodingArg = z.enum(['utf8', 'base64']);
export const ContentArg = z.string().max(5_000_000);

export const ReadFileArgs = z.object({ path: PathArg, encoding: EncodingArg.optional() });
export const ListArgs = z.object({ path: PathArg });
export const MetaArgs = z.object({ path: PathArg });
export const SearchArgs = z.object({
  path: PathArg,
  pattern: z.string().min(1).max(256),
  limit: z.number().int().positive().max(1000).optional(),
});
export const CreateFileArgs = z.object({ path: PathArg, content: ContentArg, encoding: EncodingArg.optional() });
export const UpdateFileArgs = z.object({
  path: PathArg,
  content: ContentArg,
  mode: z.enum(['overwrite', 'append']).optional(),
  encoding: EncodingArg.optional(),
});
export const MkdirArgs = z.object({ path: PathArg });
export const CopyArgs = z.object({ from: PathArg, to: PathArg });
export const MoveArgs = z.object({ from: PathArg, to: PathArg });
export const DeleteArgs = z.object({ path: PathArg, recursive: z.boolean().optional() });
export const NoArgs = z.object({}).strip();
export const CreateGrantArgs = z.object({
  path: PathArg,
  mode: z.enum(FILE_ACCESS_MODES).optional(),
  recursive: z.boolean().optional(),
});
export const UpdateGrantArgs = z.object({
  path: PathArg,
  mode: z.enum(FILE_ACCESS_MODES).optional(),
  recursive: z.boolean().optional(),
});
export const DeleteGrantArgs = z.object({ path: PathArg });
