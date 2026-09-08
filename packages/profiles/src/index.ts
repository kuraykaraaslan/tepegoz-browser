/**
 * `@tepegoz/profiles` — Chrome-style multi-profile registry domain model (ADR-0045). This barrel is
 * PURE (types + reducers, no Node/`fs`, no Electron) so renderer-side consumers like
 * `@tepegoz/profiles-ui` can import the model without pulling `@tepegoz/json-store` into the browser
 * bundle — mirroring how `@tepegoz/downloads` keeps its model pure. The Node-only persistence layer is
 * a separate subpath (`@tepegoz/profiles/store`, main process only), as are the zod validators
 * (`@tepegoz/profiles/schemas`).
 */
export * from './profiles-model';
export * from './profiles-registry';
