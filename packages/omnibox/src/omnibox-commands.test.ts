import { describe, expect, it } from 'vitest';
import { matchingCommands, OMNIBOX_COMMANDS, parseOmniboxCommand } from './omnibox-commands';
import { buildOmniboxSuggestions, type OmniboxSuggestLabels } from './omnibox-suggest';

const LABELS: OmniboxSuggestLabels = {
  search: 'Search the web',
  switchToTab: 'Switch to tab',
  bookmark: 'Bookmark',
  quickSettings: 'Settings',
  quickAppearance: 'Appearance',
  quickLanguage: 'Language',
  quickPrivacy: 'Privacy',
  command: 'Command',
  agentAsk: 'Ask the agent: {task}',
  agentHint: 'Hands this text to the agent',
  agentEmpty: 'Type what the agent should do',
  commandAgent: 'Give the agent a task',
  commandDownload: 'Find a download',
  commandSkill: 'Run a saved skill',
  download: 'Download',
  skill: 'Skill',
  commandNoResults: 'Nothing matched',
};

const SOURCES = {
  tabs: [{ id: 't1', title: 'Agent docs', url: 'https://example.com/agent' }],
  history: [{ url: 'https://example.com/agent-guide', title: 'Agent guide', visitCount: 9 }],
  bookmarks: [{ url: 'https://example.com/agents', title: 'Agents' }],
  downloads: [
    { id: 'd1', name: 'tax-return.pdf', source: 'gov.example' },
    { id: 'd2', name: 'holiday.jpg', source: 'photos.example' },
  ],
  skills: [{ id: 's1', name: 'Summarise page', description: 'Condense the open tab' }],
};

function build(query: string) {
  return buildOmniboxSuggestions(query, SOURCES, LABELS);
}

describe('parseOmniboxCommand', () => {
  it('recognises a command with an argument', () => {
    expect(parseOmniboxCommand('@agent book me a flight')).toEqual({
      kind: 'command',
      id: 'agent',
      term: 'book me a flight',
    });
  });

  it('recognises a bare command as itself, not as a partial', () => {
    expect(parseOmniboxCommand('@skill')).toEqual({ kind: 'command', id: 'skill', term: '' });
  });

  it('requires a space, so typing toward a longer name cannot fire a shorter one', () => {
    // `@agents` must not parse as `@agent` with the argument "s".
    expect(parseOmniboxCommand('@agents')).toEqual({ kind: 'partial', typed: '@agents' });
  });

  it('is case-insensitive on the prefix', () => {
    expect(parseOmniboxCommand('@AGENT hi')).toMatchObject({ kind: 'command', id: 'agent' });
  });

  it('does NOT fuzzy-match — a typo is not a command', () => {
    // A command mode that guessed would be the implicit routing the whole rule forbids.
    expect(parseOmniboxCommand('@agnt do a thing')).toEqual({
      kind: 'partial',
      typed: '@agnt do a thing',
    });
  });

  it('leaves ordinary text alone', () => {
    expect(parseOmniboxCommand('example.com')).toEqual({ kind: 'none' });
    expect(parseOmniboxCommand('what is @agent')).toEqual({ kind: 'none' });
    expect(parseOmniboxCommand('user@example.com')).toEqual({ kind: 'none' });
  });
});

describe('the deterministic surface is not breached', () => {
  /**
   * The rule `omnibox-suggest.ts` states, held to precisely. Comet's failure was IMPLICIT routing —
   * ordinary typed text silently becoming a model prompt. These assert that nothing without an
   * explicit `@agent` can produce an agent action, including text that looks exactly like a request.
   */
  it.each([
    'book me a flight to Rome',
    'summarise this page for me',
    'what is the capital of France?',
    'agent do something',
    'example.com',
  ])('never produces an agent action for %s', (query) => {
    expect(build(query).some((s) => s.action.type === 'agentTask')).toBe(false);
  });

  it('keeps the ordinary navigate/search behaviour intact for non-@ input', () => {
    const first = build('example.com')[0];
    expect(first?.action).toEqual({ type: 'navigate', input: 'example.com' });
  });

  it('emits NO navigate action anywhere in command mode', () => {
    // A stray Enter inside `@…` must not be able to open a page or run a web search.
    for (const q of ['@', '@ag', '@agent', '@agent hello', '@download tax', '@skill', '@zzz']) {
      expect(build(q).some((s) => s.action.type === 'navigate')).toBe(false);
    }
  });
});

describe('command mode', () => {
  it('shows the command menu for a bare @, which is how it is discoverable', () => {
    const menu = build('@');
    expect(menu.map((s) => s.title)).toEqual(OMNIBOX_COMMANDS.map((c) => c.prefix));
    // Picking one FILLS the box; it does not run anything.
    expect(menu[0]?.action).toEqual({ type: 'fillCommand', prefix: '@agent ' });
  });

  it('filters the menu as the prefix is typed', () => {
    expect(build('@do').map((s) => s.title)).toEqual(['@download']);
  });

  it('offers exactly one agent action, and says what it will do', () => {
    const out = build('@agent book a flight');
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toBe('Ask the agent: book a flight');
    expect(out[0]?.subtitle).toBe('Hands this text to the agent');
    expect(out[0]?.action).toEqual({ type: 'agentTask', task: 'book a flight' });
  });

  it('does not hand the agent an empty task', () => {
    expect(build('@agent').some((s) => s.action.type === 'agentTask')).toBe(false);
  });

  it('finds downloads and skills', () => {
    expect(build('@download tax').map((s) => s.action)).toEqual([
      { type: 'openDownload', id: 'd1' },
    ]);
    expect(build('@skill summ').map((s) => s.action)).toEqual([{ type: 'runSkill', id: 's1' }]);
  });

  it('lists everything for a bare command, which is the point of the prefix', () => {
    expect(build('@download')).toHaveLength(2);
  });

  it('SAYS nothing matched rather than falling back to a web search', () => {
    // Falling through would turn "@download tax return" into a search for it — the implicit routing
    // this mode exists to avoid, pointed the other way.
    const out = build('@download nothing-like-this');
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toBe('Nothing matched');
    expect(out[0]?.action.type).not.toBe('navigate');
  });

  it('finds nothing rather than throwing when a source is not wired', () => {
    const bare = buildOmniboxSuggestions('@skill x', { tabs: [], history: [] }, LABELS);
    expect(bare.map((s) => s.title)).toEqual(['Nothing matched']);
  });
});

describe('matchingCommands', () => {
  it('matches on the typed prefix, folded', () => {
    expect(matchingCommands('@SK').map((c) => c.id)).toEqual(['skill']);
    expect(matchingCommands('@').map((c) => c.id)).toEqual(['agent', 'download', 'skill']);
  });

  it('has no @workspace — there is no such surface in this product yet', () => {
    // The DoD line names it; a Phase 2b noun that does not exist cannot be routed to, and a command
    // that invented a destination would be worse than an absent one.
    expect(OMNIBOX_COMMANDS.map((c) => c.id)).not.toContain('workspace');
  });
});
