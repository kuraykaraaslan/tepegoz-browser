/**
 * The `TepegozApi` surface bridged to `window.tepegoz` in the renderer (split out of `contract.ts`
 * per ADR-0010's 250-line file cap). Type-only imports throughout — including from `contract.ts`
 * itself — so this stays dependency-free for the sandboxed preload; a type-only circular import with
 * `contract.ts` is erased at compile time and carries no runtime cycle.
 *
 * The surface is grouped by domain into `api-<domain>.ts` slices (ADR-0010's file cap); this facade
 * composes them into one interface so `TepegozApi` stays the single public shape.
 */
import type { AppApi } from './api-app';
import type { TabsApi } from './api-tabs';
import type { AgentApi } from './api-agent';
import type { ExtensionsApi } from './api-extensions';
import type { UiApi } from './api-ui';
import type { LoginsApi } from './api-logins';

/** The exact surface bridged to `window.tepegoz` in the renderer. */
export interface TepegozApi
  extends AppApi,
    TabsApi,
    AgentApi,
    ExtensionsApi,
    UiApi,
    LoginsApi {
  readonly platform: string;
}
