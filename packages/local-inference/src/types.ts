import type { CanonMessage } from '@tepegoz/model-gateway';

/**
 * The native/userData-facing seam for on-device inference. The pure {@link LocalProvider} talks ONLY
 * to this interface; the concrete engine (node-llama-cpp) is implemented in the desktop app
 * (`apps/desktop/src/main/local-inference/llama-engine.electron.ts`) and injected in, exactly like
 * `CredentialVault` injects `SecretCrypto`. So this package stays Electron-free and unit-testable with
 * a fake engine, and `pnpm test` never loads a native binary.
 */

/** A loaded model kept warm in memory. Opaque handle owned by the engine (keyed by model id). */
export interface LocalModelHandle {
  readonly modelId: string;
  readonly ctxSize: number;
}

export interface GenerateOptions {
  maxTokens: number;
  signal: AbortSignal;
  /** GBNF grammar text — set when the caller demanded strict JSON (`responseFormat:'json'`). */
  grammar?: string;
  /** Sampling knobs; kept low/deterministic for agentic JSON decisions. */
  temperature?: number;
  topP?: number;
}

export interface GenerateResult {
  text: string;
  /** 'stop' = natural end-of-generation, 'length' = hit maxTokens, 'abort' = signal fired. */
  finish: 'stop' | 'length' | 'abort';
  /** Best-effort token counts (llama.cpp exposes these per session). */
  inputTokens: number;
  outputTokens: number;
}

export interface LlamaEngine {
  /** Ensure the model is loaded and warm; returns a reusable handle. Idempotent per model id. */
  load(modelId: string, modelPath: string, ctxSize: number): Promise<LocalModelHandle>;
  /** One-shot chat completion over the given turns (the adapter lifts the `system` turn internally). */
  generate(
    handle: LocalModelHandle,
    turns: readonly CanonMessage[],
    opts: GenerateOptions,
  ): Promise<GenerateResult>;
  /** Free a model (memory pressure / model switch). */
  unload(modelId: string): Promise<void>;
  /** True when a native backend (GPU or CPU) is available on this machine. */
  isAvailable(): boolean;
}

/** The currently-selected on-device model, resolved from prefs + install state by the app. */
export interface SelectedLocalModel {
  modelId: string;
  modelPath: string;
  ctxSize: number;
}

/** Injected into {@link LocalProvider}. `resolveModel` returns null when no model is installed/selected. */
export interface LocalProviderConfig {
  engine: LlamaEngine;
  resolveModel: () => SelectedLocalModel | null;
  /** Default sampling for agentic JSON (low temperature keeps decisions deterministic). */
  sampling?: { temperature?: number; topP?: number };
}
