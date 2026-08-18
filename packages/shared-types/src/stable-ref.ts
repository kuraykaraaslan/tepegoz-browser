import { z } from 'zod';

/**
 * Identity-stable element references (S2).
 *
 * A `ref` used to be an element's **position** in the current snapshot, which meant it changed every
 * time the page re-rendered: the same button was `[7]` this step and `[4]` the next. That is a
 * correctness problem, not just a cosmetic one — an agent that read a list, acted, and re-read has no
 * way to say "the crate I decided on" except by a number the page just reassigned.
 *
 * A {@link StableRef} binds a ref number to an element **identity key** derived from what the element
 * *is* (tag, role, accessible name, link destination) rather than where it sits, so the number follows
 * the element across snapshots within a run.
 *
 * The key is built from **page-controlled** strings, so the table is validated here before anything
 * trusts it: a hostile page that could inflate keys without bound would grow the per-tab registry until
 * it was the DoS surface, and a non-integer ref would silently miss the driver's action map.
 */
export const StableRefSchema = z.object({
  /** Identity key: content fingerprint plus an occurrence suffix that separates duplicate controls. */
  key: z.string().min(1).max(600),
  /** The ref number the model sees and targets. 1-based, and NOT necessarily contiguous. */
  ref: z.number().int().positive().max(100_000),
});
export type StableRef = z.infer<typeof StableRefSchema>;

/** The whole per-tab table. Capped well above the 200-element emit cap, well below runaway growth. */
export const StableRefTableSchema = z.array(StableRefSchema).max(2000);
export type StableRefTable = z.infer<typeof StableRefTableSchema>;
