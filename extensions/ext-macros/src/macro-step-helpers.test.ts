import { describe, expect, it } from 'vitest';
import { MACRO_IR_VERSION, parseMacro } from '@tepegoz/shared-types';
import { ADDABLE_KINDS, newStepOfKind } from './macro-step-helpers';

describe('macro step helpers', () => {
  it('creates schema-valid defaults for every addable editor step kind', () => {
    for (const kind of ADDABLE_KINDS) {
      const macro = {
        id: `macro-${kind}`,
        name: `Macro ${kind}`,
        version: MACRO_IR_VERSION,
        variables: [],
        steps: [newStepOfKind(kind)],
      };

      expect(parseMacro(macro).success, kind).toBe(true);
    }
  });
});
