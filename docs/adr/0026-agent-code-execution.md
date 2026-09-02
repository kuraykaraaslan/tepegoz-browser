# ADR-0026: Agent code execution — a sandbox proven by measurement, not by argument

- **Status:** Accepted
- **Date:** 2026-08-19
- **Refines:** [ADR-0006](0006-policy-kernel-hitl.md) (deterministic policy kernel) ·
  **complements** [ADR-0008](0008-perception-cdp.md) (DOM/a11y-first perception)
- **Phase:** [S5 — Code Execution](../../phases/ai-agent/phase-s5-code-execution.md) PR0–PR1

## Context

Extracting a thousand-row table by clicking through it costs a thousand steps the agent does not have.
`browser-use` reported that adding a code-execution action beside click/type was their single largest
measured competence jump, for the ordinary reason that parsing HTML in code matches what a model is good
at far better than a click-by-click walk does.

The danger is not the sandbox escaping. It is the **input**: the script is authored by a model that has
just read the page, so a hostile page's real move is to persuade the model to write an exfiltrating
script. Any design has to survive that, and "the model wouldn't fall for it" is not a design.

The phase proposed running such scripts in an **isolated world on the live page** —
`executeJavaScriptInIsolatedWorld`, the same mechanism `buildDomTree` already uses — reasoning that a
world which shares the DOM but not the page's JS principal "cannot exfiltrate on its own".

## Decision

**That reasoning is wrong, and the spike says so.**
[`e2e/spike-code-exec-sandbox.spec.ts`](../../e2e/spike-code-exec-sandbox.spec.ts) points a canary server
at the isolated world and measures what arrives. Arm A — the proposed design — hit the canary on the
first attempt. An isolated world is a **JS-principal** boundary, not a network one: it shares the frame,
so it shares the frame's network access. That design is recorded as a **NO-GO** rather than quietly
patched, because the next person to read the phase doc would otherwise inherit the same wrong intuition.

**What ships instead is a hidden window whose session refuses the network, holding a copy of the page.**
Three properties, each enforced below the JavaScript engine:

1. **Session-level request cancellation.** Everything but `about:` and `data:` is cancelled. It is a
   property of the _session_, not a window around the call, so a `setTimeout` firing after the script
   returns is just as dead — the spike fires exactly that deferred attempt.
2. **`default-src 'none'` CSP**, delivered in the sandbox document's markup so it is in force from parse
   time. This layer exists because of a second measured finding: **Electron's `webRequest` does not
   intercept the WebSocket handshake.** With the session filter alone, every HTTP path was dead and
   `ws://` walked straight out.
3. **HTML copied in, never loaded.** `innerHTML` does not execute scripts, so the page's own JavaScript
   never runs in the sandbox either. It holds data, not a live origin — no cookies, no `localStorage`, no
   same-origin credentials to read.

**No JS-level defence is attempted, deliberately.** Deleting `fetch` or shadowing `XMLHttpRequest` is not
a boundary: `globalThis`, `Function('return this')()`, and a fresh iframe's `contentWindow` all hand the
property straight back. Believing in such a filter is worse than not having one, because it makes the
real boundary feel optional. For the same reason `acceptScript` does **not** scan the script for
`fetch` or `document.cookie` — that check loses to string concatenation and computed property access,
and a test asserts we do not pretend otherwise.

**The kernel classes the call, and journals the hash.** `code_exec_read` is allowed with the reason code
`code_exec_read_journaled`; the tool result carries a **16-hex script hash and never the body**. A
model-authored script is composed from page content, so copying it into the audit log would preserve an
injection payload in the one record meant to be trustworthy. `code_exec_write` exists as a class and is
**denied unconditionally** — present precisely so that enabling it is a visible change to the kernel with
its own ADR and its own adversarial battery, not a flag someone flips.

**The class is declared on the descriptor, never per call.** A caller that could name its own capability
class could name the harmless one.

**Results are capped and truncation is reported.** A silently shortened table is worse than no table: the
model would aggregate over what it was given and state the answer with full confidence, with nothing
downstream able to tell the input was partial.

## Consequences

**Positive.** Bulk extraction in one call instead of N. The exfiltration path is closed by two
independent mechanisms below the engine rather than by one heuristic above it, and both are verified by a
canary rather than by assertion. The sandbox has no credentials to steal even if a script could reach the
network.

**Negative / accepted.** The script sees a **snapshot**, not the live page — values computed by page JS
after the snapshot are absent, and nothing the script does can affect the real page (which in v1 is the
point). Copying large HTML into a fresh window costs time and memory per call. A hidden `BrowserWindow`
per invocation is heavier than an isolated world would have been; that is the price of the boundary.

**Deviation (tool names).** `ToolNameSchema` requires `{domain}_{verb}_{noun}` with a closed verb list, so
the phase's `browser_execute_extraction` and `browser_extract_table` are unregistrable. They are
`browser_analyze_page` and (when built) `browser_get_table`.

**Owed, and stated rather than implied.** The `s5_extract_*` competence numbers, the ≥50% token / ≥40%
step reductions, and the `atk_code_exec_*` battery at N≥10 are all **measurement-owed** on a funded key.
Until the adversarial battery runs, the **RISK GATE stands**: if any exfil fixture cannot reach zero, the
tool is pinned permanently to the `ask` tier. `browser_get_table` (the curated table extractor) is not
built; `browser_analyze_page` already returns table contents, so it is an ergonomics gap, not a
capability one.
