import { describe, it, expect } from 'vitest';
import { jsonSchemaValidator } from './validator';

describe('jsonSchemaValidator', () => {
  const schema = {
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path'],
    additionalProperties: false,
  };

  it('accepts args matching the JSON schema', () => {
    expect(jsonSchemaValidator(schema).safeParse({ path: '/a' }).success).toBe(true);
  });

  it('rejects args violating the schema (missing required / extra prop)', () => {
    const v = jsonSchemaValidator(schema);
    expect(v.safeParse({}).success).toBe(false);
    expect(v.safeParse({ path: 1 }).success).toBe(false);
    expect(v.safeParse({ path: '/a', extra: true }).success).toBe(false);
  });

  it('fail-closed: no/invalid schema accepts only an empty object', () => {
    for (const bad of [undefined, null, 'not-a-schema', 42]) {
      const v = jsonSchemaValidator(bad);
      expect(v.safeParse({}).success).toBe(true);
      expect(v.safeParse(undefined).success).toBe(true); // coerced to {}
      expect(v.safeParse({ foo: 1 }).success).toBe(false);
    }
  });
});
