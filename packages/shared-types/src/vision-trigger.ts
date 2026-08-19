import { z } from 'zod';

/**
 * Why a step escalated to vision (S10).
 *
 * ADR-0008 puts DOM/a11y first and vision second, and the program's Never-list forbids
 * screenshots-every-step. So the interesting question is not "does vision help" but "does vision fire
 * **rarely**" — which only has an answer if every escalation carries a *reason* that can be counted and
 * attributed. A bare boolean would make the escalation rate unexplainable.
 *
 * The reason is decided **deterministically and pre-model** (ADR-0006's spirit): no model call gets to
 * declare itself blind.
 */
export const VISION_TRIGGER_REASONS = [
  /**
   * The page has content, and the element scan produced nothing the agent could choose between — either
   * no interactables at all, or only unlabelled ones. Canvas menus, closed shadow roots and image-only
   * controls all land here.
   */
  'blind_page',
  /** Canvas/WebGL covers enough of the viewport that the DOM is unlikely to describe what is on screen. */
  'canvas_dominant',
  /** A click kept being refused as occluded even after the click-time re-check tried to place it. */
  'persistent_occlusion',
  /** The same target was acted on repeatedly without effect — the DOM view is not matching the page. */
  'repeated_action_failure',
] as const;

export type VisionTriggerReason = (typeof VISION_TRIGGER_REASONS)[number];
export const VisionTriggerReasonSchema = z.enum(VISION_TRIGGER_REASONS);

/** A fired escalation: the reason plus the evidence that produced it, so a sweep can attribute it. */
export const VisionEscalationSchema = z.object({
  reason: VisionTriggerReasonSchema,
  /** Short, human-readable statement of what was observed. Page-derived text is sanitized upstream. */
  detail: z.string().max(300),
});
export type VisionEscalation = z.infer<typeof VisionEscalationSchema>;
