import type { BrowserHost } from './host';
import { registerReadTools } from './register-read-tools';
import { registerNavigationTools } from './register-navigation-tools';
import { registerUpdatePageTool } from './register-update-page';

/**
 * The agent's built-in **`browser_*` capabilities** — read the page, navigate a tab, snapshot
 * actionable elements, and perform one interaction (click/fill/press/scroll). Registered directly into
 * the single `CapabilityRegistry` behind the ToolGateway PEP as always-on `source: 'builtin'` tools
 * (the `@tepegoz/file-operations` pattern), bound to an injected {@link BrowserHost} so this package
 * stays Electron-free. Moved off the Agent extension (ADR-0021/0024 update): these are browser-domain
 * operations, not agent-owned, and no longer vanish when `com.tepegoz.agent` is disabled.
 */

/**
 * Registers the `browser_*` agent tools into the `CapabilityRegistry`, bound to `deps.host`. The tools are
 * grouped by responsibility into `register-*.ts` modules; the order below is the registration order.
 */
export function registerBrowserTools(deps: { host: BrowserHost }): void {
  const { host } = deps;
  registerReadTools(host);
  registerNavigationTools(host);
  registerUpdatePageTool(host);
}
