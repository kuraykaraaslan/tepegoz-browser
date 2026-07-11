/**
 * AI & Agent settings panels: providers/keys, on-device models, cost/local-actions, and MCP
 * connections. Split out of `SettingsPage.tsx` (ADR-0010 250-line cap), then further split by concern
 * into sibling `settings-ai-panels-*` modules (ADR-0010 250-line cap). This file re-exports the panels
 * so existing imports of `./settings-ai-panels` keep working unchanged.
 */

export { McpConnectionsSection } from './settings-ai-panels-mcp';
export { ProvidersSection } from './settings-ai-panels-providers';
export { DefaultModelsSection, LocalModelsSection } from './settings-ai-panels-models';
export { LocalActionsSection, TokenBudgetSection } from './settings-ai-panels-cost';
