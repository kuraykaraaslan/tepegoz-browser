import { z } from 'zod';

/** `agent:run` payload — prompt + the tab-group id that owns this agent session. */
export const AgentRunInputSchema = z.object({
  prompt: z.string().min(1).max(4000),
  groupId: z.string().min(1).max(64),
  displayPrompt: z.string().min(1).max(4000).optional(),
  /** The skill this run came from (S9). Main binds a remembered grant to it ONLY when the prompt
   *  still matches the stored one — an edited task is a new task, and a new task gets asked. */
  skillId: z.string().uuid().optional(),
  attachmentMeta: z
    .array(
      z.object({
        kind: z.enum(['selection', 'file', 'screenshot']),
        label: z.string().min(1).max(512),
        mimeType: z.string().max(256).optional(),
        sizeBytes: z.number().int().nonnegative().optional(),
      }),
    )
    .max(10)
    .optional(),
});
/** `agent:new-conversation` payload — the group whose history to clear. */
export const AgentNewConversationSchema = z.string().min(1).max(64);
export const AgentRunIdSchema = z.string().min(1).max(64);
/** A mid-run steering message injected into a running agent. */
export const AgentSteerSchema = z.object({
  runId: z.string().min(1).max(64),
  text: z.string().min(1).max(4000),
});
export const AgentApprovalResponseSchema = z.object({
  approvalId: z.string().min(1).max(64),
  approved: z.boolean(),
  /** The user ticked "remember this for this skill". Main re-checks whether it MAY be remembered;
   *  a renderer asking to remember something ungrantable simply gets an ordinary approval. */
  remember: z.boolean().optional(),
});

export const AgentPlanResponseSchema = z.object({
  planId: z.string().min(1).max(64),
  approved: z.boolean(),
  skipStepIds: z.array(z.string().max(64)).max(100).optional(),
});

/** `agent:open-file` payload — an absolute path the agent produced; opened only if inside a grant. */
export const AgentOpenFileSchema = z.string().min(1).max(4096);

/** `agent:export-conversation` payload — the rendered chat-log text plus an optional title used to
 *  derive the filename (the main process sanitizes it and stamps a timestamp). */
export const AgentExportConversationSchema = z.object({
  content: z.string().min(1).max(5_000_000),
  title: z.string().max(200).optional(),
});

/** `agent:export-bundle` payload — the rendered chat-log text (written as `chat.md`), the agent session
 *  group id whose tabs/memory the main process gathers, and optional display meta echoed into the
 *  manifest. The heavy diagnostics (tab DOM/PNG snapshots, model-visible memory, journal, environment)
 *  are collected in the main process, which is the only side that can reach a tab's webContents. */
export const AgentExportBundleSchema = z.object({
  chatContent: z.string().min(1).max(5_000_000),
  groupId: z.string().min(1).max(200),
  meta: z
    .object({
      provider: z.string().max(100).optional(),
      autonomy: z.string().max(50).optional(),
      effort: z.string().max(50).optional(),
      tokens: z
        .object({
          inputTokens: z.number().optional(),
          outputTokens: z.number().optional(),
          totalTokens: z.number().optional(),
        })
        .optional(),
      title: z.string().max(200).optional(),
    })
    .optional(),
});

export const HistoryQuerySchema = z.string().max(200);
export const HistoryUrlSchema = z.string().min(1).max(4096);

export const HistoryPageParamsSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});
export const HistorySearchParamsSchema = z.object({
  query: z.string().max(200).default(''),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

/** `agent-skills:save` payload. Bounds mirror SkillRecordSchema in @tepegoz/shared-types, which stays
 *  the single source for the stored shape; this validates only what crosses the IPC boundary. An
 *  omitted `id` means "new skill" — the main process mints the UUID, never the renderer. */
export const AgentSkillSaveSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  prompt: z.string().min(1).max(2000),
  startUrl: z.string().max(2048).optional(),
  grantProfile: z.string().max(80).optional(),
});
export type AgentSkillSaveInput = z.infer<typeof AgentSkillSaveSchema>;

export const AgentSkillIdSchema = z.string().uuid();
