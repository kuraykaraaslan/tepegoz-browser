import { z } from 'zod';
import { PolicyDecisionEnum } from '@tepegoz/shared-types';

/**
 * Centralized env (internal-ai-rules: libs/env). Parsed ONCE at import time; a missing REQUIRED
 * var would crash at startup. All vars are currently optional/defaulted because BYO API keys are
 * NOT env vars — they live in the OS keychain via safeStorage. Service code must never read
 * process.env directly; it imports `env` from here.
 */
const EnvSchema = z.object({
  SQLITE_PATH: z.string().min(1).optional(),
  MCP_DEFAULT_PORT: z.coerce.number().int().positive().optional(),
  POLICY_DEFAULT_DECISION: PolicyDecisionEnum.default('ask'),
  TEPEGOZ_PROXY_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
