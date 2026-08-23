---
route: /network-privacy
title: Network privacy — per-tab VPN and Tor
description: Bind a single tab, a tab group, or the whole profile to its own WireGuard tunnel or Tor circuit, with a kill switch that actually fails closed.
nav: primary
status: needs-assets
---

# Network privacy

**[BUILD NOTE]** This page needs one diagram: three tabs, three different exits, one of them chained
through Tor over VPN, and one tab plainly marked Direct. The per-tab granularity is the whole idea and
it is hard to hold in words alone.

## Hero

### Headline

**One browser. A different exit for every tab.**

### Subhead

Most browsers have one connection to the internet. Tepegöz has as many as you configure — and each tab
or tab group picks the one it uses.

---

## Section 1 — Why per-tab

### Body

A system-wide VPN is a blunt instrument. Turn it on and everything moves: your bank starts seeing a
foreign address, your streaming stops working, your local devices vanish. So people turn it off, and
then nothing is protected.

Tepegöz binds at the level where the decision actually belongs. Research in one tab goes through Tor.
Work in a tab group goes through the company tunnel. Your bank stays on the direct connection where it
belongs. All at once, in the same window.

**Three scopes, most specific wins:** a tab's own override, then its group's binding, then the profile
default, then Direct. A tab dragged into a group adopts that group's route unless it was given one of
its own.

---

## Section 2 — What it supports

| Capability                         | Status                  |
| ---------------------------------- | ----------------------- |
| WireGuard, userspace               | Available               |
| Tor                                | Available               |
| Tor over VPN, chained              | Available               |
| Per-tab binding                    | Available               |
| Per-group binding                  | Available               |
| Profile-wide default               | Available               |
| Multiple tunnels up simultaneously | Available               |
| Fail-closed kill switch            | Available               |
| OpenVPN                            | Planned                 |
| Managed exit nodes                 | Only if there is demand |

**Nothing is bundled and nothing needs administrator rights.** Tepegöz does not ship a VPN, does not
resell one, and does not run exit nodes. You bring a configuration from a provider you already trust —
or none at all, since the default is Direct.

---

## Section 3 — The kill switch is the feature

### Body

A kill switch that lets traffic through when it fails is worse than none, because you stop watching.

In Tepegöz a tunnel is realized as a separate session partition pointed at that connection's local
endpoint. When the tunnel dies, requests on that partition **fail**. There is no fallback path to
inherit, so there is nothing to fall back to. The tab's badge switches to a named warning state — in
words, not colour alone — and the connection is marked down.

Switching a live tab to a different route is atomic by construction: the old view is destroyed before
the replacement exists, so there is no window in which a request can escape onto the old path. The
trade-off is that re-binding reloads the tab, and the browser tells you that before you click.

**[CLAIM]** Both properties are verified end-to-end against the built application, by killing a live
endpoint and confirming that a proven-reachable clear path records nothing.

---

## Section 4 — DNS

### Body

A tunnel that leaks DNS tells your provider every site you visit while you believe you are private.
Inside a tunnel-bound partition, hostnames are resolved **by the proxy, not locally** — the SOCKS
endpoint receives the hostname itself, and the older protocol variant that cannot carry one is rejected.

Stated honestly: browser-level prefetching is suppressed per partition, but Chromium's predictor and
DNS-over-HTTPS operate process-wide rather than per-session. That residual is documented rather than
papered over.

---

## Section 5 — What this does not do

### Body

**It hides your network address. It does not hide your browser.**

Fingerprinting resistance is not built yet. Routing a tab through Tor while your canvas hash, font list
and hardware signature stay unique gets you the ceremony of privacy without the substance. That work is
planned, with a published before-and-after entropy measurement as the gate — and until it lands, this
page will keep saying so.

It also cannot help with what you type. Logging into an account through a tunnel identifies you to that
account.

---

## Closing call to action

**What else is private by default** → `/privacy` · **The security model** → `/security`

---

## Meta

- **Title tag:** Per-tab VPN and Tor — Tepegöz
- **Meta description:** Bind a single tab, a tab group, or the whole profile to its own WireGuard tunnel
  or Tor circuit, with a kill switch that actually fails closed.
