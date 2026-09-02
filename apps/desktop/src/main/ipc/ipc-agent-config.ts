import { shell } from 'electron';
import { z } from 'zod';
import { AppError, Logger } from '@tepegoz/libs';
import {
  AGENT_EFFORT_LEVELS,
  IpcChannels,
  LOCAL_CHOICE_ID,
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
  AI_PROVIDERS,
  isRunnableProvider,
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

/** Display name per provider. Keyed off the whole provider union so wiring up a new provider forces a
 *  name here (and thus into the Agent panel's picker, where every stored key shows its provider). */
const PROVIDER_NAMES = {
  anthropic: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini',
  kimi: 'Kimi',
  nova: 'Amazon Nova',
  deepseek: 'DeepSeek',
  xai: 'xAI Grok',
  groq: 'Groq',
  local: 'On-device',
} satisfies Record<AIProvider, string>;

/** Shown for the on-device entry when no model has been downloaded/selected yet (it is then disabled). */
const NO_LOCAL_MODEL_LABEL = 'No model selected';

/**
 * Build the Agent panel's config. The picker lists the KEYS stored under Settings → Providers & API
 * keys — one entry per key, in the vault's priority order — plus the on-device entry. It does NOT list
 * providers: a provider with no key is not a run target the user can choose, and a provider with two
 * keys is two different bills. Data-driven from the vault + prefs; nothing about the picker is hardcoded
 * beyond the display names above.
 */
function buildAgentConfig(): AgentConfig {
  const prefs = PreferenceStore.getAll();
  const status = CredentialVault.status();
  const hasKey = (p: AIProvider): boolean => status[p];
  const localModel = prefs.localProvider.selectedModelId;
  const keyChoices: AgentModelChoice[] = CredentialVault.listMeta().map((k) => ({
    id: k.id,
    provider: k.provider,
    label: k.label,
    providerLabel: PROVIDER_NAMES[k.provider],
    // A stored key for a provider the runtime cannot drive yet is shown but not selectable — hiding it
    // would make the user's own Settings row look lost.
    available: isRunnableProvider(k.provider),
    ...(k.last4 !== '' ? { last4: k.last4 } : {}),
  }));
  const choices: AgentModelChoice[] = [
    ...keyChoices,
    {
      id: LOCAL_CHOICE_ID,
      provider: 'local',
      label: localModel !== '' ? localModel : NO_LOCAL_MODEL_LABEL,
      providerLabel: PROVIDER_NAMES.local,
      available: localModel !== '',
    },
  ];
  const models = Object.fromEntries(
    AI_PROVIDERS.map((p) => [
      p,
      PROVIDER_MODEL_CATALOG[p].map((m) => ({ id: m.id, label: m.label })),
    ]),
  ) as AgentConfig['models'];
  const provider = effectiveAgentProvider(prefs, hasKey);
  // Which ENTRY the next run resolves to: for a cloud provider that is its highest-priority key — the
  // same record `getFirstKeyForProvider` decrypts at run start, so the panel shows the key that pays.
  const selectedId =
    provider === 'local'
      ? LOCAL_CHOICE_ID
      : (CredentialVault.listMetaByProvider(provider)[0]?.id ?? '');
  return {
    provider,
    selectedId,
    choices,
    models,
    // The model shown/used is the one pinned on that KEY (Settings → Providers pins it per key), not a
    // per-provider preference.
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
  // Select the run target BY KEY (the panel lists stored keys, not providers). Two writes, one
  // invariant: the vault's ORDER already decides which key a provider runs on, so selecting a key
  // promotes it to the front — it becomes both its provider's active key and the overall default, the
  // same record Settings → Providers marks "Default". No second, competing key-selection preference.
  handle(IpcChannels.agentSelectChoice, (_event, payload): void => {
    const id = z.string().min(1).max(128).parse(payload);
    const prefs = PreferenceStore.getAll();
    if (id === LOCAL_CHOICE_ID) {
      // On-device has no key to promote, and no hot-swap either (it needs engine + model wiring), so it
      // applies from the next run — the same rule `hotSwapRunProvider` documents.
      PreferenceStore.update({ agentProviderOverride: 'local' });
      return;
    }
    const metas = CredentialVault.listMeta();
    const meta = metas.find((k) => k.id === id);
    if (meta === undefined) {
      throw new AppError(`No stored key with id '${id}'.`, 404);
    }
    CredentialVault.reorderKeys([id, ...metas.map((k) => k.id).filter((x) => x !== id)]);
    PreferenceStore.update({ agentProviderOverride: meta.provider });
    // Instant mid-conversation switch: if a run is active, hot-swap so the NEXT request hits the newly
    // selected key's API — including a switch BETWEEN two keys of one provider, because the promotion
    // above happens first and the swap re-reads the provider's top key. Uses that key's pinned model if
    // set, else the provider's primary. Safe no-op for a provider the runtime cannot drive: the run
    // stays where it is until the next task.
    if (hasActiveAgentRun()) {
      hotSwapRunProvider(meta.provider, { effort: prefs.agentEffort, model: meta.model });
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
