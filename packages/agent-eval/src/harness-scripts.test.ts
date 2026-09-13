import { describe, expect, it } from 'vitest';
import { CHAT_SCRIPTS, SCRIPTS } from './harness-scripts';

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

/** `CHAT_SCRIPTS` mirrors `SCRIPTS`' shape for `chatFixture` scenarios (no `base` to interpolate — a
 *  plain `() => string[]` reply list). */
describe('CHAT_SCRIPTS', () => {
  it('every entry opens with a valid plan and ends with a finish, every reply is valid JSON', () => {
    for (const [id, build] of Object.entries(CHAT_SCRIPTS)) {
      const replies = build();
      expect(replies.length, id).toBeGreaterThan(1);
      const parsed = replies.map((r) => {
        expect(() => {
          JSON.parse(r);
        }, `${id}: ${r}`).not.toThrow();
        return JSON.parse(r) as { steps?: unknown[]; action?: string };
      });
      expect(Array.isArray(parsed[0]!.steps), id).toBe(true);
      expect((parsed[0]!.steps ?? []).length, id).toBeGreaterThan(0);
      expect(parsed[parsed.length - 1]!.action, id).toBe('finish');
    }
  });

  it('chat_media_to_sandbox reads the room then calls chat_get_media on Bea\'s attachment message', () => {
    const build = CHAT_SCRIPTS.chat_media_to_sandbox;
    expect(build).toBeDefined();
    const replies = build!();

    const acts = replies
      .slice(1, -1)
      .map((r) => JSON.parse(r) as { action: string; tool: string; args: Record<string, unknown> });
    expect(acts.every((a) => a.action === 'act')).toBe(true);
    expect(acts.map((a) => a.tool)).toEqual(['chat_get_history', 'chat_get_media']);

    const mediaCall = acts[1]!;
    expect(mediaCall.args).toEqual({
      accountId: 'work',
      conversationId: '!design:example.org',
      messageId: '!design:example.org-1',
    });

    const last = JSON.parse(replies[replies.length - 1]!) as { action: string; summary: string };
    expect(last.action).toBe('finish');
    expect(last.summary.toLowerCase()).toContain('hero-v3.png');
  });
});
