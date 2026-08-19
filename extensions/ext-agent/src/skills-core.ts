import type { AgentSkill } from './types';

/**
 * What selecting a skill is allowed to do, as a pure function (testable without a DOM).
 *
 * There are exactly two effects, and the interesting part is what is missing: **starting a run is not
 * one of them**. A stored row that could start a run would move the gesture that authorises a task away
 * from the human, which is the one thing a skills library must never be able to do.
 */
export interface SkillUse {
  /** What to put in the composer. The user still presses send. */
  prompt: string;
  /** The start page to open, or null. */
  openUrl: string | null;
}

/**
 * Schemes a stored start URL may use.
 *
 * A skill row is persisted data, and persisted data is not automatically trustworthy — it can arrive
 * from an older build, a restored profile, or a future import/sync path. Handing an unchecked string to
 * `createTab` would let such a row choose the scheme, and `javascript:` is a scheme. Whitelisting web
 * schemes costs one check and closes that entirely.
 */
const ALLOWED_SCHEMES = ['http:', 'https:'];

export function skillUse(skill: AgentSkill): SkillUse {
  return { prompt: skill.prompt, openUrl: safeStartUrl(skill.startUrl) };
}

/** The start URL if it is a web URL, else null. Unparseable is null — never a best guess. */
export function safeStartUrl(raw: string | undefined): string | null {
  if (raw === undefined || raw.trim().length === 0) return null;
  try {
    return ALLOWED_SCHEMES.includes(new URL(raw).protocol) ? raw : null;
  } catch {
    return null;
  }
}
