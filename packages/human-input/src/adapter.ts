import { gaussianJitter, easeInOut, easeOut, catmullRom } from './math.js';

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
    private readonly onAction?: (kind: string, detail: string) => void,
    /** Return true to abort the current movement and yield to real user input. */
    private readonly shouldYield?: () => boolean,
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
    const gx = (): number => gaussianJitter(0, 15);
    const p0x = this.curX + gx();
    const p0y = this.curY + gx();
    const p1x = this.curX;
    const p1y = this.curY;
    const p2x = x;
    const p2y = y;
    const p3x = x + gx();
    const p3y = y + gx();

    const n = Math.min(80, Math.max(4, Math.round(dist / 6)));
    const totalMs = Math.min(700, Math.max(120, (dist / 400) * 1000));
    const stepMs = totalMs / n;

    // Choose one random waypoint index where we may pause (~10% chance)
    const pauseAt = Math.random() < 0.1 ? Math.floor(Math.random() * n) : -1;

    let prevX = this.curX;
    let prevY = this.curY;

    for (let i = 1; i <= n; i++) {
      if (this.shouldYield?.()) break; // real mouse took over — stop mid-path
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
        button: 'none',
        buttons: 0,
        modifiers: 0,
        clickCount: 0,
        pointerType: 'mouse',
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
    this.onAction?.('click', `(${Math.round(x)}, ${Math.round(y)})`);
    await this.moveTo(x, y);
    if (this.shouldYield?.()) return; // user took control before we reached target
    await delay(Math.max(20, gaussianJitter(80, 30)));

    const base = { x, y, button: 'left' as const, clickCount: 1, modifiers: 0, pointerType: 'mouse' };
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base, buttons: 1 });
    await delay(Math.max(10, gaussianJitter(60, 20)));
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base, buttons: 0 });
  }

  /**
   * Smooth scroll using the page's native CSS scroll animation (window.scrollBy behavior:'smooth')
   * so the visual result is fluid. While the page animates, the cursor drifts naturally.
   * A small spring-back retraction follows to simulate trackpad momentum release.
   */
  async scroll(direction: 'up' | 'down', totalPx?: number): Promise<void> {
    const sign = direction === 'down' ? 1 : -1;
    const effectivePx = totalPx ?? Math.max(300, gaussianJitter(540, 60));
    const overshootPx = effectivePx * Math.max(0.04, gaussianJitter(0.07, 0.02));

    this.onAction?.('scroll', direction);

    // Cursor starts at current position (or page center if not yet moved)
    let cx = this.curX > 0 ? this.curX : 640;
    let cy = this.curY > 0 ? this.curY : 400;
    this.onCursorMove?.(cx, cy);

    // Trigger visible smooth scroll animation via JS eval
    await this.send('Runtime.evaluate', {
      expression: `window.scrollBy({top:${sign * (effectivePx + overshootPx)},behavior:'smooth'})`,
      silent: true,
      returnByValue: false,
    }).catch(() => undefined);

    // Cursor drift while the page animates (natural hand micro-tremor during scroll)
    const durationMs = Math.min(1200, Math.max(500, effectivePx));
    const steps = Math.round(durationMs / 50);
    for (let i = 0; i < steps; i++) {
      if (this.shouldYield?.()) break; // user took control
      cx += gaussianJitter(0, 1.5);
      cy += gaussianJitter(0, 2.5) * sign;
      cx = Math.max(10, Math.min(1200, cx));
      cy = Math.max(10, Math.min(800, cy));
      this.onCursorMove?.(cx, cy);
      // Scatter a few small wheel events for behavioral authenticity (not for scroll effect)
      if (i % 4 === 0) {
        const t = (i + 0.5) / steps;
        await this.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x: cx,
          y: cy,
          deltaX: gaussianJitter(0, 0.5),
          deltaY: sign * easeOut(1 - t) * (effectivePx / Math.max(1, Math.floor(steps / 4))),
          modifiers: 0,
          pointerType: 'mouse',
        }).catch(() => undefined);
      }
      await delay(50);
    }

    // Spring-back: retract the overshoot so the net distance is effectivePx
    await this.send('Runtime.evaluate', {
      expression: `window.scrollBy({top:${-sign * overshootPx},behavior:'smooth'})`,
      silent: true,
      returnByValue: false,
    }).catch(() => undefined);

    for (let i = 0; i < 4; i++) {
      cx += gaussianJitter(0, 1);
      cy += gaussianJitter(0, 1.5) * -sign;
      this.onCursorMove?.(cx, cy);
      await delay(40);
    }

    this.curX = cx;
    this.curY = cy;
  }

  /**
   * Press one key: keyDown → Gaussian Hold-Time → keyUp.
   * Models the Hold Time (HT) metric used by behavioral detectors.
   */
  async pressKey(spec: KeySpec, modifiers = 0): Promise<void> {
    this.onAction?.('key', spec.key);
    const common: Record<string, unknown> = {
      modifiers,
      key: spec.key,
      code: spec.code,
      windowsVirtualKeyCode: spec.keyCode,
      nativeVirtualKeyCode: spec.keyCode,
    };
    const downType = spec.text === undefined ? 'rawKeyDown' : 'keyDown';
    await this.send('Input.dispatchKeyEvent', {
      type: downType,
      ...common,
      ...(spec.text === undefined ? {} : { text: spec.text }),
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
    this.onAction?.('type', text.length > 30 ? `${text.slice(0, 30)}…` : text);
    for (const char of text) {
      await this.send('Input.insertText', { text: char });
      await delay(Math.max(15, gaussianJitter(60, 25)));
    }
  }

  /**
   * Human "think/react" pause BETWEEN behaviors — the gap a real user leaves between one action and
   * the next (not the timing *within* a single motion). Gaussian-jittered and floored so it is never
   * zero. Defaults to ≈ 0.3–0.9 s; pass a smaller mean/std for the short beats inside a composed
   * action, e.g. `idle(200, 70)` between a click and the follow-up keystroke.
   */
  async idle(meanMs = 600, stdMs = 150): Promise<void> {
    await delay(Math.max(250, gaussianJitter(meanMs, stdMs)));
  }
}
