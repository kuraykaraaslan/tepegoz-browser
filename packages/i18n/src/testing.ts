/**
 * Shared i18n test helper. Each owner package's parity test imports `keyPaths` and asserts its `tr` key
 * set equals its `en` key set — the runtime belt-and-suspenders alongside `defineDict`'s compile-time
 * parity. Exported via `@tepegoz/i18n/testing`.
 */
export function keyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null
      ? keyPaths(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}
