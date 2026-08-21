import type { WebContents } from 'electron';
import { AppError, Logger } from '@tepegoz/libs';
import {
  assignStableRefs,
  createRefRegistry,
  disambiguate,
  isInteractableRole,
  markNewElements,
  parseDomTree,
  registryTable,
  MAX_INTERACTABLE_ELEMENTS,
  type RawInteractable,
  type RefRegistry,
} from '@tepegoz/tool-executor';
import { StableRefTableSchema } from '@tepegoz/shared-types';
import {
  axString,
  AxTreeSchema,
  CallResultSchema,
  DomTreeResultSchema,
  type RefTarget,
  type SnapshotDeps,
  type SnapshotResult,
} from './cdp-driver-schemas.electron.js';
import { buildDomTreeExpression } from './build-dom-tree-script.js';
import { fileInputInfo } from './cdp-driver-dom.electron.js';
import { mainFrameIsolatedContext } from './cdp-driver-session.electron.js';

/**
 * Perception concern for {@link CdpDriver}: reads the active page's actionable elements. Uses render-DOM
 * perception (AI-2 default) with an accessibility-tree fallback, and populates the driver's per-tab
 * `ref → node` map (passed in via {@link SnapshotDeps}) so subsequent action calls can resolve refs.
 */

/** Perception source: render-DOM (AI-2 default) unless `TEPEGOZ_PERCEPTION=a11y` forces the fallback. */
function perceptionMode(): 'render-dom' | 'a11y' {
  return process.env.TEPEGOZ_PERCEPTION === 'a11y' ? 'a11y' : 'render-dom';
}

/**
 * S2 PR1: identity-stable refs, off by default. The positional path stays the default AND the degraded
 * fallback until the funded paired sweep says otherwise — a phase does not promote its own flag.
 */
function stableRefsEnabled(): boolean {
  return process.env.TEPEGOZ_PERCEPTION_V2 === '1' || process.env.TEPEGOZ_PERCEPTION_V2 === 'true';
}

/**
 * Assign identity-stable refs for this snapshot, carrying the per-tab registry forward. Returns `null`
 * whenever stability is not achievable or not trustworthy — a disabled flag, a wholesale DOM rewrite, or
 * a table the schema rejects — and the caller then uses positional refs, which always work.
 *
 * The registry is per (tab, url): a navigation is a different ref space, so it starts clean rather than
 * handing the model a number that used to mean something else.
 */
function stableRefsFor(
  wc: WebContents,
  deps: SnapshotDeps,
  url: string,
  contentKeys: readonly string[],
): number[] | null {
  if (!stableRefsEnabled()) return null;
  const existing = deps.refRegistries.get(wc);
  const registry: RefRegistry =
    existing !== undefined && existing.url === url ? existing : createRefRegistry(url);
  const { refs, carryOverRate, degraded } = assignStableRefs(disambiguate(contentKeys), registry);
  deps.refRegistries.set(wc, registry);
  // The identity keys are built from page-controlled strings, so the table is validated before it is
  // trusted — same trust boundary as the CDP payload itself.
  if (StableRefTableSchema.safeParse(registryTable(registry)).success === false) {
    Logger.warn('[perception] stable-ref table rejected by schema; using positional refs', { url });
    deps.refRegistries.delete(wc);
    return null;
  }
  if (degraded) {
    Logger.info('[perception] stable refs degraded (wholesale DOM rewrite)', {
      url,
      carryOverRate,
    });
    return null;
  }
  return refs;
}

/**
 * Read the active page's actionable elements. Uses render-DOM perception (interactivity + occlusion
 * + viewport + `href`/attributes) by default, falling back to the accessibility-tree snapshot when
 * that path is disabled or errors. Both populate the per-tab `ref → node` map for action dispatch.
 */
export async function snapshotElements(
  wc: WebContents,
  deps: SnapshotDeps,
  opts: { viewportExpansionPx?: number } = {},
): Promise<SnapshotResult> {
  if (perceptionMode() === 'render-dom') {
    try {
      return await snapshotElementsRenderDom(wc, deps, opts);
    } catch (err) {
      Logger.warn('render-DOM perception failed; falling back to a11y', { err: String(err) });
    }
  }
  return snapshotElementsA11y(wc, deps);
}

/**
 * Perception observability: how many actionable elements a snapshot yielded, and when ZERO, the page's
 * own viewport dimensions + raw form-control count. A backgrounded/unsized window reports 0×0
 * innerWidth/Height, which makes the in-viewport test reject every element and returns a silent empty
 * set the agent cannot act on — the "no interactable elements" spiral. One low-frequency log per snapshot.
 */
async function logPerception(
  wc: WebContents,
  contextId: number,
  url: string,
  count: number,
): Promise<void> {
  if (count > 0) {
    Logger.info('[perception] render-dom', { count, url });
    return;
  }
  const vpRaw: unknown = await wc.debugger
    .sendCommand('Runtime.evaluate', {
      expression:
        '({w: window.innerWidth, h: window.innerHeight, dq: document.querySelectorAll("a,button,input,select,textarea").length})',
      contextId,
      returnByValue: true,
      silent: true,
    })
    .catch(() => null);
  const vp = CallResultSchema.safeParse(vpRaw);
  Logger.info('[perception] render-dom EMPTY', {
    url,
    viewport: vp.success ? JSON.stringify(vp.data.result.value) : 'unknown',
  });
}

/** Render-DOM perception (AI-2): inject `buildDomTree` in an isolated world, validate, map to refs.
 *  `opts.viewportExpansionPx` widens the in-viewport test (AI-4 `s16` whole-form check). */
async function snapshotElementsRenderDom(
  wc: WebContents,
  deps: SnapshotDeps,
  opts: { viewportExpansionPx?: number } = {},
): Promise<SnapshotResult> {
  await deps.ensure(wc);
  const contextId = await mainFrameIsolatedContext(wc);
  const raw: unknown = await wc.debugger.sendCommand('Runtime.evaluate', {
    expression: buildDomTreeExpression(opts.viewportExpansionPx),
    contextId,
    returnByValue: true,
    awaitPromise: false,
    silent: true,
  });
  const call = CallResultSchema.safeParse(raw);
  if (!call.success) throw new AppError('render-DOM perception returned no value', 502);
  const tree = DomTreeResultSchema.safeParse(call.data.result.value);
  if (!tree.success) throw new AppError('render-DOM perception payload malformed', 502);

  const { interactables, paths, hashes } = parseDomTree(tree.data);
  // S2 PR1: reuse the number an element already holds on this page, so "the crate I chose" survives a
  // re-render. Null ⇒ positional refs (flag off, DOM rewritten wholesale, or a rejected table).
  const stableRefs = stableRefsFor(wc, deps, tree.data.url, hashes);
  if (stableRefs !== null) {
    interactables.forEach((raw, i) => {
      const ref = stableRefs[i];
      if (ref !== undefined) raw.ref = ref;
    });
  }
  await logPerception(wc, contextId, tree.data.url, interactables.length);

  // Mark elements that appeared since the previous snapshot of the SAME page (e.g. a menu the
  // agent just opened). A navigation (url change) or the first snapshot marks nothing new.
  const prev = deps.prevSnapshots.get(wc);
  const prevHashes = prev !== undefined && prev.url === tree.data.url ? prev.hashes : null;
  const isNew = markNewElements(hashes, prevHashes);
  interactables.forEach((raw, i) => {
    if (isNew[i] === true) raw.isNew = true;
  });
  deps.prevSnapshots.set(wc, { url: tree.data.url, hashes: new Set(hashes) });

  // The action map MUST be keyed by whichever ref the model was shown, or a click resolves elsewhere.
  // Each entry also records the element's identity (S3 PR5) so a stale path has a second chance before
  // the expensive re-snapshot.
  const refMap = new Map<number, RefTarget>();
  interactables.forEach((raw, i) => {
    const path = paths[i];
    if (path === undefined) return;
    refMap.set(raw.ref ?? i + 1, {
      path,
      locators: { tag: raw.tag ?? '', role: raw.role, name: raw.name },
    });
  });
  deps.refMaps.set(wc, refMap);
  // S4 PR2: remember WHERE these refs were located, so a mutating action can prove the page did not
  // change origin underneath them.
  deps.refOrigins.set(wc, tree.data.url);
  return {
    url: tree.data.url,
    title: tree.data.title,
    elements: interactables,
    ...(tree.data.canvasFraction !== undefined ? { canvasFraction: tree.data.canvasFraction } : {}),
  };
}

/** Read the active page's actionable elements from the accessibility tree (fallback path). */
async function snapshotElementsA11y(wc: WebContents, deps: SnapshotDeps): Promise<SnapshotResult> {
  await deps.ensure(wc);
  const raw: unknown = await wc.debugger.sendCommand('Accessibility.getFullAXTree');
  const parsed = AxTreeSchema.safeParse(raw);
  if (!parsed.success) throw new AppError('Failed to read the page accessibility tree', 502);

  const elements: RawInteractable[] = [];
  const refMap = new Map<number, RefTarget>();
  for (const node of parsed.data.nodes) {
    if (node.ignored === true || node.backendDOMNodeId === undefined) continue;
    const fileInput = await fileInputInfo(wc, { backendNodeId: node.backendDOMNodeId });
    const role = axString(node.role?.value) || (fileInput !== null ? 'button' : '');
    if (fileInput === null && (role === '' || !isInteractableRole(role))) continue;

    const disabled = node.properties?.some((p) => p.name === 'disabled' && p.value?.value === true);
    const el: RawInteractable = { role, name: axString(node.name?.value) };
    const value = axString(node.value?.value);
    if (value !== '') el.value = value;
    if (disabled === true) el.disabled = true;
    if (fileInput !== null) {
      el.inputKind = 'file';
      if (fileInput.accept.length > 0) el.accept = fileInput.accept;
      if (fileInput.multiple) el.multiple = true;
    }

    elements.push(el);
    // ref is 1-based, aligned with finalizeElements
    refMap.set(elements.length, { backendNodeId: node.backendDOMNodeId });
    if (elements.length >= MAX_INTERACTABLE_ELEMENTS) break;
  }

  deps.refMaps.set(wc, refMap);
  deps.refOrigins.set(wc, wc.getURL());
  return { url: wc.getURL(), title: wc.getTitle(), elements };
}
