# Research — imported, not authored

Market and competitor research that was **imported**, mostly as LLM deep-research exports. It informs
product decisions; it does not specify them.

Kept apart from the rest of `docs/` on purpose. These files used to sit at the top level of `docs/`
under names like `ChatGPT - Claude Eklentisi Geri Bildirimleri.md`, one directory listing away from
`ARCHITECTURE.md` and `THREAT-MODEL.md` — which invites reading an unreviewed third-party summary as
though it were a design decision this project made. The authored documents are the ADRs, the threat
model, and `phases/`.

Two cleanups were applied on import (2026-08-21):

- **Citation markers stripped.** The exports carried ChatGPT's private-use-area citation controls
  (`U+E200 cite U+E202 turn31view0 … U+E201`) — invisible in an editor, meaningless outside ChatGPT,
  and 28 KB of them across 23 files. The prose is unchanged; only the markers were removed. The
  numbered source lists at the bottom of each document are the surviving provenance.
- **Names normalized** to kebab-case ASCII, so the paths are quotable in a shell and stable in links.

`docs/research/competitors/` and `docs/research/privacy/` were folded in here as `competitors/` and `privacy/`. A directory called
"new" stops being true the day after it is created, and neither name said what was inside.

## Layout

- `competitors/` — agentic-browser and rival-product user feedback (Atlas, Comet, Fellou, Opera Neon,
  Brave, IDM), plus the AI-browser vs. AI-extension feature split.
- `extensions/` — complaint/suggestion analyses for the extension categories this project ships its own
  answers to (Grammarly, uBlock Origin, iMacros, browser translation).
- `privacy/` — Tor, VPN, fingerprinting and ISP-tracking notes behind ADR-0011.

> These are third-party summaries with third-party claims. Cite the underlying source, not this folder.
