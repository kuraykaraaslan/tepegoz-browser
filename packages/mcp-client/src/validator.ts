import Ajv, { type ValidateFunction } from 'ajv';
import type { InputValidator } from '@tepegoz/capability-plane';

/**
 * Bridge an MCP tool's advertised JSON Schema into the capability plane's `InputValidator` interface,
 * so the ToolGateway validates (untrusted, LLM-produced) MCP args at the boundary before they reach an
 * external process (ADR-0018 / "zod-or-equivalent at every trust boundary"). Backed by ajv — the
 * standard JSON-Schema validator — since MCP schemas are JSON Schema, not zod.
 *
 * Fail-closed: if a tool advertises no schema or an uncompilable one, the validator accepts ONLY an
 * empty object, so a malformed schema can never become a hole through which unvalidated args pass.
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

export function jsonSchemaValidator(schema: unknown): InputValidator<Record<string, unknown>> {
  if (schema === null || typeof schema !== 'object') return emptyObjectOnly();

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
