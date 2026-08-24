import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import {
  nativeI18nSelectors,
  NATIVE_I18N_MESSAGE,
} from '../../../../../eslint.native-i18n.config.mjs';

/**
 * The native-surface i18n gate, held to its own standard.
 *
 * A lint rule that has never been observed to FIRE is indistinguishable from one whose selectors
 * match nothing — and these selectors are esquery strings, so a typo, an ESLint upgrade, or a
 * refactor of the AST shape would silently turn the gate off with every pipeline still green. That is
 * exactly the "landed code is not a closed phase" failure the repo's own phase rules name.
 *
 * So each case below is a VERBATIM shape of a defect that actually shipped in this repo, and the
 * suite asserts both directions: the five untranslated surfaces are caught, and the one interpolation
 * that is legitimately pure data is NOT — because a rule that also fires on correct code is a rule
 * that gets disabled rather than obeyed.
 *
 * Runs ESLint with ONLY this rule and no type information: the assertion is about the selectors, and
 * loading the repo's full type-checked config here would make the test slow and couple it to
 * everything else the config does.
 */
const linter = new ESLint({
  overrideConfigFile: true,
  overrideConfig: {
    // `files` is not optional here: a flat config with no matching entry reports the fixture as
    // "ignored because no matching configuration was supplied" and returns ZERO messages — which
    // would make every "does not flag" case pass for the wrong reason.
    files: ['**/*.ts'],
    languageOptions: { parser: tsParser },
    rules: { 'no-restricted-syntax': ['error', ...nativeI18nSelectors] },
  },
});

async function violations(code: string): Promise<string[]> {
  const [result] = await linter.lintText(code, { filePath: 'fixture.ts' });
  return (result?.messages ?? []).map((m) => m.message);
}

describe('native-surface i18n gate', () => {
  /** Every entry is a shape that shipped English-only under a green `pnpm lint`. */
  const caught: [name: string, code: string][] = [
    [
      // apps/desktop/src/main/agent/task-agent-runner.electron.ts — a scheduled run's OS notification,
      // the one surface where there is no panel on screen to read instead.
      'a notification title chosen by a ternary',
      `NotificationHost.push({ title: kind === 'handoff' ? 'Task needs handoff' : 'Task needs approval' });`,
    ],
    [
      // apps/desktop/src/main/tasks/task-service-scheduler.electron.ts
      'a notification title interpolating a task name',
      'NotificationHost.push({ title: `Task started: ${name}` });',
    ],
    [
      // apps/desktop/src/main/extensions/translate-host.electron.ts — the CONSENT dialog. Consent
      // given in a language you do not read is not consent, so this is the one that mattered most.
      'the buttons of a consent dialog built as a typed local',
      `const opts: MessageBoxOptions = { buttons: ['Allow and remember', 'Deny and remember', 'Not now'] };`,
    ],
    [
      'the title and message of a consent dialog built as a typed local',
      `const opts: MessageBoxOptions = { title: 'Cloud translation requested', message: 'A page needs cloud fallback.' };`,
    ],
    [
      // apps/desktop/src/main/extensions/translate-context-menu-contributor.electron.ts
      'a native context-menu label',
      `Menu.buildFromTemplate([{ label: 'Translate page' }]);`,
    ],
    [
      // apps/desktop/src/main/ipc/ipc-network.ts
      'a file-picker title passed inline at the call',
      `dialog.showOpenDialog({ title: 'WireGuard profile', properties: ['openFile'] });`,
    ],
    [
      'an OS notification constructed directly',
      `new Notification({ title: 'Task done', body: 'Finished' });`,
    ],
  ];

  for (const [name, code] of caught) {
    it(`flags ${name}`, async () => {
      const found = await violations(code);
      expect(found.length).toBeGreaterThan(0);
      expect(found[0]).toBe(NATIVE_I18N_MESSAGE);
    });
  }

  /**
   * The other direction, and the reason the selectors walk the value chain explicitly instead of
   * matching descendants. Each of these is CORRECT code that an over-broad rule flagged: measured on
   * this repo, a descendant-matching version produced 11 findings and every one was false.
   */
  const allowed: [name: string, code: string][] = [
    [
      'an interpolation that is pure data joined by punctuation',
      'NotificationHost.push({ body: `${toolName}: ${reason}` });',
    ],
    [
      'a placeholder handed to .replace() on a dictionary string',
      `NotificationHost.push({ title: strings.startedTitle.replace('{name}', task.name) });`,
    ],
    [
      'a comparison operand inside the chosen branch',
      `Menu.buildFromTemplate([{ label: scope === 'tab' ? t.a : t.b }]);`,
    ],
    [
      'a numeric argument in the value expression',
      'NotificationHost.push({ body: prompt.slice(0, 140) });',
    ],
    ['a non-text numeric option', `const opts: MessageBoxOptions = { defaultId: 0, cancelId: 2 };`],
    [
      'a title that is not on a native surface at all (a zod schema, an LLM tool definition)',
      `const schema = { title: 'The page URL', description: 'Where to navigate' };`,
    ],
  ];

  for (const [name, code] of allowed) {
    it(`does not flag ${name}`, async () => {
      expect(await violations(code)).toEqual([]);
    });
  }
});
