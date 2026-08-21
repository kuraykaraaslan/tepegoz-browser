# ADR-0001: Electron + React + TypeScript shell

- **Status:** Accepted
- **Date:** 2026-06-30

## Context

Tepegöz must be a real, standalone browser (not an extension) that runs the user's authenticated
session, drives pages via CDP, and ships a rich UI. Competitor browsers that forked Chromium
(Atlas/OWL) gained extensions at the cost of IME/popup/login regressions and a heavy upstream
security-patch burden. The whole agentic ecosystem (CDP/Playwright, MCP, provider SDKs) is JS/TS.
Primary target is Windows 11; the team is small.

## Decision

Build on **Electron** (bundled stock Chromium + Node) with **TypeScript (strict)** end-to-end and
**React** in the renderer. Reject: Chromium fork (maintenance + regression burden), CEF (C++-heavy,
off-ecosystem), Tauri/WebView2 (system-Edge dependency, weak CDP/multi-webview/extension depth).

## Consequences

- Fast iteration, one language, type-safe shared contracts across all layers.
- Stock Chromium keeps IME/Turkish keyboard, popup/login mechanics standard; security patches flow
  from upstream.
- **Trade-off:** Chrome-extension (MV3) support is partial (Phase 3, limited allowlist); full
  Chrome-Web-Store parity would require a patched-Chromium build — deferred to a Phase 4 decision.
- Native modules must be rebuilt against Electron's ABI for packaging.
