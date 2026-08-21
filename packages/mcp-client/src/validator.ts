import Ajv, { type ValidateFunction } from 'ajv';
import type { InputValidator } from '@tepegoz/capability-plane';

/**
 * Bridge an MCP tool's advertised JSON Schema into the capability plane's `InputValidator` interface,
 * so the ToolGateway validates (untrusted, LLM-produced) MCP args at the boundary before they reach an
 * external process (ADR-0018 / "zod-or-equivalent at every trust boundary"). Backed by ajv — the
 * standard JSON-Schema validator — since MCP schemas are JSON Schema, not zod.
 *
 * Fail-closed: if a tool advertises no schema, an uncompilable one, or one that constrains NOTHING, the
 * validator accepts ONLY an empty object, so a useless schema can never become a hole through which
 * unvalidated args pass.
 *
 * The constraint-free case is the one that actually bites. `{}` is a perfectly valid JSON Schema that
 * compiles without complaint and accepts every value — including a function. An MCP server advertising
 * `{}` therefore used to hand the ToolGateway a validator that said yes to anything, which reads as
 * "validated" at every layer above it. That is the exact shape of the failure this module exists to
 * prevent, and it is a REMOTE party's schema, so it cannot be fixed by reviewing our own code.
 */
const ajv = new Ajv({ strict: false, allErrors: true });

function emptyObjectOnly(): InputValidator<Record<string, unknown>> {
  return {
    safeParse: (data) => {
      const value = data ?? {};
      if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
        return { success: true, data: value as Record<string, unknown> };
      }
      return { success: false, error: { issues: ['tool advertised no usable input schema'] } };
    },
  };
}

/**
 * True when a schema places no constraint at all — `{}`, or an object holding only annotations
 * (title/description/$schema/$id/examples/default). Such a schema accepts every value, so treating it as
 * validation would be a lie.
 */
function constrainsNothing(schema: Record<string, unknown>): boolean {
  const ANNOTATIONS = new Set([
    'title',
    'description',
    '$schema',
    '$id',
    '$comment',
    'examples',
    'default',
    'deprecated',
    'readOnly',
    'writeOnly',
  ]);
  return Object.keys(schema).every((key) => ANNOTATIONS.has(key));
}

export function jsonSchemaValidator(schema: unknown): InputValidator<Record<string, unknown>> {
  if (schema === null || typeof schema !== 'object') return emptyObjectOnly();
  if (constrainsNothing(schema as Record<string, unknown>)) return emptyObjectOnly();

  let validate: ValidateFunction;
  try {
    validate = ajv.compile(schema);
  } catch {
    return emptyObjectOnly();
  }

  return {
    safeParse: (data) => {
      const value = data ?? {};
      if (validate(value)) {
        return { success: true, data: value as Record<string, unknown> };
      }
      return { success: false, error: { issues: validate.errors ?? [] } };
    },
  };
}
