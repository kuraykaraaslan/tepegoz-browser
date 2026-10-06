/**
 * Agent run/config/export/skills channels and on-device model management. Part of `IpcChannels` (see `channels.ts`); dependency-free
 * because the SANDBOXED preload imports it.
 */
export const ipcChannelsAgent = {
  agentRun: 'agent:run',
  agentCancel: 'agent:cancel',
  /** Renderer→main: hold/resume a running agent between steps (not cancel). */
  agentPause: 'agent:pause',
  agentResume: 'agent:resume',
  /** Renderer→main: inject a steering message into a RUNNING agent (folds into the current run). */
  agentSteer: 'agent:steer',
  /** Renderer→main: reset conversation memory for a specific group (panel "New task"). */
  agentNewConversation: 'agent:new-conversation',
  /** Renderer→main: ensure the active tab belongs to a group; creates one if needed → { groupId }. */
  agentEnsureGroup: 'agent:ensure-group',
  /** Main→renderer push: active tab's group changed (groupId | null). */
  agentGroupChanged: 'agent:group-changed',
  /** Renderer→main: capture the page's current text selection → string. */
  agentCaptureSelection: 'agent:capture-selection',
  /** Renderer→main: the active tab's committed URL (seed a task's target page) → string | null. */
  agentActiveTabUrl: 'agent:active-tab-url',
  /** Renderer→main: open a native file picker and read selected files → AgentFileAttachment[]. */
  agentPickFiles: 'agent:pick-files',
  agentEvent: 'agent:event',
  /** Tab-group ids currently holding an agent run lock (S8 PR7) — drives the per-tab "agent is working
   *  here" indicator. `agent:active-groups-get` is the snapshot a just-mounted window pulls once;
   *  `agent:active-groups` is a main→renderer push on every run start/stop, never polled. */
  agentActiveGroupsGet: 'agent:active-groups-get',
  agentActiveGroups: 'agent:active-groups',
  /** Main→renderer: an UNSETTLED model-output fragment while a step runs. Ephemeral, never journaled. */
  agentDelta: 'agent:delta',
  agentApprovalRequest: 'agent:approval-request',
  agentApprovalResponse: 'agent:approval-response',
  agentPlanPreview: 'agent:plan-preview',
  agentPlanResponse: 'agent:plan-response',
  tokenUsage: 'token:usage',
  tokenUsageGet: 'token:usage-get',
  // Agent panel config: current provider + choices + autonomy level, and setters for each.
  agentGetConfig: 'agent:get-config',
  /** Renderer→main: select the run target by stored-key id (Agent panel picker), or 'local'. */
  agentSelectChoice: 'agent:select-choice',
  /** Renderer→main: pin a specific model for a provider (Agent panel Model dropdown); '' clears it. */
  agentSetModel: 'agent:set-model',
  agentSetAutonomy: 'agent:set-autonomy',
  /** Renderer→main: set the per-run reasoning-effort preset (Agent panel effort dropdown). */
  agentSetEffort: 'agent:set-effort',
  /** Renderer→main: toggle the hardened inbound guard (S6 PR5). Main is the only place it takes effect. */
  agentSetStrictGuard: 'agent:set-strict-guard',
  /** Renderer→main: open a file the agent produced (fire-and-forget; gated to whitelisted folders). */
  agentOpenFile: 'agent:open-file',
  /** Renderer→main: write the current chat log to the ~/tepegoz folder and reveal it → absolute path. */
  agentExportConversation: 'agent:export-conversation',
  /** Renderer→main: write a full diagnostic bundle (chat + per-tab DOM/PNG snapshots + memory + journal +
   *  manifest) into a `~/tepegoz/ai_agent_export_<stamp>/` folder and reveal it → absolute folder path. */
  agentExportBundle: 'agent:export-bundle',
  /** Renderer→main: the unsigned, human-readable Run Report for ONE run (Phase 7 NotaryService —
   *  "shippable before the wiring"). Main reads that run's Journal events + token totals, renders the
   *  Markdown, writes it to `~/tepegoz/` and reveals it → absolute file path. */
  agentExportRunReport: 'agent:export-run-report',
  /** Renderer→main: a signed Replay Receipt for ONE run (Phase 7 NotaryService DoD). Main re-verifies
   *  the run's stored hash chain, signs a fresh self-contained receipt with the device key, writes it to
   *  `~/tepegoz/` and reveals it → absolute file path. Refuses (409) for a run with no events, one that
   *  predates chaining, or a chain that fails integrity verification. */
  agentExportRunReceipt: 'agent:export-run-receipt',
  // Agent extension conversation history. The product surface is the ext-agent page, not a core page.
  agentConversationsList: 'agent-conversations:list',
  agentConversationsGet: 'agent-conversations:get',
  agentConversationsCurrent: 'agent-conversations:current',
  agentConversationsOpen: 'agent-conversations:open',
  agentConversationsDelete: 'agent-conversations:delete',
  agentConversationsClear: 'agent-conversations:clear',
  agentConversationsState: 'agent-conversations:state',
  // Skills library (S9): named prompt templates. Selecting one PRE-FILLS the composer; it never starts
  // a run, so the human keeps the send gesture that authorises the task.
  /** Renderer→main: park the chrome window off-screen and keep the run going (S8). NOT window.hide():
   *  that pauses the compositor and blinds the agent. Same parking the tray uses. */
  agentContinueInBackground: 'agent:continue-in-background',
  agentSkillsList: 'agent-skills:list',
  agentSkillsSave: 'agent-skills:save',
  agentSkillsDelete: 'agent-skills:delete',
  // On-device model management (Settings → Providers → Local). `models:state` is a main→renderer push.
  modelsList: 'models:list',
  modelsDownload: 'models:download',
  modelsCancel: 'models:cancel',
  modelsSelect: 'models:select',
  modelsDelete: 'models:delete',
  modelsState: 'models:state',
} as const;
