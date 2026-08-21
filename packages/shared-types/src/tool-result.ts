import { z } from 'zod';
import { ToolErrorSchema } from './tool-descriptor';

export const TOOL_ARTIFACT_KINDS = ['text', 'file', 'blob', 'link', 'screenshot'] as const;
export type ToolArtifactKind = (typeof TOOL_ARTIFACT_KINDS)[number];

export const ToolArtifactRefSchema = z.object({
  id: z.string().min(1).max(128),
  kind: z.enum(TOOL_ARTIFACT_KINDS),
  title: z.string().min(1).max(256),
  mimeType: z.string().max(256).optional(),
  summary: z.string().max(2048).optional(),
  blobRef: z
    .string()
    .regex(/^cas:\/\/[a-f0-9]{64}$/)
    .optional(),
  url: z.string().max(4096).optional(),
});
export type ToolArtifactRef = z.infer<typeof ToolArtifactRefSchema>;

export const ToolPageRefSchema = z.object({
  tabId: z.string().min(1).max(128).optional(),
  url: z.string().min(1).max(4096),
  title: z.string().max(2048).optional(),
  selector: z.string().max(1024).optional(),
});
export type ToolPageRef = z.infer<typeof ToolPageRefSchema>;

export const ToolSuccessSchema = z.object({
  ok: z.literal(true),
  summary: z.string().max(4096),
  content: z.unknown().optional(),
  artifacts: z.array(ToolArtifactRefSchema).max(100).default([]),
  pageRefs: z.array(ToolPageRefSchema).max(100).default([]),
});
export type ToolSuccess<T = unknown> = Omit<z.infer<typeof ToolSuccessSchema>, 'content'> & {
  content?: T | undefined;
};

export const ToolResultSchema = z.union([ToolSuccessSchema, ToolErrorSchema]);
export type ToolResult<T = unknown> = ToolSuccess<T> | z.infer<typeof ToolErrorSchema>;

export function toolSuccess<T>(
  summary: string,
  options: {
    content?: T | undefined;
    artifacts?: ToolArtifactRef[] | undefined;
    pageRefs?: ToolPageRef[] | undefined;
  } = {},
): ToolSuccess<T> {
  return {
    ok: true,
    summary,
    ...(options.content !== undefined ? { content: options.content } : {}),
    artifacts: options.artifacts ?? [],
    pageRefs: options.pageRefs ?? [],
  };
}
