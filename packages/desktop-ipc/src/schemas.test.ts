import { describe, expect, it } from 'vitest';
import * as facade from './schemas';
import { TabIdSchema } from './schemas-tabs';
import { TrustDomainSchema } from './schemas-trust';

/**
 * `schemas.ts` is the single import surface the main-process IPC handlers use — it re-exports every
 * `schemas-<domain>` sibling plus a handful of cross-package schemas (downloads / uploads / tasks /
 * agent-history / clipboard). Pin that the barrel actually resolves them: a dropped `export *` line
 * would leave a handler importing `undefined` and `safeParse`-ing every payload to a crash.
 */

describe('schemas barrel', () => {
  it('re-exports the local domain schemas as the same objects', () => {
    expect(facade.TabIdSchema).toBe(TabIdSchema);
    expect(facade.TrustDomainSchema).toBe(TrustDomainSchema);
  });

  it('re-exports the cross-package schemas named in schemas.ts', () => {
    for (const name of [
      'DownloadCommandInputSchema',
      'DownloadCreateInputSchema',
      'UploadCommandInputSchema',
      'UploadCreateInputSchema',
      'TaskCommandInputSchema',
      'TaskDefinitionSchema',
      'TaskSaveInputSchema',
      'AgentConversationIdSchema',
      'AgentConversationListInputSchema',
      'AgentConversationOpenInputSchema',
      'ClipboardOperationInputSchema',
      'ClipboardReadTextInputSchema',
      'ClipboardWriteTextInputSchema',
    ]) {
      const exported = (facade as Record<string, { safeParse?: unknown } | undefined>)[name];
      expect(exported, name).toBeDefined();
      expect(exported?.safeParse).toBeTypeOf('function');
    }
  });

  it('a representative re-exported schema still validates through the barrel', () => {
    expect(facade.MacroIdSchema.parse('m1')).toBe('m1');
    expect(facade.PageMenuActionSchema.safeParse('rm-rf').success).toBe(false);
  });
});
