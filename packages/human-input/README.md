# @tepegoz/human-input

Human-like input simulation for CDP-driven automation. `HumanInputAdapter` wraps a raw CDP `send`
function and turns straight-line, instant agent actions into motion and timing that read as a real
user: Catmull-Rom curved mouse paths with eased speed and real `movementX`/`movementY` deltas,
Gaussian-jittered click hold-times and key hold/flight-times, and a three-phase ease-out/overshoot/
spring-back scroll. All CDP events dispatched this way are `isTrusted: true` (an out-of-process
hardware-level channel), so the goal is purely making the _motion profile_ indistinguishable from a
human's rather than forging trust. Zero deps, no DOM/Node/Electron in the math layer — consumed by
the desktop app's CDP driver and macro CDP runner (`main/agent/cdp-driver.ts`, `main/macro/macro-cdp.ts`).

## Exports

- **`HumanInputAdapter`** — `moveTo`/`click`/`scroll`/`pressKey`/`insertText`; each call is built from
  the math helpers below and driven through an injected `CdpSend` function. Optional `onCursorMove`/
  `onAction` hooks support UI feedback (e.g. `CursorOverlay`), and an optional `shouldYield()` lets a
  real user's input interrupt a simulated movement mid-flight.
- **`CdpSend`** — the injected transport type: `(method, params) => Promise<unknown>`, matching
  `wc.debugger.sendCommand`.
- **`KeySpec`** — CDP key-event descriptor (`key`/`code`/`keyCode`/optional `text`).
- **`gaussianJitter`**, **`easeInOut`**, **`easeOut`**, **`easeIn`**, **`catmullRom`** — pure math
  helpers (Box-Muller Gaussian sampling clamped to ±3σ, standard easing curves, Catmull-Rom spline
  interpolation) usable independently of the CDP adapter.

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm build`
