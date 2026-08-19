/**
 * Token budget for an escalated screenshot (S10 PR3) — pure, so the thing that bounds vision's cost is
 * unit-testable rather than an intention.
 *
 * A screenshot is the most expensive input the agent can send. The phase's cost gate is "$/task on
 * non-vision families unchanged (±10%)", which is only defensible if each escalation's size is bounded
 * *before* capture rather than hoped to be small. Vision models price images roughly by area, so the
 * budget is expressed in pixels-per-token and converted to a maximum area.
 */

/** Pixels one image token buys, in the ballpark published for current vision models. */
export const DEFAULT_PX_PER_TOKEN = 750;
/** Default ceiling for one escalated image. Deliberately modest: this is a fallback, not the main channel. */
export const DEFAULT_IMAGE_TOKEN_BUDGET = 1200;
/** Never scale below this on either edge — an image too small to read is worse than none. */
export const MIN_EDGE = 320;

export interface BudgetInput {
  width: number;
  height: number;
  /** Hard edge cap from the capture path (existing `maxEdge`, default 1400). */
  maxEdge: number;
  tokenBudget?: number;
  pxPerToken?: number;
}

export interface BudgetResult {
  width: number;
  height: number;
  /** Multiplier applied to the captured image. 1 = untouched. */
  scale: number;
  /** Estimated image tokens at the returned size — reported so cost is visible, not inferred. */
  estimatedTokens: number;
}

/**
 * Fit an image inside both the edge cap and the token budget, preserving aspect ratio.
 *
 * The floor matters as much as the ceiling: scaling until the budget is met would eventually produce an
 * unreadable thumbnail that costs tokens and answers nothing. When the budget cannot be met above
 * {@link MIN_EDGE}, the image is returned at the floor and `estimatedTokens` reports the real (higher)
 * cost — an honest overspend beats a cheap useless image, and the number says which happened.
 */
export function fitToBudget(input: BudgetInput): BudgetResult {
  const pxPerToken = Math.max(1, input.pxPerToken ?? DEFAULT_PX_PER_TOKEN);
  const budget = Math.max(1, input.tokenBudget ?? DEFAULT_IMAGE_TOKEN_BUDGET);
  const width = Math.max(1, Math.trunc(input.width));
  const height = Math.max(1, Math.trunc(input.height));

  const edgeScale = Math.min(1, input.maxEdge / Math.max(width, height));
  const maxArea = budget * pxPerToken;
  const areaScale = Math.min(1, Math.sqrt(maxArea / (width * height)));
  // The floor is applied last so it can override both caps — it is the one bound that protects utility
  // rather than cost.
  const floorScale = Math.min(1, MIN_EDGE / Math.min(width, height));
  const scale = Math.max(Math.min(edgeScale, areaScale), Math.min(1, floorScale));

  // Floor, not round: rounding up can push the area back over the budget the scale was chosen to meet,
  // which would make the stated ceiling a near-miss rather than a bound.
  const outWidth = Math.max(1, Math.floor(width * scale));
  const outHeight = Math.max(1, Math.floor(height * scale));
  return {
    width: outWidth,
    height: outHeight,
    scale,
    estimatedTokens: Math.ceil((outWidth * outHeight) / pxPerToken),
  };
}
