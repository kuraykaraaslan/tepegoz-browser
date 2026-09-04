import { describe, expect, it } from 'vitest';
import { SCRIPTS } from './harness-scripts';

/**
 * `SCRIPTS` holds the deterministic-tier model sequences the `ScriptedProvider` replays when there is
 * no cloud key. Each entry is a `(base) => { entryUrl, replies }` builder; the replies are the raw
 * JSON strings the fake model returns turn-by-turn (a plan first, then acts, then a finish).
 */

describe('SCRIPTS', () => {
  const base = 'http://127.0.0.1:9/fix/';

  it('every script builds an entryUrl under the fixture base and a non-empty reply list', () => {
    for (const [id, build] of Object.entries(SCRIPTS)) {
      const { entryUrl, replies } = build(base);
      expect(entryUrl.startsWith(base), id).toBe(true);
      expect(replies.length, id).toBeGreaterThan(1);
      for (const r of replies) {
        expect(() => {
          JSON.parse(r);
        }, `${id}: ${r}`).not.toThrow();
      }
    }
  });

  it('blog_behind_menu opens with a plan and ends with a finish naming the post', () => {
    const build = SCRIPTS.blog_behind_menu;
    expect(build).toBeDefined();
    const { entryUrl, replies } = build!(base);
    expect(entryUrl).toBe(`${base}index.html`);

    const plan = JSON.parse(replies[0]!) as { steps: unknown[] };
    expect(Array.isArray(plan.steps)).toBe(true);
    expect(plan.steps.length).toBeGreaterThan(0);

    const last = JSON.parse(replies[replies.length - 1]!) as { action: string; summary: string };
    expect(last.action).toBe('finish');
    expect(last.summary.toLowerCase()).toContain('latest post');

    // The middle turns are `act` calls with a tool + args + rationale.
    const mid = JSON.parse(replies[1]!) as { action: string; tool: string };
    expect(mid.action).toBe('act');
    expect(typeof mid.tool).toBe('string');
  });
});
