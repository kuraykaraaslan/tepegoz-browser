import { z } from 'zod';
import {
  AnthropicProvider,
  ANTHROPIC_MODEL,
  GeminiProvider,
  GEMINI_MODEL,
  KimiProvider,
  KIMI_MODEL,
  ModelGateway,
  OpenAIProvider,
  OPENAI_MODEL,
} from '@tepegoz/model-gateway';
import { isRunnableProvider, SelectorSchema, type AIProvider, type Selector, type SelectorChain } from '@tepegoz/shared-types';
import { finalizeElements, wrapUntrustedContent, type RawInteractable } from '@tepegoz/tool-executor';
import CredentialVault from '@tepegoz/credential-vault';
import TabManager from '../tabs';

/**
 * M2 self-healing selector — the ONE scoped model call `macro-host.electron.ts`'s `resolve()` makes
 * only after the deterministic {@link SelectorChain} fails to resolve on replay.
 *
 * Determinism-first (per this phase's cross-cutting rule: "the model only for understanding/ambiguity"):
 * a page-injected script enumerates the page's current candidate interactive elements and computes a
 * unique CSS locator for EACH ONE ITSELF (id → data-testid → an nth-of-type ancestor chain, whichever
 * first uniquely resolves) — the model never authors CSS/XPath. Its only job is to pick the single
 * best-matching candidate INDEX (or decline), so a hallucinated selector is structurally impossible: an
 * out-of-range or declined pick just falls through to the caller's existing exact-predicate failure.
 *
 * No provider key registered, no plausible candidate, a malformed response, or ANY error → `null`. This
 * never widens what the macro can do or blocks a run; it only ever proposes one alternative locator for
 * the SAME step the user already approved running.
 */

const MAX_CANDIDATES = 60;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_TOKENS = 200;

const CANDIDATE_SELECTOR = 'a,button,input,select,textarea,[role],[onclick],[tabindex]';

/** Runs in the page's main world (mirrors the recorder's capture script) — read-only, never acts. */
const candidateScript = `(function(){
  function esc(s){ try { return CSS.escape(s); } catch(e) { return s.replace(/[^a-zA-Z0-9_-]/g, '\\\\$&'); } }
  function uniquePath(el){
    if (el.id) {
      var idSel = '#' + esc(el.id);
      try { if (document.querySelectorAll(idSel).length === 1) return idSel; } catch(e) {}
    }
    var parts = [];
    var node = el;
    for (var depth = 0; depth < 6 && node && node.nodeType === 1 && node.tagName !== 'BODY' && node.tagName !== 'HTML'; depth++) {
      var tag = node.tagName.toLowerCase();
      var parent = node.parentElement;
      var idx = 1;
      if (parent) {
        var count = 0;
        for (var i = 0; i < parent.children.length; i++) {
          if (parent.children[i].tagName === node.tagName) { count++; if (parent.children[i] === node) idx = count; }
        }
      }
      parts.unshift(tag + ':nth-of-type(' + idx + ')');
      var candidate = parts.join(' > ');
      try { if (document.querySelectorAll(candidate).length === 1) return candidate; } catch(e) {}
      node = parent;
    }
    return parts.join(' > ');
  }
  function text(el){
    var t = el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('alt') || '';
    return String(t).trim().slice(0, 120);
  }
  function attrs(el){
    var out = {};
    ['name','type','placeholder','aria-label','data-testid','title','role'].forEach(function(a){
      var v = el.getAttribute(a);
      if (v) out[a] = String(v).slice(0, 100);
    });
    return out;
  }
  var nodes = document.querySelectorAll('${CANDIDATE_SELECTOR}');
  var out = [];
  for (var i = 0; i < nodes.length && out.length < ${MAX_CANDIDATES}; i++) {
    var el = nodes[i];
    if (el.getClientRects().length === 0) continue;
    out.push({ tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || el.tagName.toLowerCase(),
      name: text(el), attributes: attrs(el), path: uniquePath(el) });
  }
  return JSON.stringify(out);
})()`;

const RawCandidateSchema = z.object({
  tag: z.string(),
  role: z.string(),
  name: z.string(),
  attributes: z.record(z.string()),
  path: z.string(),
});

function modelFor(provider: AIProvider): string {
  if (provider === 'openai') return OPENAI_MODEL.classify;
  if (provider === 'gemini') return GEMINI_MODEL.classify;
  if (provider === 'kimi') return KIMI_MODEL.classify;
  return ANTHROPIC_MODEL.classify;
}

function registerExternalProvider(): AIProvider | null {
  const meta = CredentialVault.listMeta().find((key) => isRunnableProvider(key.provider));
  if (meta === undefined) return null;
  const apiKey = CredentialVault.getFirstKeyForProvider(meta.provider);
  if (apiKey === null) return null;
  if (meta.provider === 'openai') {
    ModelGateway.register(new OpenAIProvider({ apiKey }));
  } else if (meta.provider === 'gemini') {
    ModelGateway.register(new GeminiProvider({ apiKey }));
  } else if (meta.provider === 'kimi') {
    ModelGateway.register(new KimiProvider({ apiKey }));
  } else {
    ModelGateway.register(new AnthropicProvider({ apiKey, effort: 'low' }));
  }
  return meta.provider;
}

function describeChain(chain: SelectorChain): string {
  return chain
    .map((s) => `${s.kind}${s.attr !== undefined ? `[${s.attr}]` : ''}="${s.value}"`)
    .join(' OR ');
}

function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  try {
    return JSON.parse((fenced?.[1] ?? text).trim());
  } catch {
    return null;
  }
}

const PickSchema = z.object({ index: z.number().int().min(0).nullable() });

/** Attempt ONE scoped self-heal for a selector chain that just failed to resolve. `null` = decline. */
export async function healSelector(chain: SelectorChain): Promise<Selector | null> {
  const wc = TabManager.activeWebContents();
  if (wc === null) return null;
  const provider = registerExternalProvider();
  if (provider === null) return null;

  let raw: unknown;
  try {
    raw = await wc.executeJavaScript(candidateScript, true);
  } catch {
    return null;
  }
  const rawCandidates = z.array(RawCandidateSchema).safeParse(
    typeof raw === 'string' ? (extractJson(raw) ?? []) : raw,
  );
  if (!rawCandidates.success || rawCandidates.data.length === 0) return null;

  const paths = rawCandidates.data.map((c) => c.path);
  const rawInteractable: RawInteractable[] = rawCandidates.data.map((c) => ({
    role: c.role,
    name: c.name,
    tag: c.tag,
    attributes: c.attributes,
  }));
  const { elements } = finalizeElements(rawInteractable);

  const listing = elements
    .map((el, i) => {
      const attrStr = el.attributes === undefined ? '' : ` ${JSON.stringify(el.attributes)}`;
      return `${i}: <${el.tag ?? el.role}${attrStr}> ${el.name}`;
    })
    .join('\n');

  let response;
  try {
    response = await ModelGateway.complete({
      provider,
      model: modelFor(provider),
      capability: 'macro_self_heal',
      maxTokens: MAX_RESPONSE_TOKENS,
      timeoutMs: REQUEST_TIMEOUT_MS,
      responseFormat: 'json',
      messages: [
        {
          role: 'system',
          content:
            'A saved browser-automation step can no longer find its target element (the page changed ' +
            "since it was recorded). Given the ORIGINAL selector and a numbered list of the page's " +
            'current candidate elements, return ONLY JSON {"index": N} naming the single best ' +
            'replacement, or {"index": null} if nothing plausibly matches. Never invent an index.',
        },
        {
          role: 'user',
          content:
            `Original selector (no longer resolves): ${describeChain(chain)}\n\n` +
            wrapUntrustedContent(listing, wc.getURL()),
        },
      ],
    });
  } catch {
    return null;
  }

  const picked = PickSchema.safeParse(extractJson(response.text));
  if (!picked.success || picked.data.index === null) return null;
  const path = paths[picked.data.index];
  if (path === undefined) return null;
  const candidate: Selector = { kind: 'css', value: path };
  return SelectorSchema.safeParse(candidate).success ? candidate : null;
}
