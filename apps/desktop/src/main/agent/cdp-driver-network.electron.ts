import type { WebContents } from 'electron';
import { Logger } from '@tepegoz/libs';
import {
  isActionBearingFailure,
  isActionBearingType,
  isReportableFailure,
  type NetworkObservation,
} from '@tepegoz/browser-tools';
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
/**
 * XHR/fetch/document requests (success AND failure) kept per tab for `browser_get_network` (P3-d).
 *
 * A SEPARATE ring from {@link MAX_OBSERVATIONS} on purpose: that one rings only action-bearing
 * FAILURES so page noise can never evict the one failure post-action verification exists to catch.
 * This one keeps successes too, but still only XHR/fetch/document — image/script/font traffic stays
 * out — so a debugging read is not drowned and cannot be used to flush the failure ring.
 */
const MAX_REQUESTS = 60;
/** In-flight requests tracked per tab, awaiting their response. */
const MAX_PENDING = 300;
/** Longest url stored. Full urls can be enormous (data: / query-encoded payloads). */
const MAX_URL_CHARS = 2048;
/** Longest transport error text stored. */
const MAX_ERROR_CHARS = 120;

/**
 * A url reduced to what may be stored and shown: no credentials, no query, no fragment. Stripped at
 * RECORD time rather than at display time, so the sensitive parts never sit in memory for the life of a
 * tab and no later formatting path can leak what it was told to hide.
 */
function safeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.username = '';
    u.password = '';
    u.search = '';
    u.hash = '';
    return u.toString().slice(0, MAX_URL_CHARS);
  } catch {
    return (raw.split(/[?#]/)[0] ?? '').slice(0, MAX_URL_CHARS);
  }
}

interface Pending {
  method: string;
  type: string;
  url: string;
  redirects: number;
  /** Host clock at `requestWillBeSent`. The action window is judged on when a request STARTED, not when
   *  its response happened to land — otherwise a poll already in flight, or anything that fires while
   *  `waitForPageSettled` waits for network idle, gets blamed on the interaction that did not cause it. */
  startedAt: number;
}

interface TabNetwork {
  observations: NetworkObservation[];
  /** All XHR/fetch/document requests (success + failure) for `browser_get_network` — see MAX_REQUESTS. */
  requests: NetworkObservation[];
  pending: Map<string, Pending>;
}

const state = new WeakMap<WebContents, TabNetwork>();
/** WebContents whose permanent listener is already installed (guards re-attach on tab switch). */
const wired = new WeakSet<WebContents>();

/** Ring a completed XHR/fetch/document request (any status) into the diagnostics buffer (P3-d). */
function pushRequest(net: TabNetwork, observation: NetworkObservation): void {
  if (!isActionBearingType(observation.type)) return;
  net.requests.push(observation);
  if (net.requests.length > MAX_REQUESTS) {
    net.requests.splice(0, net.requests.length - MAX_REQUESTS);
  }
}

/** Wall-clock ms from request start to now, or `undefined` when the request start was not observed. */
function durationSince(startedAt: number | undefined): number | undefined {
  return startedAt === undefined ? undefined : Math.max(0, Date.now() - startedAt);
}

function push(net: TabNetwork, observation: NetworkObservation, pageUrl: string): void {
  // Ring ONLY what could ever be reported. A normal page load issues dozens of images/scripts/fonts; if
  // those shared the buffer they would evict the single action-bearing failure this recorder exists to
  // catch — and a page could do it deliberately to re-silence its own failed save.
  if (!isActionBearingFailure(observation)) return;
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
  let pageOrigin: string | null;
  try {
    pageOrigin = new URL(pageUrl).origin;
  } catch {
    pageOrigin = null;
  }
  if (isReportableFailure(observation, pageOrigin)) {
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
    url: safeUrl(request?.url ?? previous?.url ?? ''),
    redirects:
      redirectResponse !== undefined ? (previous?.redirects ?? 0) + 1 : (previous?.redirects ?? 0),
    // A redirect hop keeps the ORIGINAL start time — the chain is one request as far as causality goes.
    startedAt: previous?.startedAt ?? Date.now(),
  });
  if (net.pending.size > MAX_PENDING) {
    const oldest = net.pending.keys().next();
    if (!(oldest.done ?? false)) net.pending.delete(oldest.value);
  }
}

function trackResponse(net: TabNetwork, params: unknown, pageUrl: string): void {
  const parsed = NetworkResponseSchema.safeParse(params);
  if (!parsed.success) return;
  const { requestId, type, response } = parsed.data;
  const pending = net.pending.get(requestId);
  net.pending.delete(requestId);
  const durationMs = durationSince(pending?.startedAt);
  const observation: NetworkObservation = {
    method: pending?.method ?? '',
    url: safeUrl(response.url),
    status: Math.trunc(response.status),
    type: type ?? pending?.type ?? '',
    ts: pending?.startedAt ?? Date.now(),
    redirects: pending?.redirects ?? 0,
    ...(durationMs !== undefined ? { durationMs } : {}),
  };
  push(net, observation, pageUrl);
  pushRequest(net, observation);
}

function trackFailure(net: TabNetwork, params: unknown, pageUrl: string): void {
  const parsed = NetworkFailedSchema.safeParse(params);
  if (!parsed.success) return;
  const { requestId, type, errorText, canceled, blockedReason } = parsed.data;
  const pending = net.pending.get(requestId);
  net.pending.delete(requestId);
  // A CANCELED request is normal traffic, not a failure: navigating away, an aborted fetch, a
  // React effect cleanup. Reporting it would cry wolf on every successful navigation.
  if (canceled === true || errorText === 'net::ERR_ABORTED') return;
  // Neither is a request THIS BROWSER refused to send. Tepegöz ships its own adblocker, and CSP /
  // mixed-content / extension rules block requests on perfectly healthy pages — attributing those to the
  // agent's click would make the product report "your save failed" every time it successfully blocked a
  // tracker. `blockedReason` is the CDP-native signal; the ERR_BLOCKED_* family covers the rest.
  if (
    blockedReason !== undefined ||
    (errorText !== undefined && errorText.startsWith('net::ERR_BLOCKED'))
  ) {
    return;
  }
  const url = pending?.url ?? '';
  if (url.length === 0) return; // nothing identifiable to report
  const durationMs = durationSince(pending?.startedAt);
  const observation: NetworkObservation = {
    method: pending?.method ?? '',
    url,
    status: 0,
    type: type ?? pending?.type ?? '',
    ts: pending?.startedAt ?? Date.now(),
    redirects: pending?.redirects ?? 0,
    ...(errorText !== undefined ? { errorText: errorText.slice(0, MAX_ERROR_CHARS) } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
  };
  push(net, observation, pageUrl);
  pushRequest(net, observation);
}

/**
 * Start recording HTTP responses on `wc`. Idempotent — calling it on every `ensureAttached` is safe and
 * intended. Must be called BEFORE `Network.enable` so no event of the first navigation is missed.
 */
export function attachNetworkRecorder(wc: WebContents): void {
  if (wired.has(wc)) return;
  wired.add(wc);
  const net: TabNetwork = { observations: [], requests: [], pending: new Map() };
  state.set(wc, net);
  wc.debugger.on('message', (_event: unknown, method: string, params?: unknown) => {
    if (method === 'Network.requestWillBeSent') {
      trackRequest(net, params);
      return;
    }
    // The page the tab is on right now — the origin a failure has to match to count as THIS page's
    // action failing. Read per event (a tab navigates) and defensively, since a destroyed tab throws.
    let pageUrl = '';
    try {
      pageUrl = wc.isDestroyed() ? '' : wc.getURL();
    } catch {
      pageUrl = '';
    }
    if (method === 'Network.responseReceived') trackResponse(net, params, pageUrl);
    else if (method === 'Network.loadingFailed') trackFailure(net, params, pageUrl);
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

/**
 * The XHR/fetch/document requests observed on `wc` at or after `sinceMs` (host clock) — successes AND
 * failures, for the read-only `browser_get_network` diagnostics tool (P3-d).
 *
 * An empty array means **nothing was observed** — the tab may never have been attached — never "the
 * page made no requests".
 */
export function networkRequestsSince(wc: WebContents, sinceMs: number): NetworkObservation[] {
  const net = state.get(wc);
  if (net === undefined) return [];
  return net.requests.filter((o) => o.ts >= sinceMs);
}
