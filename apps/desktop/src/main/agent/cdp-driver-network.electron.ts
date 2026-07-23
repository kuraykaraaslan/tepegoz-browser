import type { WebContents } from 'electron';
import { Logger } from '@tepegoz/libs';
import { isReportableFailure, type NetworkObservation } from '@tepegoz/browser-tools';
import {
  NetworkFailedSchema,
  NetworkRequestSchema,
  NetworkResponseSchema,
} from './cdp-driver-schemas.electron.js';

/**
 * AI-8B — the per-tab HTTP response recorder behind post-action verification.
 *
 * `Network.enable` was already issued for network-idle waiting, but only `requestWillBeSent` /
 * `loadingFinished` / `loadingFailed` were consumed, purely to count in-flight requests;
 * `Network.responseReceived` — the event that carries the **status code** — was never subscribed. So a
 * "Save" whose POST returned 403 while the UI showed nothing was invisible to the agent.
 *
 * This module installs ONE permanent `debugger` message listener per WebContents (idempotent, so
 * re-attaching on a tab switch cannot double-subscribe) and keeps a small bounded ring of observations.
 * Everything from the page's network is untrusted: each payload is `safeParse`d at this CDP boundary and
 * a malformed one is dropped, never thrown — a perception nicety must not be able to break driving.
 *
 * Memory is bounded on both sides: the ring caps completed observations, and the in-flight map (needed
 * only to join a response back to its request's method) is FIFO-evicted, so a page that opens thousands
 * of requests without responses cannot grow this without limit.
 */

/** Completed observations kept per tab. A single action window sees far fewer; the rest is slack. */
const MAX_OBSERVATIONS = 100;
/** In-flight requests tracked per tab, awaiting their response. */
const MAX_PENDING = 300;
/** Longest url stored. Full urls can be enormous (data: / query-encoded payloads). */
const MAX_URL_CHARS = 2048;
/** Longest transport error text stored. */
const MAX_ERROR_CHARS = 120;

interface Pending {
  method: string;
  type: string;
  url: string;
  redirects: number;
}

interface TabNetwork {
  observations: NetworkObservation[];
  pending: Map<string, Pending>;
}

const state = new WeakMap<WebContents, TabNetwork>();
/** WebContents whose permanent listener is already installed (guards re-attach on tab switch). */
const wired = new WeakSet<WebContents>();

function push(net: TabNetwork, observation: NetworkObservation): void {
  net.observations.push(observation);
  if (net.observations.length > MAX_OBSERVATIONS) {
    net.observations.splice(0, net.observations.length - MAX_OBSERVATIONS);
  }
  // A failed request is the whole point of this recorder, and today the only place it becomes visible is
  // the model's observation. An operator watching a run sees "browser_update_page ✓" for an action the
  // server rejected — the silent failure one level up. Log status + type ONLY: the url carries session
  // tokens and page-controlled text and has no business in a log line.
  //
  // Uses the SAME predicate as the model-facing selection, deliberately. An earlier version logged every
  // failing request, including subresource 404/403 noise the agent is correctly never shown — which made
  // a harness run look like the agent had been told about failures it never saw, and cost real debugging
  // time. A diagnostic log that does not match what was reported is worse than no log.
  if (isReportableFailure(observation)) {
    Logger.info('agent network failure observed', {
      status: observation.status,
      type: observation.type,
      method: observation.method,
    });
  }
}

function trackRequest(net: TabNetwork, params: unknown): void {
  const parsed = NetworkRequestSchema.safeParse(params);
  if (!parsed.success) return;
  const { requestId, type, request, redirectResponse } = parsed.data;
  // A redirect hop reuses the SAME requestId: keep counting hops rather than replacing the entry, so the
  // final observation can honestly say "→ 403 after 2 redirect(s)".
  const previous = net.pending.get(requestId);
  net.pending.set(requestId, {
    method: (request?.method ?? previous?.method ?? '').toUpperCase().slice(0, 16),
    type: type ?? previous?.type ?? '',
    url: (request?.url ?? previous?.url ?? '').slice(0, MAX_URL_CHARS),
    redirects: redirectResponse !== undefined ? (previous?.redirects ?? 0) + 1 : (previous?.redirects ?? 0),
  });
  if (net.pending.size > MAX_PENDING) {
    const oldest = net.pending.keys().next();
    if (!(oldest.done ?? false)) net.pending.delete(oldest.value);
  }
}

function trackResponse(net: TabNetwork, params: unknown): void {
  const parsed = NetworkResponseSchema.safeParse(params);
  if (!parsed.success) return;
  const { requestId, type, response } = parsed.data;
  const pending = net.pending.get(requestId);
  net.pending.delete(requestId);
  push(net, {
    method: pending?.method ?? '',
    url: response.url.slice(0, MAX_URL_CHARS),
    status: Math.trunc(response.status),
    type: type ?? pending?.type ?? '',
    ts: Date.now(),
    redirects: pending?.redirects ?? 0,
  });
}

function trackFailure(net: TabNetwork, params: unknown): void {
  const parsed = NetworkFailedSchema.safeParse(params);
  if (!parsed.success) return;
  const { requestId, type, errorText, canceled } = parsed.data;
  const pending = net.pending.get(requestId);
  net.pending.delete(requestId);
  // A CANCELED request is normal traffic, not a failure: navigating away, an aborted fetch, a
  // React effect cleanup. Reporting it would cry wolf on every successful navigation.
  if (canceled === true || errorText === 'net::ERR_ABORTED') return;
  const url = pending?.url ?? '';
  if (url.length === 0) return; // nothing identifiable to report
  push(net, {
    method: pending?.method ?? '',
    url,
    status: 0,
    type: type ?? pending?.type ?? '',
    ts: Date.now(),
    redirects: pending?.redirects ?? 0,
    ...(errorText !== undefined ? { errorText: errorText.slice(0, MAX_ERROR_CHARS) } : {}),
  });
}

/**
 * Start recording HTTP responses on `wc`. Idempotent — calling it on every `ensureAttached` is safe and
 * intended. Must be called BEFORE `Network.enable` so no event of the first navigation is missed.
 */
export function attachNetworkRecorder(wc: WebContents): void {
  if (wired.has(wc)) return;
  wired.add(wc);
  const net: TabNetwork = { observations: [], pending: new Map() };
  state.set(wc, net);
  wc.debugger.on('message', (_event: unknown, method: string, params?: unknown) => {
    if (method === 'Network.requestWillBeSent') trackRequest(net, params);
    else if (method === 'Network.responseReceived') trackResponse(net, params);
    else if (method === 'Network.loadingFailed') trackFailure(net, params);
  });
  wc.once('destroyed', () => {
    state.delete(wc);
  });
}

/**
 * The responses observed on `wc` at or after `sinceMs` (host clock).
 *
 * An empty array means **nothing was observed** — the tab may never have been attached — and must never
 * be read as "every request succeeded". The caller (`describeNetworkFailures`) is built on that rule.
 */
export function networkSince(wc: WebContents, sinceMs: number): NetworkObservation[] {
  const net = state.get(wc);
  if (net === undefined) return [];
  return net.observations.filter((o) => o.ts >= sinceMs);
}
