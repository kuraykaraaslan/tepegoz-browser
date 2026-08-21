import { describe, it, expect } from 'vitest';
import { parseMacro } from './macro-schema';
import { MACRO_IR_VERSION, type Macro } from './macro-ir';

const base: Macro = {
  id: 'm1',
  name: 'Login',
  version: MACRO_IR_VERSION,
  variables: [{ name: 'user' }],
  steps: [
    { kind: 'navigate', url: 'https://example.com/{{user}}' },
    {
      kind: 'fill',
      target: [
        { kind: 'css', value: '#email' },
        { kind: 'xpath', value: '//input[@type="email"]' },
      ],
      value: '{{user}}',
    },
    {
      kind: 'if',
      cond: { kind: 'textPresent', text: 'Welcome' },
      then: [{ kind: 'click', target: [{ kind: 'text', value: 'Continue' }] }],
      else: [
        { kind: 'assert', predicate: { kind: 'textAbsent', text: 'Error' }, severity: 'hard' },
      ],
    },
    {
      kind: 'repeat',
      count: 3,
      body: [{ kind: 'scroll', direction: 'down' }],
    },
    {
      kind: 'forEachRow',
      csvBlobHash: 'sha256-abc',
      as: 'row',
      onEnd: 'restart',
      body: [{ kind: 'waitFor', target: [{ kind: 'css', value: '.next' }], timeoutMs: 5000 }],
    },
  ],
};

describe('parseMacro', () => {
  it('accepts a valid nested macro (if / repeat / forEachRow)', () => {
    const r = parseMacro(base);
    expect(r.success).toBe(true);
  });

  it('rejects an unknown step kind', () => {
    const bad = { ...base, steps: [{ kind: 'teleport' }] };
    expect(parseMacro(bad).success).toBe(false);
  });

  it('rejects an empty selector chain', () => {
    const bad = { ...base, steps: [{ kind: 'click', target: [] }] };
    expect(parseMacro(bad).success).toBe(false);
  });

  it('rejects a repeat with BOTH count and while', () => {
    const bad = {
      ...base,
      steps: [
        {
          kind: 'repeat',
          count: 2,
          while: { kind: 'textPresent', text: 'x' },
          body: [{ kind: 'waitMs', ms: 10 }],
        },
      ],
    };
    expect(parseMacro(bad).success).toBe(false);
  });

  it('rejects a repeat with NEITHER count nor while', () => {
    const bad = { ...base, steps: [{ kind: 'repeat', body: [{ kind: 'waitMs', ms: 10 }] }] };
    expect(parseMacro(bad).success).toBe(false);
  });

  it('rejects a version above the current IR version', () => {
    expect(parseMacro({ ...base, version: MACRO_IR_VERSION + 1 }).success).toBe(false);
  });
});
