import { z } from 'zod';
import {
  capability,
  defineCapabilities,
  type ExtensionCapabilitySet,
} from '@tepegoz/extension-sdk';
import { MacroSchema } from '@tepegoz/shared-types';
import type { MacrosCapabilityHost } from './types';
import { macrosManifest } from './manifest';

/**
 * The Macros extension's **agent-callable capabilities** (ADR-0021) — declared on the reusable
 * `defineCapabilities` standard, so the internal agent can discover and drive saved macros through the
 * single ToolGateway PEP, exactly like builtin tools. Verb-compliant with `ToolNameSchema`'s closed
 * verb set (`run` isn't approved → a run is modelled as *creating a run*).
 *
 * Danger classes are fail-safe: reads auto-allow; create/run are state_changing (→ HITL) and carry an
 * idempotency key; delete is destructive. Each internal act step of a run additionally re-passes the
 * navigation PEP inside the host.
 */

const NoArgs = z.object({}).strip();
const IdArgs = z.object({ id: z.string().min(1).max(128) });
const CreateArgs = z.object({ macro: MacroSchema });
const RunArgs = z.object({
  macroId: z.string().min(1).max(128),
  variables: z.record(z.string().max(64), z.string().max(10_000)).optional(),
});
const RunIdArgs = z.object({ runId: z.string().min(1).max(128) });

export function macrosCapabilities(): ExtensionCapabilitySet<MacrosCapabilityHost> {
  return defineCapabilities(macrosManifest.id, [
    capability<z.infer<typeof NoArgs>, MacrosCapabilityHost>({
      id: 'macros_list_items',
      description:
        'List saved macros. args: {} — returns an array of { id, name, stepCount, updatedAt }.',
      dangerClass: 'read',
      inputSchema: NoArgs,
      handler: (_args, host) => host.list(),
    }),
    capability<z.infer<typeof IdArgs>, MacrosCapabilityHost>({
      id: 'macros_get_item',
      description:
        "Get one macro's full deterministic IR (steps/variables). args: { id: string } — returns the " +
        'Macro or null.',
      dangerClass: 'read',
      inputSchema: IdArgs,
      handler: (args, host) => host.get(args.id),
    }),
    capability<z.infer<typeof CreateArgs>, MacrosCapabilityHost>({
      id: 'macros_create_item',
      description:
        'Save (upsert) a macro from a full IR object. args: { macro: Macro } — returns its summary ' +
        '{ id, name, stepCount, updatedAt }.',
      dangerClass: 'state_changing',
      requiresIdempotencyKey: true,
      inputSchema: CreateArgs,
      handler: (args, host) => host.save(args.macro),
    }),
    capability<z.infer<typeof IdArgs>, MacrosCapabilityHost>({
      id: 'macros_delete_item',
      description: 'Delete a saved macro. args: { id: string } — returns nothing.',
      dangerClass: 'destructive',
      inputSchema: IdArgs,
      handler: (args, host) => {
        host.delete(args.id);
        return { ok: true };
      },
    }),
    capability<z.infer<typeof RunArgs>, MacrosCapabilityHost>({
      id: 'macros_create_run',
      description:
        'Run a saved macro to completion, optionally binding initial variables. args: { macroId: ' +
        'string, variables?: Record<string,string> } — returns { runId, ok, aborted, stepsRun, error? } ' +
        'where `error` names the exact failing step.',
      dangerClass: 'state_changing',
      requiresIdempotencyKey: true,
      inputSchema: RunArgs,
      handler: (args, host) =>
        host.run({ macroId: args.macroId, variables: args.variables }),
    }),
    capability<z.infer<typeof RunIdArgs>, MacrosCapabilityHost>({
      id: 'macros_get_run',
      description:
        'Get the recorded outcome of a finished run. args: { runId: string } — returns ' +
        '{ runId, ok, aborted, stepsRun, error? } or null.',
      dangerClass: 'read',
      inputSchema: RunIdArgs,
      handler: (args, host) => host.getRun(args.runId),
    }),
  ]);
}
