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

describe('a schema that constrains nothing is not validation', () => {
  // `{}` is valid JSON Schema, compiles without complaint, and accepts EVERY value — including a
  // function. An MCP server is a remote party, so this cannot be caught by reviewing our own code: it
  // has to fail closed here. Found when CapabilityRegistry started refusing rubber-stamp validators and
  // real MCP tools stopped registering.
  it('treats an empty schema as no schema (empty object only)', () => {
    const v = jsonSchemaValidator({});
    expect(v.safeParse({}).success).toBe(true);
    expect(v.safeParse({ anything: 1 }).success).toBe(false);
    expect(v.safeParse(() => undefined).success).toBe(false);
  });

  it('treats an annotations-only schema the same way', () => {
    const v = jsonSchemaValidator({ title: 'Tool input', description: 'anything goes' });
    expect(v.safeParse({ anything: 1 }).success).toBe(false);
  });

  it('still honours a schema that DOES constrain', () => {
    const v = jsonSchemaValidator({
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    });
    expect(v.safeParse({ path: '/tmp/x' }).success).toBe(true);
    expect(v.safeParse({}).success).toBe(false);
    expect(v.safeParse(() => undefined).success).toBe(false);
  });
});
