import { describe, expect, it } from 'vitest';
import type { EvalScenario } from '@tepegoz/shared-types';
import { buildJudgePrompt, parseJudgeVerdict, judgeScenario } from './judge';

const scenario: EvalScenario = {
  id: 'open_ended',
  task: 'Compare the two plans and say which is cheaper.',
  target: { fixture: 'multi-tab' },
  success: { judgeRubric: 'The summary must name the cheaper plan.' },
  heldOut: false,
  tags: [],
};

describe('buildJudgePrompt', () => {
  it('includes the task, rubric, summary, and page evidence', () => {
    const { system, user } = buildJudgePrompt(scenario, {
      finalPageText: 'Plan B $20',
      summary: 'Plan B is cheaper',
    });
    expect(system).toContain('JSON');
    expect(user).toContain('Compare the two plans');
    expect(user).toContain('The summary must name the cheaper plan.');
    expect(user).toContain('Plan B is cheaper');
    expect(user).toContain('Plan B $20');
  });
});

describe('parseJudgeVerdict (untrusted model output)', () => {
  it('parses a clean verdict', () => {
    expect(parseJudgeVerdict('{"pass":true,"confidence":0.9,"reason":"named Plan B"}')).toEqual({
      pass: true,
      confidence: 0.9,
      reason: 'named Plan B',
    });
  });

  it('unwraps a fenced verdict', () => {
    const v = parseJudgeVerdict(
      '```json\n{"pass":false,"confidence":0.2,"reason":"no plan named"}\n```',
    );
    expect(v.pass).toBe(false);
  });

  it('fails closed on non-JSON', () => {
    expect(parseJudgeVerdict('I think it passed')).toMatchObject({ pass: false, confidence: 0 });
  });

  it('fails closed on a malformed verdict (out-of-range confidence)', () => {
    expect(parseJudgeVerdict('{"pass":true,"confidence":5}')).toMatchObject({
      pass: false,
      confidence: 0,
    });
  });
});

describe('judgeScenario', () => {
  it('calls the injected model with the built prompt and returns the parsed verdict', async () => {
    let seenUser = '';
    const verdict = await judgeScenario(
      scenario,
      { finalPageText: 'Plan B $20', summary: 'Plan B is cheaper' },
      (messages) => {
        seenUser = messages.user;
        return Promise.resolve('{"pass":true,"confidence":0.8,"reason":"ok"}');
      },
    );
    expect(seenUser).toContain('Plan B is cheaper');
    expect(verdict).toMatchObject({ pass: true, confidence: 0.8 });
  });
});
