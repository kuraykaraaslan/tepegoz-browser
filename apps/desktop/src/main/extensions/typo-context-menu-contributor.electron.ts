import { z } from 'zod';
import { app } from 'electron';
import PreferenceStore from '@tepegoz/preferences';
import type { PageMenuContributionActionInput } from '@tepegoz/desktop-ipc';
import { TYPO_EXTENSION_ID } from '@tepegoz/ext-typo/host';
import type {
  PageContextMenuContributionContext,
  PageContextMenuContributor,
} from '../menus/page-context-menu-contributions';
import typoHost from './typo-host.electron';

const IssueAtSchema = z
  .object({
    text: z.string().min(1).max(200),
    start: z.number().int().min(0),
    end: z.number().int().min(1),
    language: z.string().min(1).max(16).optional(),
    suggestions: z.array(z.string().min(1).max(200)).max(8),
  })
  .nullable();

const ApplySuggestionPayloadSchema = z.object({
  start: z.number().int().min(0),
  end: z.number().int().min(1),
  suggestion: z.string().min(1).max(200),
});

function localeTitle(word: string): string {
  const pref = PreferenceStore.getAll().locale;
  const locale =
    pref === 'system' ? (app.getLocale().toLowerCase().startsWith('tr') ? 'tr' : 'en') : pref;
  const label = locale === 'tr' ? 'Yazım' : 'Spelling';
  return `${label}: ${word}`;
}

const typoContextMenuContributor: PageContextMenuContributor = {
  id: TYPO_EXTENSION_ID,

  async collect(ctx: PageContextMenuContributionContext) {
    if (
      !ctx.isEditable ||
      !typoHost.isActiveForPage(ctx.pageUrl) ||
      ctx.webContents.isDestroyed()
    ) {
      return [];
    }
    const raw: unknown = await ctx.webContents.executeJavaScript(
      `window.__tepegozTypoIssueAt?.(${JSON.stringify(ctx.x)}, ${JSON.stringify(ctx.y)}) ?? null;`,
      true,
    );
    const parsed = IssueAtSchema.safeParse(raw);
    if (!parsed.success || parsed.data === null || parsed.data.suggestions.length === 0) return [];
    const issue = parsed.data;
    const word = issue.text.trim().slice(0, 40);
    return [
      {
        id: 'typo-suggestions',
        contributorId: TYPO_EXTENSION_ID,
        placement: 'top',
        priority: 0,
        title: localeTitle(word),
        items: issue.suggestions.map((suggestion, index) => ({
          id: `suggestion-${index}`,
          label: suggestion,
          actionId: 'apply-suggestion',
          payload: { start: issue.start, end: issue.end, suggestion },
        })),
      },
    ];
  },

  async runAction(input: PageMenuContributionActionInput, ctx: PageContextMenuContributionContext) {
    if (input.actionId !== 'apply-suggestion' || ctx.webContents.isDestroyed()) return;
    const parsed = ApplySuggestionPayloadSchema.safeParse(input.payload);
    if (!parsed.success) return;
    await ctx.webContents.executeJavaScript(
      `window.__tepegozTypoApplySuggestion?.(${JSON.stringify(parsed.data)}) ?? false;`,
      true,
    );
  },
};

export default typoContextMenuContributor;
