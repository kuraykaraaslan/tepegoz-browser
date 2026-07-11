import { describe, it, expect } from 'vitest';
import { parseDecision } from './reactor';

describe('parseDecision (untrusted LLM output boundary)', () => {
  it('parses an act decision, defaulting args/rationale', () => {
    expect(parseDecision('{"action":"act","tool":"browser_get_elements"}')).toEqual({
      action: 'act',
      tool: 'browser_get_elements',
      args: {},
      rationale: '',
    });
  });

  it('parses a finish decision and unwraps ```json fences', () => {
    expect(parseDecision('```json\n{"action":"finish","summary":"ok"}\n```')).toEqual({
      action: 'finish',
      summary: 'ok',
    });
  });

  it('rejects invalid JSON and shapes with no salvageable decision', () => {
    expect(() => parseDecision('not json')).toThrow(); // unparseable
    expect(() => parseDecision('{"action":"act"}')).toThrow(); // act with no tool
    expect(() => parseDecision('{"foo":"bar"}')).toThrow(); // no discriminator / tool / summary
  });

  it('coerces a tool id placed directly in the action field into an act decision', () => {
    // Observed from gpt-4o: {"action":"<toolid>", "args":{…}} instead of action:"act" + tool:"<id>".
    expect(
      parseDecision('{"action":"browser_update_location","args":{"url":"https://www.google.com"}}'),
    ).toEqual({
      action: 'act',
      tool: 'browser_update_location',
      args: { url: 'https://www.google.com' },
      rationale: '',
    });
  });

  it('promotes a tool-id-in-action over a bogus tool field (e.g. a misplaced ref number)', () => {
    // Observed from gpt-4o: the real tool id landed in `action`, while `tool` held the ref "21".
    expect(
      parseDecision(
        '{"action":"browser_update_page","tool":"21","args":{"action":"fill","ref":21,"text":"x"}}',
      ),
    ).toEqual({
      action: 'act',
      tool: 'browser_update_page',
      args: { action: 'fill', ref: 21, text: 'x' },
      rationale: '',
    });
  });

  it('parses the AI-3 progress brain (evaluation_previous_goal / memory / next_goal)', () => {
    expect(
      parseDecision(
        '{"action":"act","tool":"browser_get_elements","evaluation_previous_goal":"ok","memory":"1 of 3 done","next_goal":"open item 2"}',
      ),
    ).toEqual({
      action: 'act',
      tool: 'browser_get_elements',
      args: {},
      rationale: '',
      evaluation_previous_goal: 'ok',
      memory: '1 of 3 done',
      next_goal: 'open item 2',
    });
  });

  it('omits absent brain fields (weak models that skip them still parse)', () => {
    expect(parseDecision('{"action":"finish","summary":"ok"}')).toEqual({ action: 'finish', summary: 'ok' });
  });

  it('coerces weak-model near-miss shapes (missing action, "arguments" alias, envelope)', () => {
    // No `action`, tool present, OpenAI-style "arguments" key.
    expect(parseDecision('{"tool":"browser_get_elements","arguments":{"ref":"e1"}}')).toEqual({
      action: 'act',
      tool: 'browser_get_elements',
      args: { ref: 'e1' },
      rationale: '',
    });
    // No `action`, only a summary ⇒ finish.
    expect(parseDecision('{"summary":"done"}')).toEqual({ action: 'finish', summary: 'done' });
    // Wrapped in a single-object envelope.
    expect(parseDecision('{"decision":{"action":"finish","summary":"ok"}}')).toEqual({
      action: 'finish',
      summary: 'ok',
    });
  });
});
