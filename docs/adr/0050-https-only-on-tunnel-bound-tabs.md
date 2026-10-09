# ADR-0050: HTTPS-only on tunnel-bound tabs — upgrade first, interstitial with a per-site bypass on failure, never a silent downgrade

- **Status:** Accepted (shipped — policy core, `onBeforeRequest` enforcement, interstitial, journal, `httpsOnlyOnTunnel` preference and Privacy toggle; the live-tunnel UAT is still owed)
- **Date:** 2026-10-09
- **Relates to:** [ADR-0011](0011-vpn-network-privacy.md) (the exit is untrusted; fail-closed egress) ·
  [ADR-0043](0043-safe-browsing-service-and-egress.md) (the interstitial precedent) ·
  [ADR-0044](0044-page-info-and-connection-security.md) (the cleartext warning this enforces)

## Context

ADR-0011 treats a Tor exit, a VPN provider and a SOCKS proxy as untrusted: anything not protected by TLS
can be read and changed there. The Site Info bubble already _warns_ on `http:` over a tunnel; nothing
_enforced_ anything. The owner decision is **upgrade first, then an interstitial with a per-site bypass on
failure; never a silent downgrade.**

## Decision

### 1. The seam: a webRequest handler keyed on the partition

A synchronous `onBeforeRequest('https-only')` handler is registered in `initBrowsingNetwork`, so it also
runs in safe mode and ahead of the deferred `adblock` handler. `attach()` hands the handler the session
**partition**, and the predicate is `isTunneledPartition(partition)` (`@tepegoz/tab-engine`), covering
both `persist:tepegoz-web--conn-{id}` and `tepegoz-private--conn-{id}`. The partition is the real egress
path: the session proxy is bound to it. It needs no `webContents` lookup, so service workers and private
tunnels are covered. During a re-bind the session can lag `BindingService.resolveFor`; that window is
accepted and documented. `BrowsingSessions.isTunnelPartition` is deliberately narrower (it gates a
destructive wipe) and is not used. The tunnel kind comes from `ConnectionPool.get(id)?.kind`; an unknown
kind is treated as not Tor.

### 2. Policy (pure core, `decide()`)

With the preference on, on a tunnel partition, for `http:`:

- **Exempt:** loopback, and `.onion` only on a Tor connection.
- **Not exempt:** private, LAN and dotless hosts. They are upgraded and then fail closed at the tunnel
  proxy, which is deny-by-default for them; exempting them would send cleartext to the exit.
- **Main-frame GET:** redirect to the `https:` URL. A second request for the same URL within 10 seconds is
  cancelled with reason `loop`.
- **Main-frame non-GET:** cancelled (`non-get`). Upgrading would reload as a GET and lose the body.
- **Sub-resource GET:** upgraded; other methods cancelled. **`ws:`** is cancelled, not upgraded.
- **Bypassed `(partition, host)`:** allowed for the main frame, and for sub-resources **of that same host
  only** (matched against the tab's top-level host). A third party the page loads over `http:` is still
  upgraded or cancelled, so one click does not open cleartext to everyone the page talks to.
- **Loop guard:** the exact http URL just upgraded is remembered per tab (10 s). A second request for it
  while the first navigation is still in flight is a redirect loop and is cancelled; the record is dropped
  when the navigation commits or stops, so reopening the same link is not a loop.

### 3. Fail closed, deliberately

The multiplexer and Safe Browsing fail **open** on a handler error. This handler wraps itself and returns
`{ cancel: true }` on any error **on a tunnel partition**; a Direct partition is never touched. That is a
deliberate deviation: a tunnel-bound tab that cannot be checked must not fall through to cleartext.

### 4. The interstitial and the closed error-code list

A main-frame `did-fail-load` is matched against a per-tab pending record (host, http URL, reason,
timestamp; 60 s TTL; cleared on `did-navigate` and `did-stop-loading`). The bypass is offered **only** for
`-102`, `-101`, `-107`, `-118`, `-324` (no HTTPS on the host), `-120`/`-121` (the SOCKS5 client's
"connect failed / host unreachable" — how a refused :443 looks behind a local SOCKS tunnel; **to be
confirmed against a live tunnel in the UAT**) and for reason `loop`. For certificate errors (`-2xx`),
`-105` (DNS; a bypass would not help), `-115` and `-130` **no interstitial is shown at all** — the user
sees Chromium's own error page, with no way past it. A **Back-only** page is shown for a non-GET cancel
and when `BindingService.mayEgress(tabId)` is false. A tunnel that is down says "tunnel not connected", never
"no HTTPS". `-3` is ignored. Certificate errors stay with the certificate broker; this feature never
offers to continue past one. Copy comes from the app dictionary (`mainStrings()`, en + tr).

### 5. Downgrade-attack mitigations

An attacker who can block port 443 (or the exit itself) can try to push the user to HTTP. Mitigations: the
bypass needs an explicit click; the wording names interference as a possible cause; the scope is one host
on one partition, **session-only and in memory** (cap 200, oldest evicted); every bypass is journaled
(host and tunnel kind only, never path or query).

### 6. The bypass nonce

"Continue over HTTP" links to `http://host/path#__tepegoz_https_only_bypass__=<nonce>`. The nonce is a
single-use `randomUUID` held in a per-`WebContents` `WeakMap` and bound to the host. A forged, reused,
other-tab or wrong-host nonce is an ordinary navigation, which is upgraded again. A page therefore cannot
downgrade a host by linking to `http://bank#...`.

### 7. Preference

`httpsOnlyOnTunnel` is private (not in `PublicSettings`), default **on**, classified in
`developer-registry.ts`, and toggled in Settings > Privacy. It is also the rollback switch.

## Known gaps

- Safe Browsing does not re-check the upgraded URL.
- A popup gets Chromium's error page (fail closed), not the interstitial.
- `ws:` is cancelled rather than upgraded to `wss:`.
- Safe Browsing's own bypass sentinel has no nonce (this feature's does).
- The bypass is not persisted across restarts.

## Follow-ups (not in this ADR)

1. A persisted per-site bypass list with a Settings list and IPC.
2. A `tepegoz://` interstitial page shared with Safe Browsing.
3. A Site Info state for "upgraded" and "bypassed".
4. `ws:` to `wss:` upgrade.
5. A Safe Browsing check of the upgraded URL.
