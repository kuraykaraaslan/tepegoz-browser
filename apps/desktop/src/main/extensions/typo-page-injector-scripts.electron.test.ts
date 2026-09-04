import { describe, expect, it } from 'vitest';
import { TYPO_SCRIPT_HEAD } from './typo-page-injector-script-head.electron';
import { TYPO_SCRIPT_TAIL } from './typo-page-injector-script-tail.electron';

/**
 * The two halves of the typo page-context script are plain exported string constants — the runtime
 * behaviour is exercised in the page (e2e) and through `typo-page-injector.electron`, which stitches
 * HEAD + `<per-call payload>` + TAIL together. `typo-page-injector.electron.test.ts` mocks both
 * modules, so this is the only place the real strings are loaded: pin that they are non-trivial and
 * that HEAD opens the IIFE the TAIL closes (a mismatched split would inject a syntax error into every
 * page).
 */

describe('typo page-context script halves', () => {
  it('HEAD is a substantial script that opens the install-guard IIFE', () => {
    expect(typeof TYPO_SCRIPT_HEAD).toBe('string');
    expect(TYPO_SCRIPT_HEAD.length).toBeGreaterThan(500);
    expect(TYPO_SCRIPT_HEAD).toContain('__tepegozTypoInstalled');
    expect(TYPO_SCRIPT_HEAD).toContain('(() => {');
  });

  it('TAIL is a substantial script that closes the IIFE HEAD opened', () => {
    expect(typeof TYPO_SCRIPT_TAIL).toBe('string');
    expect(TYPO_SCRIPT_TAIL.length).toBeGreaterThan(500);
    expect(TYPO_SCRIPT_TAIL.trimEnd().endsWith('})();')).toBe(true);
  });
});
