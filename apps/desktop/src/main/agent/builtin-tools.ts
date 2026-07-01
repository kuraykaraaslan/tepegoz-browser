import { z } from 'zod';
import { AppError } from '@tepegoz/libs';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import type { ToolDescriptor } from '@tepegoz/shared-types';
import TabManager from '../tabs';
import { readActivePage } from './perception';

/**
 * Built-in browser/tab tools (L5). Each registers as a uniform ToolDescriptor + zod validator +
 * handler and is reached ONLY through the ToolGateway PEP (Policy Kernel + HITL). Tool names follow
 * `{domain}_{verb}_{noun}` with an approved verb; the argument shape is described in the description
 * text so the planner (which only sees id/dangerClass/description) can produce valid args.
 *
 * Read tools are 'read' (auto-allowed); navigation/tab-open mutate state ('state_changing' → HITL).
 */
let registered = false;

const NavigateArgs = z.object({ url: z.string().min(1).max(4096) });
const CreateTabArgs = z.object({ url: z.string().min(1).max(4096).optional() });
const NoArgs = z.object({}).strip();

function descriptor(
  id: string,
  dangerClass: ToolDescriptor['dangerClass'],
  description: string,
): ToolDescriptor {
  return { id, description, dangerClass, source: 'builtin', inputSchema: { type: 'object' }, requiresIdempotencyKey: false };
}

async function navigateAndWait(url: string): Promise<{ url: string; title: string }> {
  TabManager.navigateActive(url); // scheme allow-list enforced inside
  const wc = TabManager.activeWebContents();
  if (wc === null) throw new AppError('No active tab to navigate', 409);
  await new Promise<void>((resolve) => {
    const onDone = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      wc.removeListener('did-stop-loading', onDone);
      resolve();
    }, 15_000);
    wc.once('did-stop-loading', onDone);
  });
  // The tab may have been closed (webContents destroyed) during the up-to-15s wait — never call
  // methods on a destroyed WebContents (throws an opaque "Object has been destroyed").
  if (wc.isDestroyed()) throw new AppError('Active tab was closed during navigation', 409);
  return { url: wc.getURL(), title: wc.getTitle() };
}

/** Idempotent: register the built-in tools exactly once into the CapabilityRegistry. */
export function registerBuiltinTools(): void {
  if (registered) return;
  registered = true;

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_get_page',
      'read',
      'Read the visible text of the current page. args: {} — returns { url, title, content }.',
    ),
    inputSchema: NoArgs,
    handler: () => readActivePage(),
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_update_location',
      'state_changing',
      'Navigate the active tab to a web URL. args: { url: string } — returns { url, title }.',
    ),
    inputSchema: NavigateArgs,
    handler: (args) => navigateAndWait(args.url),
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'tab_list_items',
      'read',
      'List the open browser tabs. args: {} — returns an array of { id, title, url }.',
    ),
    inputSchema: NoArgs,
    handler: () =>
      TabManager.getState().tabs.map((t) => ({ id: t.id, title: t.title, url: t.url })),
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'tab_create_item',
      'state_changing',
      'Open a new browser tab, optionally at a URL. args: { url?: string } — returns { id }.',
    ),
    inputSchema: CreateTabArgs,
    handler: (args) => ({ id: TabManager.createTab(args.url) }),
  });
}

/** Test seam: allow re-registration after CapabilityRegistry.reset(). */
export function resetBuiltinToolsForTest(): void {
  registered = false;
}
