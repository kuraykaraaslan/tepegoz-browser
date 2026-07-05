import { gaussianJitter, easeInOut, easeOut, easeIn, catmullRom } from './math.js';

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** CDP key-event descriptor (mirrors the KEY_MAP entries in cdp-driver / macro-cdp). */
export interface KeySpec {
  key: string;
  code: string;
  keyCode: number;
  text?: string;
}

/** CDP `send` function shape — matches `wc.debugger.sendCommand`. */
export type CdpSend = (method: string, params: Record<string, unknown>) => Promise<unknown>;

/**
 * Wraps a CDP `send` function with human-like timing and motion:
 *
 * - Mouse: Catmull-Rom curved path with eased speed, real movementX/Y deltas, ~10% micro-pauses
 * - Click: press/release with Gaussian hold-time jitter and proper `buttons` field
 * - Scroll: 3-phase ease-out → overshoot → spring-back for natural momentum feel
 * - pressKey: Gaussian Hold-Time between keyDown/keyUp
 * - insertText: per-character with Gaussian Flight-Time delays (no paste-event signature)
 *
 * All CDP mouse events carry proper `movementX/Y` deltas — detection systems flag constant/zero values.
 * CDP events are `isTrusted = true` by design (out-of-process hardware channel).
 */
export class HumanInputAdapter {
  private curX = 0;
  private curY = 0;

  constructor(
    private readonly send: CdpSend,
    private readonly onCursorMove?: (x: number, y: number) => void,
  ) {}

  /**
   * Move the simulated cursor from the current position to (x, y) along a Catmull-Rom spline.
   * Fires one `mouseMoved` CDP event per waypoint with correct movementX/Y deltas.
   */
  async moveTo(x: number, y: number): Promise<void> {
    const dx = x - this.curX;
    const dy = y - this.curY;
    const dist = Math.hypot(dx, dy);

    if (dist < 4) {
      this.curX = x;
      this.curY = y;
      return;
    }

    // Catmull-Rom control points: ghost points add slight curvature
    const gx = (v: number): number => gaussianJitter(0, 15);
    const p0x = this.curX + gx(0);
    const p0y = this.curY + gx(0);
    const p1x = this.curX;
    const p1y = this.curY;
    const p2x = x;
    const p2y = y;
    const p3x = x + gx(0);
    const p3y = y + gx(0);

    const n = Math.min(80, Math.max(4, Math.round(dist / 6)));
    const totalMs = Math.min(700, Math.max(120, (dist / 400) * 1000));
    const stepMs = totalMs / n;

    // Choose one random waypoint index where we may pause (~10% chance)
    const pauseAt = Math.random() < 0.1 ? Math.floor(Math.random() * n) : -1;

    let prevX = this.curX;
    let prevY = this.curY;

    for (let i = 1; i <= n; i++) {
      const tRaw = i / n;
      const t = easeInOut(tRaw);
      const px = catmullRom(p0x, p1x, p2x, p3x, t);
      const py = catmullRom(p0y, p1y, p2y, p3y, t);

      const movX = Math.round((px - prevX) * 100) / 100;
      const movY = Math.round((py - prevY) * 100) / 100;

      await this.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: px,
        y: py,
        movementX: movX,
        movementY: movY,
      });
      this.onCursorMove?.(px, py);
      prevX = px;
      prevY = py;

      const waitMs = i === pauseAt
        ? Math.max(40, gaussianJitter(80, 40))
        : stepMs;
      await delay(waitMs);
    }

    this.curX = x;
    this.curY = y;
  }

  /**
   * Human-like click at (x, y): move there, brief pre-press pause, mousePressed, hold, mouseReleased.
   * Sets `buttons: 1` during press and `buttons: 0` after release (detection systems check this field).
   */
  async click(x: number, y: number): Promise<void> {
    await this.moveTo(x, y);
    await delay(Math.max(20, gaussianJitter(80, 30)));

    const base = { x, y, button: 'left' as const, clickCount: 1 };
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base, buttons: 1 });
    await delay(Math.max(10, gaussianJitter(60, 20)));
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base, buttons: 0 });
  }

  /**
   * 3-phase scroll simulating natural trackpad/wheel momentum:
   *   Phase 1 — Main ease-out scroll  (~90% of distance)
   *   Phase 2 — Overshoot             (~7% extra, same direction)
   *   Phase 3 — Spring-back           (retracts the overshoot)
   *
   * Each phase dispatches multiple small mouseWheel events so deltas stay small
   * (a single large-delta event is a strong bot signal).
   */
  async scroll(direction: 'up' | 'down', totalPx?: number): Promise<void> {
    const sign = direction === 'down' ? 1 : -1;
    const effectivePx = totalPx ?? Math.max(300, gaussianJitter(540, 60));
    const overshootPx = effectivePx * Math.max(0.04, gaussianJitter(0.07, 0.02));

    const dispatchPhase = async (
      deltaTotalPx: number,
      events: number,
      durationMs: number,
      ease: (t: number) => number,
    ): Promise<void> => {
      const deltaSign = deltaTotalPx >= 0 ? 1 : -1;
      const absDelta = Math.abs(deltaTotalPx);
      const weights: number[] = [];
      let weightSum = 0;
      for (let i = 0; i < events; i++) {
        const t = (i + 0.5) / events;
        const w = ease(t);
        weights.push(w);
        weightSum += w;
      }
      const intervalMs = durationMs / events;
      for (let i = 0; i < events; i++) {
        const deltaY = sign * deltaSign * (weights[i]! / weightSum) * absDelta;
        const deltaX = gaussianJitter(0, 0.7);
        await this.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x: 10,
          y: 10,
          deltaX,
          deltaY,
        });
        await delay(intervalMs);
      }
    };

    // Phase 1: main scroll, ease-out (fast start, gentle finish)
    const mainCount = Math.round(Math.max(8, gaussianJitter(11, 1.5)));
    await dispatchPhase(effectivePx * 0.9 + overshootPx, mainCount, 450, easeOut);

    // Phase 2: spring-back (ease-in, opposite direction, quick)
    const springCount = Math.round(Math.max(2, gaussianJitter(3, 0.5)));
    await dispatchPhase(-overshootPx, springCount, 120, easeIn);
  }

  /**
   * Press one key: keyDown → Gaussian Hold-Time → keyUp.
   * Models the Hold Time (HT) metric used by behavioral detectors.
   */
  async pressKey(spec: KeySpec, modifiers = 0): Promise<void> {
    const common: Record<string, unknown> = {
      modifiers,
      key: spec.key,
      code: spec.code,
      windowsVirtualKeyCode: spec.keyCode,
      nativeVirtualKeyCode: spec.keyCode,
    };
    const downType = spec.text !== undefined ? 'keyDown' : 'rawKeyDown';
    await this.send('Input.dispatchKeyEvent', {
      type: downType,
      ...common,
      ...(spec.text !== undefined ? { text: spec.text } : {}),
    });
    await delay(Math.max(15, gaussianJitter(70, 30)));
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
  }

  /**
   * Type text character by character with Gaussian Flight-Time delays between each character.
   * Per-character `Input.insertText` avoids the paste-event signature that detectors flag.
   * Models the Flight Time (FT) metric used by behavioral detectors.
   */
  async insertText(text: string): Promise<void> {
    for (const char of text) {
      await this.send('Input.insertText', { text: char });
      await delay(Math.max(15, gaussianJitter(60, 25)));
    }
  }
}
