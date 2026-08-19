/**
 * `@tepegoz/agent-eval` — the AI-1 real-result eval harness (dev-only, `private`, never shipped in the
 * app). The measurement backbone the AI competence track is scored against: a data-driven scenario
 * registry, a local fixture server, ground-truth scoring, and the metrics report. The Playwright driver
 * (`*.eval.ts`) launches the REAL app via `_electron` and drives each scenario through the real
 * BrowserHost + Policy plane; these pure modules are unit-tested without a browser.
 */
export * from './scenario-registry';
export * from './fixture-server';
export * from './scorer';
export * from './report';
export * from './judge';
export * from './calibration';
export * from './verification-metrics';
export * from './speed-targets';
export * from './bridge-claim';
