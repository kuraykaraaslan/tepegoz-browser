import type { OmniboxQuickSettingTarget, OmniboxSuggestion } from './omnibox-suggest';

/**
 * The active page's transport-security verdict — structurally the `PageSecurityLevel` union owned by
 * `@tepegoz/shared-types`, spelled inline so this leaf package pulls in nothing from the IPC layer.
 */
export type OmniboxSecurityLevel =
  'secure' | 'not-secure' | 'dangerous' | 'internal' | 'file' | 'unknown';

/** Localized strings for the leading site-info control. Supplied by the host (i18n-agnostic package). */
export interface OmniboxSecurityLabels {
  /** aria-label for the button itself, e.g. "View site information". */
  button: string;
  secure: string;
  /** Shown as red text beside the icon on `http://`. */
  notSecure: string;
  dangerous: string;
  internal: string;
  file: string;
}

export interface OmniboxProps {
  /** The active tab's committed URL. The box re-syncs to this whenever the user is not editing it. */
  currentUrl: string;
  /**
   * The active page's security level — drives the leading glyph (lock / red "Not secure" / gear).
   * Omit or pass `'unknown'` to hide the control entirely.
   */
  securityLevel?: OmniboxSecurityLevel | undefined;
  /** Strings for the leading control. Required when `securityLevel` is a shown level. */
  securityLabels?: OmniboxSecurityLabels | undefined;
  /** Open the Site Info bubble. Receives the button's viewport rect so the host can anchor a popup.
   *  Omit to render the glyph as a non-interactive indicator. */
  onOpenSiteInfo?:
    ((anchor: { x: number; y: number; width: number; height: number }) => void) | undefined;
  /** Placeholder + aria-label text. Supplied by the host so the package stays i18n-agnostic. */
  placeholder: string;
  /** Called when the user submits a real navigation (Enter on a non-arithmetic value). */
  onNavigate: (input: string) => void;
  /**
   * Called when the whole input is arithmetic and the user submits — the omnibox never starts an AI
   * thread or a search for a calculation (Comet lesson). Defaults to copying the result to the
   * clipboard. The box always shows the computed result regardless.
   */
  onCalcResult?: (formatted: string) => void;
  /**
   * Bump this to focus the box and select what is in it — the host's answer to Ctrl+L / Alt+D.
   *
   * A counter rather than a boolean or a ref: pressing the shortcut twice in a row has to focus
   * twice, and a boolean that is already `true` produces nothing the second time. It is the same
   * idiom the find bar's `focusKey` already uses, so the two surfaces behave alike. Ignored when
   * undefined or 0, so the box never steals focus on mount.
   */
  focusToken?: number | undefined;
  /**
   * Async suggestion source (host fetches history/tabs and composes them with
   * `buildOmniboxSuggestions`). Called as the user types; return an ordered list. Omit to disable the
   * suggestions dropdown. The omnibox stays deterministic — suggestions never start an AI thread.
   */
  onSuggest?: ((query: string) => Promise<OmniboxSuggestion[]>) | undefined;
  /** Switch to an already-open tab (dispatched for `activateTab` suggestions). */
  onActivateTab?: ((tabId: string) => void) | undefined;
  /** Open a high-frequency settings panel (theme/language/privacy) from a deterministic suggestion. */
  onOpenQuickSetting?: ((target: OmniboxQuickSettingTarget) => void) | undefined;
  /**
   * Hand a task to the agent — reached ONLY from an explicitly typed `@agent`. This is the single
   * point where the omnibox crosses into AI, and it exists as its own callback (rather than folded
   * into `onNavigate`) so that the crossing is visible in the type, not buried in a string.
   */
  onAgentTask?: ((task: string) => void) | undefined;
  /** Open a download from `@download`. */
  onOpenDownload?: ((id: string) => void) | undefined;
  /** Run a saved skill from `@skill`. */
  onRunSkill?: ((id: string) => void) | undefined;
  /**
   * Open the Command Palette from `@command`, pre-seeded with what was typed. A hand-off, not a
   * second dispatch path: the omnibox opens the surface that owns the command list and stops there.
   */
  onOpenPalette?: ((query: string) => void) | undefined;
  /** Reports the rendered dropdown height so native hosts can manage WebContentsView layering. */
  onDropdownHeightChange?: ((height: number) => void) | undefined;
  /** Extra classes for the wrapping form (e.g. `flex-1` for layout). */
  className?: string;
}
