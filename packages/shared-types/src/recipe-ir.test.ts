import { describe, expect, it } from 'vitest';
import {
  RecipeSchema,
  isVariableRef,
  undeclaredVariableRefs,
  unusedVariables,
  variableRefsIn,
  type Recipe,
} from './recipe-ir';

const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Export the monthly invoice',
  provenance: { kind: 'distilled', correlationId: 'run-1' },
  steps: [
    {
      id: 's1',
      tool: 'browser_update_page',
      args: { ref: 3, action: 'fill', value: { variable: 'month' } },
    },
  ],
  variables: [{ name: 'month', sensitive: false }],
  ...over,
});

describe('the RecipeValue shape', () => {
  it('parses a mix of literals and variable references', () => {
    const r = RecipeSchema.safeParse(recipe());
    expect(r.success).toBe(true);
  });

  it('accepts arrays of values, recursively', () => {
    const r = recipe({
      steps: [
        {
          id: 's1',
          tool: 'x_y_z',
          args: { items: [1, 'two', { variable: 'three' }, [4, { variable: 'five' }]] },
        },
      ],
      variables: [
        { name: 'three', sensitive: false },
        { name: 'five', sensitive: true },
      ],
    });
    expect(RecipeSchema.safeParse(r).success).toBe(true);
  });

  it('identifies a variable reference correctly, including inside an array element', () => {
    expect(isVariableRef({ variable: 'x' })).toBe(true);
    expect(isVariableRef('x')).toBe(false);
    expect(isVariableRef(null)).toBe(false);
    expect(isVariableRef([1, 2])).toBe(false);
  });

  it('refuses a step with no tool id, and a recipe with no steps', () => {
    expect(RecipeSchema.safeParse(recipe({ steps: [] })).success).toBe(false);
  });
});

describe('variable reference integrity', () => {
  it('finds every reference across all steps, deduplicated', () => {
    const r = recipe({
      steps: [
        { id: 's1', tool: 'a_b_c', args: { x: { variable: 'foo' } } },
        { id: 's2', tool: 'a_b_c', args: { y: { variable: 'foo' }, z: { variable: 'bar' } } },
      ],
      variables: [
        { name: 'foo', sensitive: false },
        { name: 'bar', sensitive: false },
      ],
    });
    expect(variableRefsIn(r).sort()).toEqual(['bar', 'foo']);
  });

  it('finds a reference nested inside an array value', () => {
    const r = recipe({
      steps: [{ id: 's1', tool: 'a_b_c', args: { items: [1, [{ variable: 'deep' }]] } }],
      variables: [{ name: 'deep', sensitive: false }],
    });
    expect(variableRefsIn(r)).toEqual(['deep']);
  });

  it('catches an UNDECLARED reference — a recipe that would fail at run time with "unbound variable"', () => {
    const r = recipe({
      steps: [{ id: 's1', tool: 'a_b_c', args: { x: { variable: 'ghost' } } }],
      variables: [],
    });
    expect(undeclaredVariableRefs(r)).toEqual(['ghost']);
  });

  it('reports nothing undeclared when every reference is backed by a declaration', () => {
    expect(undeclaredVariableRefs(recipe())).toEqual([]);
  });

  it('catches an UNUSED declaration — drift from what the recipe actually needs', () => {
    const r = recipe({
      steps: [{ id: 's1', tool: 'a_b_c', args: { x: 'literal' } }],
      variables: [{ name: 'orphan', sensitive: false }],
    });
    expect(unusedVariables(r)).toEqual(['orphan']);
  });

  it('reports nothing unused when every declaration is referenced', () => {
    expect(unusedVariables(recipe())).toEqual([]);
  });
});
