/**
 * Build-time constants stamped into the MAIN bundle by `electron.vite.config.ts` (`define`), mirroring
 * what `vite-env.d.ts` declares for the renderer. Declared as `string` and always read behind a
 * `typeof` guard (see `lib/app-info.ts`): a `vitest` run does not go through vite, so at test time
 * these identifiers do not exist at all.
 */
declare const __TEPEGOZ_BUILD_COMMIT__: string;
declare const __TEPEGOZ_BUILD_TIME__: string;
declare const __TEPEGOZ_BUILD_CHANNEL__: string;
/** Google Safe Browsing API key (ADR-0043). Empty string when unprovisioned — the service stays inert. */
declare const __TEPEGOZ_SAFE_BROWSING_KEY__: string;
