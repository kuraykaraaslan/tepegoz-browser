# Routing a tab through a tunnel: what it does, and what it does not

Tepegöz can send one tab, or a whole tab group, out through a VPN, Tor, or a SOCKS5 endpoint you
already run. This page explains what that changes and — more importantly — what it does **not**, because
the most common mistake with a feature like this is trusting it for something it was never doing.

> **Turkish translation of this page is owed.** The repo has no bilingual-docs mechanism yet; the
> in-app strings this guide describes are already en + tr.

## What it changes

**The network address a site sees.** With a tab bound to a tunnel, the site — and anything watching the
network between you and the tunnel's exit — sees the tunnel's address, not yours. DNS for that tab is
resolved **through** the tunnel (SOCKS5, hostname form), so the site name does not leak to your ISP
either.

That is the whole of it. One address, for one tab or group, changed.

## What it does not change

| You might assume…                                          | Actually                                                                                                                                                                                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "This hides who I am on the site"                          | No. Cookies, logins and history stay with the tab. A site you are signed in to still knows you.                                                                                                                        |
| "This makes my browser look like everyone's"               | No. The TLS handshake, HTTP header order and request timing are identical through every tunnel here, so anti-bot and reputation systems still recognise the browser. Tepegöz does not normalise those in this version. |
| "An agent-driven tab is as anonymous as a hand-driven one" | No. Input humanisation (`@tepegoz/human-input`) shapes mouse/keyboard timing only, not request pacing — automation is still visible at the network layer, tunnel or not.                                               |
| "Tor here is Tor Browser"                                  | No. See below.                                                                                                                                                                                                         |

Fingerprinting is a separate problem with a separate answer — see
[`threat-model.md`](threat-model.md) (§ "Network-privacy tunnels" and the residual-risk list). To
forget what a site already knows about you, clear its data: **Settings → Privacy**.

## The exit operator is not your friend, it is your new ISP

A Tor exit node or a VPN provider sees exactly what a plaintext ISP would, and can modify anything not
protected by TLS. The feature does not remove that party — it **moves** it, to one you chose, on your
instruction. Use HTTPS. The connection's note ("Tor", "Mullvad SE") is free text you typed; Tepegöz
cannot verify where a loopback SOCKS port actually comes out and never presents it as fact.

## If you use Tor

- **A Tor-routed tab is not a Tor Browser session.** Direct traffic and Tor traffic run in this
  browser at the same time, and activity correlated across the two can re-link an anonymous session —
  the pattern Tor Browser exists to prevent. For strong anonymity, use Tor Browser.
- **Chaining a VPN before Tor** shifts trust onto the VPN operator, which can then see that you use
  Tor. It is supported here; it is generally not recommended.
- **Each Tor connection keeps its own entry guards.** Creating several Tor connections for path
  isolation means several independent guard selections, and deleting and recreating a connection is a
  guard rotation you did not ask for. Keep **one** Tor connection if you want Tor's default guard
  stability; create more only when provable path separation is worth more. See
  [`adr/0011-vpn-network-privacy.md`](adr/0011-vpn-network-privacy.md) § 7.

## Practical notes

- **Nothing is bundled.** Tepegöz does not ship WireGuard or Tor. It looks for them in the usual
  install locations and on `PATH`, or you point it at the folder in **Settings → Network privacy →
  helpers**. A missing helper makes the connection report "not connected" with the folder to drop it
  into.
- **A tunnel that dies does not fall back to the clear path.** The kill-switch has no `DIRECT`
  fallback: a dropped connection blocks its tabs' egress until it recovers. That is by design — silent
  fallback is the one outcome a network-privacy feature must never have.
- **A failed connection tells you what to fix.** The connection row maps the failure to one sentence
  and a next step (helper missing, bad config, unreachable server, …) rather than showing raw program
  output.
- **App-issued traffic** (agent fetches, model-provider calls) follows the **General** (profile-wide)
  route only, never a per-tab one — a main-process request has no tab to inherit from — and is refused
  rather than sent in the clear if the General route is a tunnel that is down.
