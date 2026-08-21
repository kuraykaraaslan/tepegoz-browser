import { shell } from 'electron';
import { z } from 'zod';
import { AppError, Logger } from '@tepegoz/libs';
import {
  AGENT_EFFORT_LEVELS,
  IpcChannels,
  PROVIDER_IDS,
  type AgentAutonomy,
  type AgentConfig,
  type AgentModelChoice,
  type Preferences,
  type TokenUsageSnapshot,
} from '@tepegoz/desktop-ipc';
import {
  AgentExportBundleSchema,
  AgentExportConversationSchema,
  AgentOpenFileSchema,
} from '@tepegoz/desktop-ipc/schemas';
import { ModelGateway, PROVIDER_MODEL_CATALOG } from '@tepegoz/model-gateway';
import { hotSwapRunProvider } from '@tepegoz/agent-runtime';
import { hasActiveAgentRun } from '../agent/agent-run-lock.electron';
import { collectAgentExportBundleFiles } from '../agent/export-bundle.electron';
import {
  isRunnableProvider,
  RUNNABLE_AI_PROVIDERS,
  SelectableAgentAutonomySchema,
  type AIProvider,
} from '@tepegoz/shared-types';
import CredentialVault from '@tepegoz/credential-vault';
import FileOperationsHost from '../file-operations/file-operations-host';
import PreferenceStore from '@tepegoz/preferences';
import { applyStrictGuard } from './strict-guard';
import { handle, handleAsync, onAction } from './ipc-helpers';
import { agentEnabled, requireAgentEnabled, tokenUsage } from './ipc-agent-shared';

/** The effective provider the NEXT run resolves to (mirrors `resolveProvider`, non-throwing for the
 *  panel's display). `local` availability is proxied by "a model is selected" here. */
function effectiveAgentProvider(
  prefs: Preferences,
  hasKey: (p: AIProvider) => boolean,
): AIProvider {
  const localAvailable = prefs.localProvider.selectedModelId !== '';
  const ov = prefs.agentProviderOverride;
  if (ov === 'local' && localAvailable) return 'local';
  if (ov !== null && ov !== 'local' && isRunnableProvider(ov) && hasKey(ov)) return ov;
  if (prefs.localProvider.mode === 'default' && localAvailable) return 'local';
  const top = CredentialVault.topProvider();
  return top !== null && isRunnableProvider(top) ? top : 'anthropic';
}

/** Display name per runnable cloud provider. Keyed off the runnable-provider union so wiring up a new
 *  provider forces a name here (and thus into the Agent panel's picker). */
const CLOUD_PROVIDER_NAMES = {
  anthropic: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini',
  kimi: 'Kimi',
} satisfies Record<(typeof RUNNABLE_AI_PROVIDERS)[number], string>;

/** Build the Agent panel's config: selectable providers (with a usable-now flag + default-key label) +
 *  the current choice + the autonomy level. Data-driven from the runnable-provider set + vault + prefs. */
function buildAgentConfig(): AgentConfig {
  const prefs = PreferenceStore.getAll();
  const status = CredentialVault.status();
  const hasKey = (p: AIProvider): boolean => status[p];
  const localModel = prefs.localProvider.selectedModelId;
  const modelsFor = (p: AIProvider): AgentModelChoice['models'] =>
    PROVIDER_MODEL_CATALOG[p].map((m) => ({ id: m.id, label: m.label }));
  const cloudChoices: AgentModelChoice[] = RUNNABLE_AI_PROVIDERS.map((p) => {
    const keyLabel = CredentialVault.listMetaByProvider(p)[0]?.label;
    return {
      provider: p,
      label: CLOUD_PROVIDER_NAMES[p],
      available: hasKey(p),
      models: modelsFor(p),
      ...(keyLabel !== undefined ? { keyLabel } : {}),
    };
  });
  const choices: AgentModelChoice[] = [
    ...cloudChoices,
    {
      provider: 'local',
      label: localModel !== '' ? `Local: ${localModel}` : 'Local',
      available: localModel !== '',
      // Local picks its model in Settings → Local models, not here.
      models: [],
    },
  ];
  const provider = effectiveAgentProvider(prefs, hasKey);
  return {
    provider,
    choices,
    // The model shown/used is the one pinned on the KEY this provider resolves to (Settings →
    // Providers pins it per key), not a per-provider preference.
    model: CredentialVault.modelForProvider(provider),
    autonomy: prefs.agentAutonomy,
    effort: prefs.agentEffort,
    strictGuard: prefs.agentStrictGuard,
  };
}

/** Register agent panel config (provider/model/autonomy/effort), token-usage, and export handlers. */
export function registerAgentConfigIpc(): void {
  // Apply the persisted posture at registration, not only on change: a preference that is read once at
  // startup and never applied is exactly how this setting became unreachable.
  applyStrictGuard();
  handle(IpcChannels.tokenUsageGet, (): TokenUsageSnapshot => tokenUsage());

  // Agent panel config: current provider + selectable choices + autonomy level, and setters.
  handle(IpcChannels.agentGetConfig, (): AgentConfig => buildAgentConfig());
  handle(IpcChannels.agentSetProvider, (_event, payload): void => {
    const provider = z.enum(PROVIDER_IDS).parse(payload);
    PreferenceStore.update({ agentProviderOverride: provider });
    // Instant mid-conversation switch: if a run is active, hot-swap its provider so the NEXT request
    // hits the new API. Uses the provider's pinned model if set, else its primary model. Safe no-op if
    // the provider isn't usable (no key) — the run simply stays on its current provider until next task.
    if (hasActiveAgentRun()) {
      const prefs = PreferenceStore.getAll();
      hotSwapRunProvider(provider, {
        effort: prefs.agentEffort,
        model: CredentialVault.modelForProvider(provider),
      });
    }
  });
  handle(IpcChannels.agentSetModel, (_event, payload): void => {
    const { provider, model } = z
      .object({ provider: z.enum(PROVIDER_IDS), model: z.string().max(64) })
      .parse(payload);
    // Same catalog gate as the Settings path: only an id the runtime can actually route to reaches the
    // vault ('' = auto). Two writers, one invariant.
    if (model !== '' && !PROVIDER_MODEL_CATALOG[provider].some((m) => m.id === model)) {
      throw new AppError(`Unknown model '${model}' for provider '${provider}'.`, 400);
    }
    // The pin lives on the KEY, so the Console's dropdown writes the SAME record Settings → Providers
    // edits: the provider's highest-priority key — the one a run resolves to. '' clears it (auto/tiered
    // routing). A provider with no stored key has nothing to pin (it cannot run either), so this is a
    // no-op there rather than a hidden preference that would silently outrank the key later.
    const topKey = CredentialVault.listMetaByProvider(provider)[0];
    if (topKey !== undefined) {
      CredentialVault.setKeyModel(topKey.id, model);
    }
    // Instant mid-run switch: if a run is active on THIS provider (its adapter is registered), push the
    // pin to the live gateway so the NEXT request uses it. A pin for a not-currently-running provider is
    // only persisted — it applies when that provider next resolves at run start (self-healing gateway).
    if (hasActiveAgentRun() && ModelGateway.isProviderRegistered(provider)) {
      ModelGateway.setModelOverride(model === '' ? null : { provider, model });
    }
  });
  handle(IpcChannels.agentSetAutonomy, (_event, payload): void => {
    // Only user-selectable levels cross this boundary — the reserved `dangerous` is rejected here, so
    // the renderer cannot set a level the UI does not offer. (Even if it did, `resolveAutonomy` treats
    // `dangerous` as `ask`; this is the outer of the two doors.)
    const level: AgentAutonomy = SelectableAgentAutonomySchema.parse(payload);
    PreferenceStore.update({ agentAutonomy: level });
  });
  handle(IpcChannels.agentSetEffort, (_event, payload): void => {
    const level = z.enum(AGENT_EFFORT_LEVELS).parse(payload);
    PreferenceStore.update({ agentEffort: level });
  });
  handle(IpcChannels.agentSetStrictGuard, (_event, payload): void => {
    const on = z.boolean().parse(payload);
    PreferenceStore.update({ agentStrictGuard: on });
    // Applied IMMEDIATELY as well as persisted: the guard is a process-global default read by every
    // config-less `sanitizeContent` boundary, so a toggle that only wrote a preference would take effect
    // at some unrelated later moment — which is how the setting became unreachable in the first place.
    applyStrictGuard();
  });
  // Write the current chat log to ~/tepegoz and reveal it in the OS file manager, so the user can grab
  // the full transcript to share. The transcript is rendered in the renderer (it owns the live
  // turns/events); this handler only derives a safe filename, then delegates the write to
  // FileOperationsHost — the SAME sandboxed file path the agent's tools use (no raw node:fs here).
  handleAsync(IpcChannels.agentExportConversation, async (_event, payload): Promise<string> => {
    requireAgentEnabled();
    const { content } = AgentExportConversationSchema.parse(payload);
    // e.g. ai_agent_log_2026-07-08_08-55-46.txt (local time, separator-free single segment).
    const now = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    const stamp =
      `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
      `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const filename = `ai_agent_log_${stamp}.txt`;
    const full = await FileOperationsHost.writeExport(filename, content);
    shell.showItemInFolder(full);
    return full;
  });

  // Write a full diagnostic bundle (chat + per-tab DOM/PNG snapshots + memory + journal + manifest) into a
  // fresh ~/tepegoz/ai_agent_export_<stamp>/ folder and reveal it. The renderer supplies the transcript +
  // group id; the collector gathers everything only the main process can reach (tab webContents, memory,
  // journal). Same fixed-destination + sandboxed-fs rationale as the plain chat-log export above.
  handleAsync(IpcChannels.agentExportBundle, async (_event, payload): Promise<string> => {
    requireAgentEnabled();
    const input = AgentExportBundleSchema.parse(payload);
    const now = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    const stamp =
      `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
      `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const dirName = `ai_agent_export_${stamp}`;
    const files = await collectAgentExportBundleFiles(input, now.getTime());
    const dir = await FileOperationsHost.writeExportBundle(dirName, files);
    shell.showItemInFolder(dir);
    return dir;
  });

  // Open a file the agent produced — gated to the whitelisted folders (403 → refused + logged, never
  // opens outside a grant). Fire-and-forget; the async open runs off the handler.
  onAction(IpcChannels.agentOpenFile, AgentOpenFileSchema, (path) => {
    if (!agentEnabled()) return;
    void (async () => {
      try {
        const real = await FileOperationsHost.assertOpenablePath(path);
        await shell.openPath(real);
      } catch (err) {
        Logger.warn('Refused to open agent file', { path, err: String(err) });
      }
    })();
  });
}
