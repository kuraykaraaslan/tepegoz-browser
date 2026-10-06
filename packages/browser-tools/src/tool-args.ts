import { z } from 'zod';
import { MAX_SCRIPT_CHARS } from '@tepegoz/tool-executor';

/**
 * Input schemas for the `browser_*` tools — the trust boundary for model-supplied arguments. Split out of
 * `browser-tools.ts` so the registration modules stay about handlers, not argument shapes.
 */

export const TargetTabArgs = z.object({ tabId: z.string().min(1).max(128).optional() }).strip();
export const NavigateArgs = TargetTabArgs.extend({ url: z.string().min(1).max(4096) });
/** S5: the script bound is enforced twice — here at the boundary, and again by `acceptScript`. */
export const ExtractionArgs = TargetTabArgs.extend({
  script: z.string().min(1).max(MAX_SCRIPT_CHARS),
});
export const ValidatePageArgs = TargetTabArgs.extend({
  containsText: z.string().min(1).max(500).optional(),
  timeoutMs: z.number().int().positive().max(60_000).optional(),
});
export const SearchElementsArgs = TargetTabArgs.extend({ query: z.string().min(1).max(200) });
export const HistoryArgs = TargetTabArgs.extend({
  direction: z.enum(['back', 'forward', 'reload']),
});
export const GetConsoleArgs = TargetTabArgs.extend({
  // Minimum severity to list — 'warning' lists warnings AND errors. Omitted ⇒ every level.
  level: z.enum(['debug', 'info', 'warning', 'error']).optional(),
});
export const WaitConditionArgs = TargetTabArgs.extend({
  condition: z.enum(['text', 'selector', 'network_idle']),
  value: z.string().min(1).max(500).optional(),
  // Bounded by the schema as well as by the host: an unbounded wait is the failure mode this verb exists
  // to remove, and a 10-minute "wait" would just be a hang with a nicer name.
  timeoutMs: z.number().int().positive().max(30_000).optional(),
});
// Coerce so a weak model that sends the ref as a string ("2") still validates — same value space, one
// fewer way for the JSON-in-text decision path to trip on a shape nit. Non-numeric strings still reject.
const Ref = z.coerce.number().int().positive().max(10_000);
/** P3-d style/box-model diagnostics: the SAME ref space `browser_update_page` acts on — no second
 *  addressing scheme for the agent to learn. */
export const GetStylesArgs = TargetTabArgs.extend({ ref: Ref });
/** S2/PR7 P3-a bounded DOM query: the query text is untrusted model input like any other tool arg, so
 *  it is length-capped here at the trust boundary — the actual selector/XPath GRAMMAR is validated by
 *  the browser's own querySelectorAll/document.evaluate throwing, caught host-side. */
export const SearchNodesArgs = TargetTabArgs.extend({
  query: z.string().min(1).max(500),
  queryType: z.enum(['css', 'xpath']).optional(),
});
/** One page interaction, discriminated by `action` so each variant validates its own args. */
export const UpdatePageArgs = z.discriminatedUnion('action', [
  TargetTabArgs.extend({ action: z.literal('click'), ref: Ref }),
  TargetTabArgs.extend({ action: z.literal('hover'), ref: Ref }),
  TargetTabArgs.extend({ action: z.literal('drag'), ref: Ref, targetRef: Ref }),
  TargetTabArgs.extend({ action: z.literal('fill'), ref: Ref, text: z.string().max(10_000) }),
  TargetTabArgs.extend({ action: z.literal('press'), key: z.string().min(1).max(40) }),
  TargetTabArgs.extend({ action: z.literal('send_keys'), keys: z.string().min(1).max(200) }),
  TargetTabArgs.extend({
    action: z.literal('scroll'),
    direction: z.enum(['up', 'down']),
    amount: z.number().int().positive().max(100_000).optional(),
  }),
  TargetTabArgs.extend({
    action: z.literal('scroll_to_text'),
    text: z.string().min(1).max(500),
    nth: z.number().int().positive().max(50).optional(),
  }),
  TargetTabArgs.extend({
    action: z.literal('select_option'),
    ref: Ref,
    // The option to choose, by label or value. Accept the common aliases a model reaches for (`text`,
    // `option`, `label`) so a natural arg name doesn't hard-fail validation; resolved in the handler.
    value: z.string().min(1).max(1000).optional(),
    text: z.string().min(1).max(1000).optional(),
    option: z.string().min(1).max(1000).optional(),
    label: z.string().min(1).max(1000).optional(),
  }),
]);

/** The option label/value a select_option call wants, tolerating the aliases above. */
export function selectOptionValue(args: {
  value?: string | undefined;
  text?: string | undefined;
  option?: string | undefined;
  label?: string | undefined;
}): string | undefined {
  return args.value ?? args.text ?? args.option ?? args.label;
}
