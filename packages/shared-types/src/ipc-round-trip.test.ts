import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as contracts from './index';

/**
 * Every contract in this package crosses a process boundary. Electron IPC serialises with the structured
 * clone algorithm, and the journal, the preferences file and the eval fixtures all go through JSON — so
 * a schema is only honest if a value that satisfies it still satisfies it after the trip.
 *
 * The package's other tests assert that a hand-written sample parses. That is validation, not
 * round-tripping: it says nothing about whether the value survives being sent. This file asserts the
 * property that actually matters, and it does so over EVERY exported schema rather than the sixteen
 * someone remembered to write a fixture for — because the schema that breaks IPC will be the one nobody
 * thought to sample.
 */

/** Zod types whose values do not survive JSON, and what goes wrong. */
const NOT_JSON_SAFE: Record<string, string> = {
  ZodDate: 'a Date becomes a string — parse fails on the way back. Use z.number() (epoch ms).',
  ZodBigInt: 'BigInt is not representable in JSON and throws on stringify.',
  ZodMap: 'a Map serialises to {} — every entry is silently lost.',
  ZodSet: 'a Set serialises to {} — every member is silently lost.',
  ZodFunction: 'a function is dropped entirely.',
  ZodSymbol: 'a symbol is dropped entirely.',
  ZodNaN: 'NaN becomes null.',
  ZodUndefined: 'an explicit undefined VALUE is dropped; use .optional() on the field instead.',
  ZodVoid: 'void has no JSON representation.',
  ZodPromise: 'a promise cannot cross a process boundary.',
  ZodNever: 'never is unconstructible; it cannot appear in a transported payload.',
};

/** Walk a schema, collecting the paths of any node whose values cannot survive JSON. */
function unsafeNodes(schema: z.ZodTypeAny, path = '', seen = new Set<unknown>()): string[] {
  if (seen.has(schema)) return [];
  seen.add(schema);

  const def = schema._def as { typeName?: string } & Record<string, unknown>;
  const typeName = def.typeName ?? '';
  const found: string[] = [];

  const reason = NOT_JSON_SAFE[typeName];
  // A bare `ZodUndefined` inside a union is how `.optional()` is represented, which is fine — it is only
  // a problem as a value type in its own right.
  if (reason !== undefined && !(typeName === 'ZodUndefined' && path.endsWith('|undefined'))) {
    found.push(`${path === '' ? '(root)' : path}: ${typeName} — ${reason}`);
  }

  const walk = (child: unknown, childPath: string): void => {
    if (child !== null && typeof child === 'object' && '_def' in child) {
      found.push(...unsafeNodes(child as z.ZodTypeAny, childPath, seen));
    }
  };

  if (typeName === 'ZodObject') {
    const shape = (def.shape as () => Record<string, z.ZodTypeAny>)();
    for (const [key, child] of Object.entries(shape)) walk(child, `${path}.${key}`);
  } else if (typeName === 'ZodArray') {
    walk(def.type, `${path}[]`);
  } else if (typeName === 'ZodUnion' || typeName === 'ZodDiscriminatedUnion') {
    const options = (def.options as z.ZodTypeAny[] | Map<unknown, z.ZodTypeAny>) ?? [];
    const list = Array.isArray(options) ? options : [...options.values()];
    list.forEach((child, i) => {
      walk(child, `${path}|${String(i)}`);
    });
  } else if (typeName === 'ZodRecord') {
    walk(def.valueType, `${path}{}`);
  } else if (typeName === 'ZodTuple') {
    (def.items as z.ZodTypeAny[]).forEach((child, i) => {
      walk(child, `${path}[${String(i)}]`);
    });
  } else if (typeName === 'ZodIntersection') {
    walk(def.left, path);
    walk(def.right, path);
  } else {
    // Wrappers: optional / nullable / default / effects / lazy / catch / branded / readonly / pipeline.
    for (const key of ['innerType', 'schema', 'type', 'in', 'out']) {
      if (key in def) walk(def[key], key === 'innerType' ? path : `${path}.${key}`);
    }
    if (typeof def['getter'] === 'function') {
      walk((def['getter'] as () => z.ZodTypeAny)(), path);
    }
  }
  return found;
}

const exportedSchemas = Object.entries(contracts).filter(
  (entry): entry is [string, z.ZodTypeAny] =>
    entry[0].endsWith('Schema') &&
    entry[1] !== null &&
    typeof entry[1] === 'object' &&
    '_def' in (entry[1] as object) &&
    typeof (entry[1] as { safeParse?: unknown }).safeParse === 'function',
);

describe('the JSON-safety walker itself', () => {
  // Guards the guard. A walker that silently returns [] for everything would make all 72 assertions
  // below pass while checking nothing, and that failure mode is invisible in a green run.
  it('flags a Date nested inside an object', () => {
    expect(unsafeNodes(z.object({ when: z.date() })).join()).toContain('ZodDate');
  });

  it('flags through arrays, unions, records and optionals', () => {
    expect(unsafeNodes(z.object({ xs: z.array(z.bigint()) })).join()).toContain('ZodBigInt');
    expect(unsafeNodes(z.union([z.string(), z.map(z.string(), z.string())])).join()).toContain(
      'ZodMap',
    );
    expect(unsafeNodes(z.record(z.set(z.string()))).join()).toContain('ZodSet');
    expect(unsafeNodes(z.object({ f: z.date().optional() })).join()).toContain('ZodDate');
  });

  it('is quiet on a schema that is genuinely JSON-safe', () => {
    expect(
      unsafeNodes(
        z.object({
          id: z.string(),
          count: z.number(),
          tags: z.array(z.string()),
          meta: z.record(z.unknown()).optional(),
          kind: z.union([z.literal('a'), z.literal('b')]),
        }),
      ),
    ).toEqual([]);
  });
});

describe('IPC contracts survive serialisation', () => {
  it('exports a substantial number of schemas to check', () => {
    // Guards the guard: if the filter above ever stops matching, every assertion below becomes vacuous
    // and the suite would still be green.
    expect(exportedSchemas.length).toBeGreaterThan(50);
  });

  for (const [name, schema] of exportedSchemas) {
    it(`${name} contains only JSON-safe types`, () => {
      expect(unsafeNodes(schema).join('\n')).toBe('');
    });
  }
});

describe('round-trip on representative payloads', () => {
  /** parse → JSON → parse must land on exactly the same value. */
  function assertRoundTrip(schema: z.ZodTypeAny, sample: unknown): void {
    const once = schema.parse(sample) as unknown;
    const again = schema.parse(JSON.parse(JSON.stringify(once))) as unknown;
    expect(again).toEqual(once);
  }

  it('an Event Journal record', () => {
    assertRoundTrip(contracts.EventSchema, {
      lsn: 0,
      id: '00000000-0000-4000-8000-000000000000',
      type: 'SessionStarted',
      ts: 1,
      actor: 'system',
      correlationId: 'run-1',
      payload: { nested: { list: [1, 'two', true, null] } },
      redacted: true,
      deviceId: 'device-1',
    });
  });

  it('a plan with steps', () => {
    assertRoundTrip(contracts.PlanSchema, {
      goal: 'open the page and read the title',
      steps: [
        // Tool names are {domain}_{verb}_{noun} with an approved verb — see ToolNameSchema.
        {
          id: 's1',
          tool: 'browser_get_page',
          args: { url: 'https://example.com' },
          rationale: 'go',
        },
      ],
    });
  });

  it('a tool descriptor', () => {
    assertRoundTrip(contracts.ToolDescriptorSchema, {
      id: 'browser_get_page',
      description: 'Read the active page',
      dangerClass: 'read',
      source: 'builtin',
      inputSchema: { type: 'object', properties: { url: { type: 'string' } } },
    });
  });
});
