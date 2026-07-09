import { app } from 'electron';
import type { z } from 'zod';
import { buildElementsSnapshot } from '@tepegoz/browser-tools';
import { EventJournal } from '@tepegoz/persistence';
import type { AgentExportBundleSchema } from '@tepegoz/desktop-ipc/schemas';
import TabManager from '../tabs';
import { getDb } from '../db/database.electron';
import { browserHost } from './browser-host.electron';
import AgentService from './agent-service.electron';
import { hasActiveAgentRun } from './agent-run-lock.electron';

/**
 * Collect the files for the agent **diagnostic bundle** (the header star) — the deep, analyse-later
 * snapshot of one agent session: the rendered chat transcript, each of the session-group's tabs as the
 * structured DOM the agent perceives (`buildDomTree`) + a PNG, the model-visible conversation memory, the
 * recent redacted Event Journal, and an environment/outcome manifest. Returns a flat file list for
 * {@link FileOperationsHost.writeExportBundle}; every per-tab capture is best-effort and records its
 * outcome in the manifest so a skipped tab is never a silent gap.
 *
 * Only the main process can reach a tab's `webContents`, so the gathering lives here (not the renderer,
 * which owns only the transcript). Sequential per tab: the render-DOM perception shares one
 * `webContents.debugger` attachment, so we never fan out — and we skip DOM perception entirely while an
 * agent run is live rather than steal the debugger from it (screenshots use `capturePage`, no debugger).
 */

const MAX_JOURNAL_EVENTS = 300;

/** The validated boundary payload (matches the renderer-facing `AgentBundleExportInput`), typed against
 *  the zod schema so the parsed handler value flows through without an exact-optional mismatch. */
type BundleInput = z.infer<typeof AgentExportBundleSchema>;

export interface BundleFile {
  relPath: string;
  content: string;
  encoding?: 'utf8' | 'base64';
}

interface TabCaptureOutcome {
  status: 'ok' | 'skipped';
  file?: string;
  jsonFile?: string;
  elementCount?: number;
  reason?: string;
}

interface TabManifestEntry {
  index: number;
  id: string;
  url: string;
  title: string;
  active: boolean;
  dom: TabCaptureOutcome;
  screenshot: TabCaptureOutcome;
}

function errText(err: unknown): string {
  if (err instanceof Error && err.message.length > 0) return err.message;
  return typeof err === 'string' && err.length > 0 ? err : 'unknown error';
}

/** Extract the raw base64 payload from a `data:image/png;base64,...` URL (null if absent/empty). */
function base64FromDataUrl(dataUrl: string): string | null {
  const marker = 'base64,';
  const i = dataUrl.indexOf(marker);
  if (i < 0) return null;
  const b64 = dataUrl.slice(i + marker.length);
  return b64.length > 0 ? b64 : null;
}

/** Best-effort capture of one tab's perceived DOM + PNG. Appends any produced files to `files` and
 *  returns the manifest outcome — a failed step is recorded as `skipped`, never a silent gap. DOM
 *  perception is skipped while a run is live so we don't steal the shared CDP debugger from it. */
async function captureTab(
  tab: { id: string; url: string; title: string },
  index: number,
  active: boolean,
  runActive: boolean,
  files: BundleFile[],
): Promise<TabManifestEntry> {
  const base = `tab-${String(index)}`;
  const entry: TabManifestEntry = {
    index,
    id: tab.id,
    url: tab.url,
    title: tab.title,
    active,
    dom: { status: 'skipped' },
    screenshot: { status: 'skipped' },
  };

  if (runActive) {
    entry.dom = { status: 'skipped', reason: 'agent run active (shared CDP debugger)' };
  } else {
    try {
      const snap = await browserHost.snapshotElements(tab.id);
      const shaped = buildElementsSnapshot(snap.elements, snap.url, snap.title);
      const mdFile = `tabs/${base}.md`;
      const jsonFile = `tabs/${base}.dom.json`;
      files.push(
        {
          relPath: mdFile,
          content:
            `# ${snap.title.length > 0 ? snap.title : '(untitled)'}\n\n` +
            `- URL: ${snap.url}\n- Elements: ${String(shaped.elements.length)}\n\n` +
            `${shaped.content}\n`,
        },
        {
          relPath: jsonFile,
          content: JSON.stringify(
            { url: snap.url, title: snap.title, elements: shaped.elements },
            null,
            2,
          ),
        },
      );
      entry.dom = { status: 'ok', file: mdFile, jsonFile, elementCount: shaped.elements.length };
    } catch (err) {
      entry.dom = { status: 'skipped', reason: errText(err) };
    }
  }

  // PNG screenshot (viewport). A background WebContentsView may capture empty — best-effort.
  try {
    const shot = await browserHost.captureScreenshot({ tabId: tab.id });
    const b64 = base64FromDataUrl(shot.dataUrl);
    if (b64 === null) throw new Error('empty screenshot');
    const pngFile = `tabs/${base}.png`;
    files.push({ relPath: pngFile, content: b64, encoding: 'base64' });
    entry.screenshot = { status: 'ok', file: pngFile };
  } catch (err) {
    entry.screenshot = { status: 'skipped', reason: errText(err) };
  }

  return entry;
}

export async function collectAgentExportBundleFiles(
  input: BundleInput,
  exportedAt: number,
): Promise<BundleFile[]> {
  const { chatContent, groupId, meta } = input;
  const files: BundleFile[] = [];

  // chat.md — the renderer-rendered transcript, verbatim (the renderer owns the live turns/events).
  files.push({ relPath: 'chat.md', content: chatContent });

  // Tabs in this agent session's group that have a drivable page (internal tepegoz:// tabs have no view).
  const state = TabManager.getState();
  const groupTabs = state.tabs.filter(
    (t) => t.groupId === groupId && TabManager.webContentsForTab(t.id) !== null,
  );
  const runActive = hasActiveAgentRun();
  const tabManifest: TabManifestEntry[] = [];
  let n = 0;
  for (const tab of groupTabs) {
    n += 1;
    // Sequential: the render-DOM perception shares one webContents.debugger attachment.
    tabManifest.push(await captureTab(tab, n, tab.id === state.activeId, runActive, files));
  }

  // Persistence-backed diagnostics degrade gracefully if the DB is closed (e.g. during shutdown).
  const db = getDb();

  // memory.json — the model-visible bounded history + the persisted conversation detail (if any).
  const memory = AgentService.conversationMemory(groupId);
  let conversation: unknown = null;
  try {
    conversation = db !== null ? AgentService.currentConversation(db, groupId) : null;
  } catch {
    conversation = null;
  }
  files.push({
    relPath: 'memory.json',
    content: JSON.stringify({ groupId, modelVisibleHistory: memory, conversation }, null, 2),
  });

  // journal.json — recent redacted Event Journal facts (diagnostics/audit/replay).
  let journal: unknown[] = [];
  try {
    journal = db !== null ? EventJournal.readRecent(db, MAX_JOURNAL_EVENTS) : [];
  } catch {
    journal = [];
  }
  files.push({ relPath: 'journal.json', content: JSON.stringify(journal, null, 2) });

  // manifest.json — environment + session diagnostics + per-tab capture outcomes (no silent gaps).
  const manifest = {
    exportedAt: new Date(exportedAt).toISOString(),
    app: { version: app.getVersion(), platform: process.platform, arch: process.arch },
    perceptionMode: process.env.TEPEGOZ_PERCEPTION === 'a11y' ? 'a11y' : 'render-dom',
    groupId,
    activeTabId: state.activeId,
    provider: meta?.provider ?? null,
    autonomy: meta?.autonomy ?? null,
    effort: meta?.effort ?? null,
    tokens: meta?.tokens ?? null,
    title: meta?.title ?? null,
    memoryMessages: memory.length,
    journalEvents: journal.length,
    tabs: tabManifest,
  };
  files.push({ relPath: 'manifest.json', content: JSON.stringify(manifest, null, 2) });

  return files;
}
