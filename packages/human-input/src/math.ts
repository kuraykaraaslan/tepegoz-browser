/**
 * Pure math helpers for human-like input simulation.
 * No DOM, no Node, no Electron — safe to use anywhere.
 */

/** Gaussian sample via Box-Muller transform. Result clamped to ±3σ to avoid runaway outliers. */
export function gaussianJitter(mean: number, std: number): number {
  const u1 = 1 - Math.random(); // avoid log(0)
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + Math.max(-3 * std, Math.min(3 * std, z * std));
}

/** Smoothstep ease-in-out: f(0)=0, f(1)=1, zero first-derivative at both ends. */
export function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Ease-out only (fast start, slow finish): f(0)=0, f(1)=1. */
export function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** Ease-in only (slow start, fast finish): f(0)=0, f(1)=1. */
export function easeIn(t: number): number {
  return t * t;
}

/**
 * Catmull-Rom spline interpolation for one coordinate axis.
 * P0..P3 are control points; t ∈ [0,1] interpolates between P1 and P2.
 */
export function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}
