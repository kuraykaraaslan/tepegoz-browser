import { describe, expect, it } from 'vitest';
import { POLICY_REASONS } from '@tepegoz/security-policy';
import { en } from './locales/en';
import { tr } from './locales/tr';

/**
 * Permission Debug's completeness guarantee.
 *
 * The Policy Kernel's reason codes are a closed union, so adding a rule without listing its code is
 * already a compile error. This closes the other half: listing a code without EXPLAINING it is a test
 * failure. Together they mean the explanation gets written when the rule is written, by the person who
 * knows why the rule exists — rather than reverse-engineered later from an identifier.
 *
 * It matters because the failure mode is silent and one-sided. A missing explanation does not crash; it
 * shows the user `tainted_side_effect` and moves on, and only someone who hits that exact wall ever
 * finds out.
 */
describe('every policy reason code is explained to the user', () => {
  it('covers all of them, in both locales', () => {
    const missingEn = POLICY_REASONS.filter((r) => !(r in en.permissions));
    const missingTr = POLICY_REASONS.filter((r) => !(r in tr.permissions));
    expect(missingEn, 'reason codes with no English explanation').toEqual([]);
    expect(missingTr, 'reason codes with no Turkish explanation').toEqual([]);
  });

  it('carries no explanation for a code the kernel cannot emit', () => {
    // A stale entry is not harmless: it is text nobody will ever see, which reads as coverage.
    const stale = Object.keys(en.permissions).filter(
      (k) => !(POLICY_REASONS as readonly string[]).includes(k),
    );
    expect(stale).toEqual([]);
  });

  it('answers all three questions for every code, with nothing left blank', () => {
    for (const reason of POLICY_REASONS) {
      for (const locale of [en, tr]) {
        const entry = locale.permissions[reason];
        expect(entry.title.trim().length, `${reason}.title`).toBeGreaterThan(0);
        expect(entry.why.trim().length, `${reason}.why`).toBeGreaterThan(0);
        expect(entry.whatYouCanDo.trim().length, `${reason}.whatYouCanDo`).toBeGreaterThan(0);
      }
    }
  });

  it('is actually translated, not copied', () => {
    const untranslated = POLICY_REASONS.filter(
      (r) => tr.permissions[r].why === en.permissions[r].why,
    );
    expect(untranslated).toEqual([]);
  });

  it('never shows the raw code as the explanation', () => {
    // The bug this whole file exists to prevent: pasting the identifier into the title so the box is
    // "filled in".
    for (const reason of POLICY_REASONS) {
      for (const locale of [en, tr]) {
        expect(locale.permissions[reason].title).not.toContain(reason);
      }
    }
  });
});
