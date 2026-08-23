import { describe, expect, it } from 'vitest';
import { AgentRunInputSchema } from '@tepegoz/desktop-ipc/schemas';
import {
  MAX_ATTACHMENT_CHARS,
  MAX_ATTACHMENT_LABEL_CHARS,
  MAX_ATTACHMENTS,
  MAX_USER_PROMPT_CHARS,
} from '@tepegoz/shared-types';

/**
 * The `agent:run` payload bound, against the largest prompt the Agent panel can actually build.
 *
 * This is a regression test for a two-sided bug that neither side could see alone. The panel inlines
 * up to MAX_ATTACHMENT_CHARS of each attachment ahead of the user's text; the boundary capped the
 * whole assembled string at the USER-text bound. Attaching one page selection longer than a short
 * paragraph therefore produced a payload the boundary refused — and because the handler validated
 * with a bare `.parse()`, the ZodError became a 500 "Internal error" that named neither the field
 * nor the reason.
 *
 * So the assertion is not "some big prompt fits". It is that the panel's own worst case fits, built
 * from the same constants the panel truncates by.
 */
describe('AgentRunInputSchema — the panel/boundary size contract', () => {
  /** The largest prompt `serializeAttachments` can emit: every attachment, each at its full budget. */
  function maximalPanelPrompt(): string {
    const label = 'a'.repeat(MAX_ATTACHMENT_LABEL_CHARS);
    const parts = Array.from(
      { length: MAX_ATTACHMENTS },
      () => `[File: ${label}]\n\`\`\`\n${'x'.repeat(MAX_ATTACHMENT_CHARS)}\n\`\`\``,
    );
    return `${parts.join('\n\n')}\n\n---\n\n${'t'.repeat(MAX_USER_PROMPT_CHARS)}`;
  }

  it('accepts the largest prompt the panel can assemble', () => {
    const parsed = AgentRunInputSchema.safeParse({
      prompt: maximalPanelPrompt(),
      groupId: 'g-1',
      displayPrompt: 't'.repeat(MAX_USER_PROMPT_CHARS),
    });

    expect(parsed.success).toBe(true);
  });

  it('accepts a single attachment at its full budget — the case that used to fail', () => {
    const prompt = `[Selected text from page]\n> ${'x'.repeat(MAX_ATTACHMENT_CHARS)}\n\n---\n\nsummarise this`;
    expect(prompt.length).toBeGreaterThan(MAX_USER_PROMPT_CHARS);

    expect(AgentRunInputSchema.safeParse({ prompt, groupId: 'g-1' }).success).toBe(true);
  });

  it('still bounds the prompt — the cap is derived, not removed', () => {
    const prompt = 'x'.repeat(
      MAX_USER_PROMPT_CHARS + MAX_ATTACHMENTS * (MAX_ATTACHMENT_CHARS + MAX_ATTACHMENT_LABEL_CHARS) * 2,
    );

    expect(AgentRunInputSchema.safeParse({ prompt, groupId: 'g-1' }).success).toBe(false);
  });

  it('rejects an empty prompt and a missing group', () => {
    expect(AgentRunInputSchema.safeParse({ prompt: '', groupId: 'g-1' }).success).toBe(false);
    expect(AgentRunInputSchema.safeParse({ prompt: 'do it', groupId: '' }).success).toBe(false);
  });
});
