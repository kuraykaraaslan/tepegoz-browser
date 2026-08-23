/**
 * Extension-owned wire types re-exported by the desktop IPC contract. Each extension package is the
 * single source of truth for its settings/state/wire shapes; these are type-only (erased) except the
 * zod-free canonical arrays (e.g. AGENT_EFFORT_LEVELS), so the sandboxed preload stays dependency-free.
 */
import type {
  AgentApprovalRequest,
  AgentAutonomy,
  AgentBundleExportInput,
  AgentConfig,
  AgentEffort,
  AgentDelta,
  AgentEvent,
  AgentEventKind,
  AgentFileAttachment,
  AgentModelChoice,
  AgentModelInfo,
  AgentPlanPreview,
  AgentPlanStep,
  AgentRunResult,
  Attachment,
  TokenUsageSnapshot,
} from '@tepegoz/ext-agent/types';
// Canonical effort-level list is owned by the agent package (zod-free); re-exported so the preferences
// schema builds its z.enum from the same source (no drift), like the other canonical arrays below.
// LOCAL_CHOICE_ID is the picker's one non-key entry (the on-device provider); re-exported at runtime so
// main and the panel compare against the SAME literal instead of two hand-typed 'local' strings.
import { AGENT_EFFORT_LEVELS, LOCAL_CHOICE_ID } from '@tepegoz/ext-agent/types';
export { AGENT_EFFORT_LEVELS, LOCAL_CHOICE_ID };

export type {
  AgentApprovalRequest,
  AgentAutonomy,
  AgentBundleExportInput,
  AgentConfig,
  AgentEffort,
  AgentDelta,
  AgentEvent,
  AgentEventKind,
  AgentFileAttachment,
  AgentModelChoice,
  AgentModelInfo,
  AgentPlanPreview,
  AgentPlanStep,
  AgentRunResult,
  Attachment,
  TokenUsageSnapshot,
};

// Popup Blocker settings shape is owned by the extension package (like the Agent wire types above),
// so the extension stays the single source of truth. Type-only → erased for the sandboxed preload.
import type { PopupBlockerRequest, PopupBlockerSettings } from '@tepegoz/ext-popup-blocker/types';
export type { PopupBlockerRequest, PopupBlockerSettings };

// Adblock settings/state shape is owned by the extension package. Type-only → erased for preload.
import type {
  AdblockBlockedRequest,
  AdblockSettings,
  AdblockState,
} from '@tepegoz/ext-adblock/types';
export type { AdblockBlockedRequest, AdblockSettings, AdblockState };

// Typo extension settings/state shape is owned by the extension package. Type-only → erased for preload.
import type {
  TypoCheckInput,
  TypoCheckResult,
  TypoDictionaryInfo,
  TypoSettings,
  TypoState,
} from '@tepegoz/ext-typo/types';
export type { TypoCheckInput, TypoCheckResult, TypoDictionaryInfo, TypoSettings, TypoState };

// Translate extension settings/state shape is owned by the extension package. Type-only → erased.
import type {
  TranslateCloudFallbackRequest,
  TranslateCloudFallbackResponse,
  TranslateGlossaryTerm,
  TranslatePageState,
  TranslateSettings,
  TranslateState,
  TranslateTextInput,
  TranslateTextResult,
} from '@tepegoz/ext-translate/types';
export type {
  TranslateCloudFallbackRequest,
  TranslateCloudFallbackResponse,
  TranslateGlossaryTerm,
  TranslatePageState,
  TranslateSettings,
  TranslateState,
  TranslateTextInput,
  TranslateTextResult,
};

// Unified Player (ext-video-player) settings/state shape is owned by the extension package. Erased.
import type {
  VideoPlayerPageState,
  VideoPlayerSettings,
  VideoPlayerState,
  VideoPlayerSubtitleSize,
  VideoPlayerTheme,
} from '@tepegoz/ext-video-player/types';
export type {
  VideoPlayerPageState,
  VideoPlayerSettings,
  VideoPlayerState,
  VideoPlayerSubtitleSize,
  VideoPlayerTheme,
};

// Agent Console conversation history is extension-owned and local-profile only. The ext-agent package
// owns zod-free public wire types; main-process validators live in its history-schemas subpath.
import type {
  AgentAttachmentMeta,
  AgentConversationDetail,
  AgentConversationListInput,
  AgentConversationOpenInput,
  AgentConversationSummary,
  AgentConversationTurn,
  AgentConversationsState,
} from '@tepegoz/ext-agent/history';
export type {
  AgentAttachmentMeta,
  AgentConversationDetail,
  AgentConversationListInput,
  AgentConversationOpenInput,
  AgentConversationSummary,
  AgentConversationTurn,
  AgentConversationsState,
};

// Clipboard operation types are owned by @tepegoz/clipboard. The desktop IPC contract only exposes
// zod-free wire types; runtime validators are re-exported from ./schemas for main-process use.
import type {
  ClipboardOperationInput,
  ClipboardReadTextInput,
  ClipboardWriteTextInput,
} from '@tepegoz/clipboard';
export type { ClipboardOperationInput, ClipboardReadTextInput, ClipboardWriteTextInput };

// Macro IR + wire DTOs are owned by @tepegoz/shared-types (zod-free `macro-ir` entry, so the sandboxed
// preload can import the types at runtime; the extension surfaces + agent capabilities share them too).
// The zod validators (MacroSchema) build from the same module.
import type {
  Macro,
  MacroRecordedStep,
  MacroRunDraftInput,
  MacroRunInput,
  MacroRunProgress,
  MacroSummary,
  Step,
} from '@tepegoz/shared-types/macro-ir';
export type {
  Macro,
  MacroRecordedStep,
  MacroRunDraftInput,
  MacroRunInput,
  MacroRunProgress,
  MacroSummary,
  Step,
};
