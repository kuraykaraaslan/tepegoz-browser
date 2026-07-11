import { AppError } from '@tepegoz/libs';
import {
  AnthropicProvider,
  GeminiProvider,
  KimiProvider,
  ModelGateway,
  OpenAIProvider,
  PROVIDER_MODEL_CATALOG,
  type EffortLevel,
  type ModelProvider,
} from '@tepegoz/model-gateway';
import {
  isRunnableProvider,
  RUNNABLE_AI_PROVIDERS,
  type AIProvider,
} from '@tepegoz/shared-types';
import CredentialVault from '@tepegoz/credential-vault';
import { LocalProvider, type LocalProviderConfig } from '@tepegoz/local-inference';
import type { AgentRunDeps } from './agent-runtime-types';

/**
 * Resolve which provider serves the run, in priority order: (1) an explicit per-run override from the
 * Agent panel, when usable; (2) whole-agent-local (`mode:'default'`) when a model is available; (3) the
 * highest-priority stored key whose provider has an adapter. Throws {@link AppError} when none is usable.
 */
function resolveProvider(
  override: AIProvider | null,
  mode: 'off' | 'simple' | 'default',
  localAvailable: boolean,
): { provider: AIProvider; apiKey: string } {
  // 1) Explicit per-run override — honored ONLY when actually usable (local needs a model; a cloud
  //    provider needs a stored key). An unusable override is ignored and we fall through.
  if (override === 'local' && localAvailable) {
    return { provider: 'local', apiKey: '' };
  }
  if (override !== null && override !== 'local' && isRunnableProvider(override)) {
    const overrideKey = CredentialVault.getFirstKeyForProvider(override);
    if (overrideKey !== null) return { provider: override, apiKey: overrideKey };
  }
  // 2) Whole-agent-local.
  if (mode === 'default' && localAvailable) {
    return { provider: 'local', apiKey: '' };
  }
  const storedKeys = CredentialVault.listMeta();
  const runnable = storedKeys.find((m) => isRunnableProvider(m.provider));
  if (runnable === undefined) {
    if (storedKeys.length === 0) {
      throw new AppError('No API key configured. Add one in Settings → Providers.', 401);
    }
    throw new AppError(
      `No usable API key: this build can run ${RUNNABLE_AI_PROVIDERS.join(', ')}. ` +
        `Add a key for one of these in Settings → Providers.`,
      501,
    );
  }
  // The raw key stays in main (getFirstKeyForProvider is main-only), never on IPC.
  const apiKey = CredentialVault.getFirstKeyForProvider(runnable.provider);
  if (apiKey === null) {
    throw new AppError('No API key configured. Add one in Settings → Providers.', 401);
  }
  return { provider: runnable.provider, apiKey };
}

/**
 * Build the model-provider adapter for a resolved provider id. `effort` is applied only by the
 * Anthropic adapter (its `output_config.effort`); the OpenAI tier models are plain chat models that
 * take no effort field, so it is ignored there (see {@link OpenAIProvider}).
 */
function providerFor(
  provider: AIProvider,
  apiKey: string,
  effort: EffortLevel,
  localConfig: LocalProviderConfig | undefined,
): ModelProvider {
  if (provider === 'local') {
    if (localConfig === undefined) {
      throw new AppError('On-device inference is not available on this machine.', 503);
    }
    return new LocalProvider(localConfig);
  }
  if (provider === 'openai') {
    return new OpenAIProvider({ apiKey });
  }
  if (provider === 'gemini') {
    return new GeminiProvider({ apiKey });
  }
  if (provider === 'kimi') {
    return new KimiProvider({ apiKey });
  }
  return new AnthropicProvider({ apiKey, effort });
}

/**
 * Register the model provider(s) for this run and return the resolved provider id (which drives the
 * ModelRouter's per-capability model choice). The eval/test seam takes priority: an injected provider
 * bypasses the vault entirely and is registered as-is. Otherwise resolve from the vault/prefs (per-run
 * override → whole-agent-local → highest-priority key), build the adapter, and also register the
 * on-device provider when available so a `local` capability offload resolves alongside a cloud run.
 */
export function registerRunProvider(
  deps: AgentRunDeps,
  prefs: { agentProviderOverride: AIProvider | null; localProvider: { mode: 'off' | 'simple' | 'default' } },
  localAvailable: boolean,
  effort: EffortLevel,
): AIProvider {
  if (deps.provider !== undefined) {
    ModelGateway.register(deps.provider.instance);
    return deps.provider.id;
  }
  const resolved = resolveProvider(prefs.agentProviderOverride, prefs.localProvider.mode, localAvailable);
  ModelGateway.register(providerFor(resolved.provider, resolved.apiKey, effort, deps.localInference));
  if (resolved.provider !== 'local' && localAvailable && deps.localInference !== undefined) {
    ModelGateway.register(new LocalProvider(deps.localInference));
  }
  return resolved.provider;
}

/**
 * Live provider hot-swap for the ACTIVE run (Agent panel provider dropdown, mid-conversation). Resolves
 * the key, builds + registers the new adapter, and pins the gateway to {provider, model} so the NEXT
 * request routes to the new provider's API. SAFE by construction: on any failure (no key, unusable
 * provider) it returns `false` and leaves the run untouched on its current provider — it can only ADD a
 * registration + set the self-healing pin, never tear down the running provider. `model` empty → the
 * provider's primary catalog model (single-model "everything", consistent with the Model pin). `local`
 * is not hot-swappable here (it needs engine + on-device model wiring) — it applies at the next run.
 */
export function hotSwapRunProvider(
  provider: AIProvider,
  opts: { effort: EffortLevel; model: string },
): boolean {
  if (provider === 'local' || !isRunnableProvider(provider)) return false;
  const apiKey = CredentialVault.getFirstKeyForProvider(provider);
  if (apiKey === null) return false;
  ModelGateway.register(providerFor(provider, apiKey, opts.effort, undefined));
  const model = opts.model.length > 0 ? opts.model : (PROVIDER_MODEL_CATALOG[provider][0]?.id ?? '');
  if (model.length === 0) return false;
  ModelGateway.setModelOverride({ provider, model });
  return true;
}
