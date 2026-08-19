import { describe, expect, it } from 'vitest';
import {
  QUICK_MODE_INSTRUCTION,
  decodeQuickDecision,
  isQuickModeEnabled,
  looksCompact,
} from './quick-decision';
import { parseDecision } from './reactor-decision';

const A = (rest: string): string => `A\t${rest}`;

describe('the per-provider gate', () => {
  it('is OFF for every provider by default — this is the shipped state', () => {
    for (const p of ['anthropic', 'openai', 'gemini'] as const) {
      expect(isQuickModeEnabled(p, {})).toBe(false);
    }
  });

  it('enables exactly the providers named, and no others', () => {
    const env = { TEPEGOZ_QUICK_MODE: 'anthropic' };
    expect(isQuickModeEnabled('anthropic', env)).toBe(true);
    // The weaker-provider guard is the whole reason this is a list and not a boolean: a compact grammar
    // a strong model emits perfectly is what a weaker one gets subtly wrong.
    expect(isQuickModeEnabled('openai', env)).toBe(false);
  });

  it('ignores whitespace and case in the list', () => {
    expect(isQuickModeEnabled('openai', { TEPEGOZ_QUICK_MODE: ' Anthropic , OPENAI ' })).toBe(true);
  });

  it('treats an empty value as off, not as everything', () => {
    expect(isQuickModeEnabled('anthropic', { TEPEGOZ_QUICK_MODE: '   ' })).toBe(false);
  });
});

describe('decoding a compact line', () => {
  it('decodes an act line into the ordinary decision shape', () => {
    const d = parseDecision(A('browser_update_page\t{"ref":3,"action":"click"}\tclick pay\t2 of 5'), true);
    expect(d).toMatchObject({
      action: 'act',
      tool: 'browser_update_page',
      args: { ref: 3, action: 'click' },
      rationale: 'click pay',
      memory: '2 of 5',
    });
  });

  it('decodes a finish line', () => {
    const d = parseDecision('F\tthe total is 412.90\tgoal met\tdone', true);
    expect(d).toMatchObject({ action: 'finish', summary: 'the total is 412.90', memory: 'done' });
  });

  it('accepts a line with the optional tail fields omitted', () => {
    expect(parseDecision(A('browser_get_elements\t{}'), true)).toMatchObject({
      action: 'act',
      tool: 'browser_get_elements',
    });
  });

  it('is STILL validated — a compact line is an encoding, not a bypass', () => {
    // Empty tool id is refused exactly as it would be in JSON. Nothing skips zod because it arrived cheap.
    expect(() => parseDecision('A\t\t{}', true)).toThrow();
  });

  it('falls back to JSON when the model ignores the format instruction', () => {
    // Costing a run its turn because the model answered in the old format would make quick mode a
    // reliability regression rather than a cost saving.
    const d = parseDecision('{"action":"finish","summary":"answered in JSON anyway"}', true);
    expect(d).toMatchObject({ action: 'finish', summary: 'answered in JSON anyway' });
  });

  it('does NOT read a compact line when the provider has quick mode off', () => {
    expect(() => parseDecision(A('browser_get_elements\t{}'), false)).toThrow();
  });

  it('treats unparseable args as empty, leaving the refusal to the tool that has the context', () => {
    expect(decodeQuickDecision(A('browser_update_page\tnot json'))).toMatchObject({ args: {} });
  });

  it('recognises only a real compact line', () => {
    expect(looksCompact('Analysis: the page shows a form')).toBe(false);
    expect(looksCompact('{"action":"finish"}')).toBe(false);
    expect(looksCompact(A('x\t{}'))).toBe(true);
  });
});

describe('the prompt instruction', () => {
  it('describes both line forms, so the model has no third option to invent', () => {
    expect(QUICK_MODE_INSTRUCTION).toContain('A<TAB>');
    expect(QUICK_MODE_INSTRUCTION).toContain('F<TAB>');
  });
});
