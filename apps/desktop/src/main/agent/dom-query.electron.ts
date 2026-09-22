import type { WebContents } from 'electron';
import { z } from 'zod';
import type { QueryProbe } from '@tepegoz/browser-tools';
import { buildDomQueryExpression, type ExistingPathEntry } from './dom-query-script.js';
import type { RefTarget } from './cdp-driver-schemas.electron.js';

/**
 * S2/PR7 P3-a — the bounded DOM query tool behind `browser_search_nodes`.
 *
 * Like `style-inspector.electron.ts`, this never touches `webContents.debugger`/CDP: the query runs via
 * `executeJavaScriptInIsolatedWorld` (`dom-query-script.ts`), and the ref-minting step below is a plain
 * in-memory Map write, not a protocol call.
 *
 * **Ref-resolution decision (the single most important call in this file).** A query can match elements
 * the actionable-element perception layer never tracked (e.g. a plain `<div>`), so a query result cannot
 * always reuse an existing ref the way `browser_get_styles` does. Instead:
 *  - An element that IS already one of the tab's tracked refs (resolved by DOM identity inside the
 *    injected script) gets that SAME ref back — one element never gets two numbers.
 *  - An element that is NOT yet tracked gets a FRESH ref minted into the SAME per-tab registry
 *    (`CdpDriver`'s `refMaps`, passed in here by reference exactly like `SnapshotDeps.refMaps` is passed
 *    to `cdp-driver-snapshot.electron.ts`), one past the highest ref currently held. It resolves later
 *    through `browser_update_page`/`browser_get_styles` exactly like any snapshot-minted ref.
 *  - An element `dom-query-script.ts`'s `computeNodePath` could not address at all (defensively: a
 *    shadow-DOM boundary, a detached node) gets `ref: null` — an honest "seen but not addressable",
 *    never a fabricated ref that would fail to resolve on the next action.
 */

/** A distinct isolated-world id from `style-inspector.electron.ts`'s `STYLE_PROBE_WORLD_ID` (1000), so
 *  the two diagnostics probes never share an execution context. */
const DOM_QUERY_WORLD_ID = 1001;

/** "At most ~200" (phase-s2-perception-v2.md P3-a) — mirrors `MAX_INTERACTABLE_ELEMENTS`. */
const MAX_QUERY_MATCHES = 200;

const QueryScriptMatchSchema = z.object({
  tag: z.string(),
  attributes: z.record(z.string()),
  existingRef: z.number().int().positive().nullable(),
  path: z.array(z.array(z.number().int().nonnegative())).nullable(),
});

/** The page's own probe result, `safeParse`d at this boundary like every other page-controlled payload —
 *  a malformed shape degrades to a clean failure rather than throwing or being trusted as-is. */
const DomQueryScriptResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(false), error: z.string() }),
  z.object({
    ok: z.literal(true),
    total: z.number().int().nonnegative(),
    matches: z.array(QueryScriptMatchSchema),
  }),
]);

const FAILURE = (error: string): QueryProbe => ({ ok: false, error, total: 0, matches: [] });

/**
 * Run a bounded CSS/XPath query against one tab's live DOM, mint/reuse refs for the matches, and return
 * the ref-resolved result. Never throws — a diagnostics/targeting nicety must not be able to break driving.
 */
export async function queryElements(
  wc: WebContents,
  query: string,
  queryType: 'css' | 'xpath',
  refMaps: WeakMap<WebContents, Map<number, RefTarget>>,
): Promise<QueryProbe> {
  if (wc.isDestroyed()) return FAILURE('the tab is no longer available');

  const refMap = refMaps.get(wc) ?? new Map<number, RefTarget>();
  const existingPaths: ExistingPathEntry[] = [];
  let maxRef = 0;
  for (const [ref, target] of refMap) {
    if (ref > maxRef) maxRef = ref;
    if ('path' in target) existingPaths.push({ ref, path: target.path });
  }

  let raw: unknown;
  try {
    raw = await wc.executeJavaScriptInIsolatedWorld(DOM_QUERY_WORLD_ID, [
      { code: buildDomQueryExpression(query, queryType, existingPaths, MAX_QUERY_MATCHES) },
    ]);
  } catch {
    return FAILURE('the query could not be run against the page');
  }

  const parsed = DomQueryScriptResultSchema.safeParse(raw);
  if (!parsed.success) return FAILURE('the page returned a malformed query result');
  if (!parsed.data.ok) return FAILURE(parsed.data.error);

  let nextRef = maxRef + 1;
  const matches = parsed.data.matches.map((m) => {
    if (m.existingRef !== null) {
      return { tag: m.tag, attributes: m.attributes, ref: m.existingRef };
    }
    if (m.path !== null) {
      const ref = nextRef;
      nextRef += 1;
      refMap.set(ref, { path: m.path });
      return { tag: m.tag, attributes: m.attributes, ref };
    }
    return { tag: m.tag, attributes: m.attributes, ref: null };
  });
  refMaps.set(wc, refMap);

  return { ok: true, total: parsed.data.total, matches };
}
