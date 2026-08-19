import { describe, expect, it } from 'vitest';
import { safeStartUrl, skillUse } from './skills-core';
import type { AgentSkill } from './types';

const skill = (over: Partial<AgentSkill> = {}): AgentSkill => ({
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Weekly invoice check',
  prompt: 'Open the invoices page and tell me which are unpaid.',
  ...over,
});

describe('using a skill', () => {
  it('fills the composer with the stored prompt', () => {
    expect(skillUse(skill()).prompt).toContain('which are unpaid');
  });

  it('opens the start page when the skill names one', () => {
    expect(skillUse(skill({ startUrl: 'https://billing.test/invoices' })).openUrl).toBe(
      'https://billing.test/invoices',
    );
  });

  it('opens nothing when the skill names no start page', () => {
    expect(skillUse(skill()).openUrl).toBeNull();
  });

  it('REFUSES a javascript: start URL — a stored row does not get to choose the scheme', () => {
    // A skill row can arrive from an older build, a restored profile, or a future import/sync path.
    // Handing that string straight to createTab would make persisted data a script-execution channel.
    expect(skillUse(skill({ startUrl: 'javascript:alert(1)' })).openUrl).toBeNull();
  });

  it('refuses file: and data: start URLs for the same reason', () => {
    expect(safeStartUrl('file:///C:/Windows/System32/drivers/etc/hosts')).toBeNull();
    expect(safeStartUrl('data:text/html,<script>1</script>')).toBeNull();
  });

  it('refuses an unparseable start URL rather than guessing at one', () => {
    expect(safeStartUrl('not a url')).toBeNull();
    expect(safeStartUrl('   ')).toBeNull();
  });
});
