import { useEffect, useState } from 'react';
import { settingsDict, type SettingsStrings } from '@tepegoz/settings-ui';
import { Badge, Button, Card, Input, Toggle } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import { isNavigableWebUrl } from '@tepegoz/shared-types';
import { MCP_TRANSPORTS } from '@tepegoz/desktop-ipc';
import type {
  McpServerPref,
  McpServerState,
  McpServerStatusInfo,
  McpTransportId,
  Preferences,
} from '@tepegoz/desktop-ipc';
import { ConfirmAction } from './settings-confirm';
import { CrossLink, Select } from './settings-shared';

/**
 * MCP servers — add one, turn one off, remove one.
 *
 * Until now the only way to configure an MCP server was the raw JSON field on the unlisted Developer
 * page. The Connections page listed MCP adaptors and could not touch them, and the read-only status
 * component that existed for this job (`McpConnectionsSection`) was exported and never rendered by
 * anything. So the feature shipped with a management surface that was, in practice, a text editor for
 * a JSON blob.
 *
 * `env` is deliberately NOT editable here. MCP servers routinely take their credentials through the
 * environment, and `preferences.json` is plain text — offering a field for it would be inviting people
 * to put secrets somewhere this repo's own rules say secrets must never go. Editing a server that
 * already carries env PRESERVES it (the row says so), so nothing is silently dropped by using this
 * form on a server the Developer page created.
 */

const STATE_VARIANT: Record<McpServerState, 'success' | 'warning' | 'error' | 'neutral'> = {
  ready: 'success',
  connecting: 'warning',
  error: 'error',
  idle: 'neutral',
};

interface Draft {
  label: string;
  transport: McpTransportId;
  command: string;
  args: string;
  url: string;
}

const EMPTY_DRAFT: Draft = { label: '', transport: 'stdio', command: '', args: '', url: '' };

function draftFrom(server: McpServerPref): Draft {
  return {
    label: server.label,
    transport: server.transport,
    command: server.command ?? '',
    args: (server.args ?? []).join(' '),
    url: server.url ?? '',
  };
}

/** Whitespace-separated, which is how a command line is read. Empty ⇒ no args, not one empty arg. */
function parseArgs(value: string): string[] {
  return value.trim() === '' ? [] : value.trim().split(/\s+/);
}

/** Mirrors the schema's `superRefine`: stdio needs a command, http_sse needs a reachable URL. */
function draftError(draft: Draft, s: SettingsStrings): string | null {
  if (draft.label.trim() === '') return s.mcp.errorLabel;
  if (draft.transport === 'stdio' && draft.command.trim() === '') return s.mcp.errorCommand;
  if (draft.transport === 'http_sse' && !isNavigableWebUrl(draft.url.trim())) return s.mcp.errorUrl;
  return null;
}

export function McpServersSection({
  prefs,
  setPref,
}: {
  prefs: Preferences;
  setPref: (patch: Partial<Preferences>) => void;
}) {
  const s = useT(settingsDict);
  const [status, setStatus] = useState<McpServerStatusInfo[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Polled while the page is open: a server's state changes because a child process died or a remote
  // endpoint went away, neither of which this renderer would otherwise hear about.
  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void window.tepegoz.getMcpStatus().then(
        (list) => {
          if (alive) setStatus(list);
        },
        () => undefined,
      );
    };
    load();
    const id = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const error = draftError(draft, s);
  const editing = editingId === null ? null : prefs.mcpServers.find((m) => m.id === editingId);

  function buildServer(base: McpServerPref | null): McpServerPref {
    const shared = {
      // A server being edited keeps its id: the supervisor keys connections on it, and minting a new
      // one would silently drop and re-add the connection instead of updating it.
      id: base?.id ?? `mcp-${crypto.randomUUID()}`,
      label: draft.label.trim(),
      transport: draft.transport,
      enabled: base?.enabled ?? true,
      // Preserved, never surfaced — see the note at the top of this file.
      ...(base?.env === undefined ? {} : { env: base.env }),
    };
    return draft.transport === 'stdio'
      ? { ...shared, command: draft.command.trim(), args: parseArgs(draft.args) }
      : { ...shared, url: draft.url.trim() };
  }

  function submit(): void {
    if (error !== null) return;
    const next = buildServer(editing ?? null);
    setPref({
      mcpServers:
        editing === undefined || editing === null
          ? [...prefs.mcpServers, next]
          : prefs.mcpServers.map((m) => (m.id === next.id ? next : m)),
    });
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
  }

  function setEnabled(id: string, enabled: boolean): void {
    setPref({ mcpServers: prefs.mcpServers.map((m) => (m.id === id ? { ...m, enabled } : m)) });
  }

  function remove(id: string): void {
    setPref({ mcpServers: prefs.mcpServers.filter((m) => m.id !== id) });
    if (editingId === id) {
      setEditingId(null);
      setDraft(EMPTY_DRAFT);
    }
  }

  return (
    <Card title={s.mcp.title} subtitle={s.mcp.subtitle}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-44">
          <Input
            id="mcp-label"
            label={s.mcp.labelField}
            placeholder={s.mcp.labelPlaceholder}
            value={draft.label}
            onChange={(e) => {
              setDraft({ ...draft, label: e.target.value });
            }}
          />
        </div>
        <div className="w-36">
          <Select
            id="mcp-transport"
            label={s.mcp.transport}
            value={draft.transport}
            onChange={(v) => {
              setDraft({ ...draft, transport: v as McpTransportId });
            }}
          >
            {MCP_TRANSPORTS.map((t) => (
              <option key={t} value={t}>
                {s.mcp.transports[t]}
              </option>
            ))}
          </Select>
        </div>
        {draft.transport === 'stdio' ? (
          <>
            <div className="min-w-40 flex-1">
              <Input
                id="mcp-command"
                label={s.mcp.command}
                placeholder={s.mcp.commandPlaceholder}
                value={draft.command}
                onChange={(e) => {
                  setDraft({ ...draft, command: e.target.value });
                }}
              />
            </div>
            <div className="min-w-40 flex-1">
              <Input
                id="mcp-args"
                label={s.mcp.args}
                placeholder={s.mcp.argsPlaceholder}
                value={draft.args}
                onChange={(e) => {
                  setDraft({ ...draft, args: e.target.value });
                }}
              />
            </div>
          </>
        ) : (
          <div className="min-w-48 flex-1">
            <Input
              id="mcp-url"
              type="url"
              label={s.mcp.url}
              placeholder={s.mcp.urlPlaceholder}
              value={draft.url}
              onChange={(e) => {
                setDraft({ ...draft, url: e.target.value });
              }}
            />
          </div>
        )}
        <Button size="sm" className="mb-1 h-[38px]" disabled={error !== null} onClick={submit}>
          {editingId === null ? s.mcp.add : s.searchEngineSave}
        </Button>
        {editingId !== null && (
          <Button
            size="sm"
            variant="outline"
            className="mb-1 h-[38px]"
            onClick={() => {
              setEditingId(null);
              setDraft(EMPTY_DRAFT);
            }}
          >
            {s.cancel}
          </Button>
        )}
      </div>
      {error !== null && draft.label.trim() !== '' && (
        <p className="mt-1 text-xs text-error">{error}</p>
      )}

      {prefs.mcpServers.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">{s.mcp.empty}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {prefs.mcpServers.map((server) => {
            const live = status.find((x) => x.id === server.id);
            return (
              <li key={server.id} className="rounded-md border border-border px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{server.label}</span>
                  <Badge variant="neutral" size="sm">
                    {s.mcp.transports[server.transport]}
                  </Badge>
                  {live !== undefined && (
                    <Badge variant={STATE_VARIANT[live.state]} size="sm" dot>
                      {s.mcpStateLabels[live.state]}
                    </Badge>
                  )}
                  {live?.state === 'ready' && (
                    <span className="text-xs text-text-secondary">
                      {`${String(live.toolCount)} ${s.mcpToolsLabel}`}
                    </span>
                  )}
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <Toggle
                      id={`mcp-enabled-${server.id}`}
                      size="sm"
                      label={s.mcp.enabled}
                      checked={server.enabled}
                      onChange={(v) => {
                        setEnabled(server.id, v);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingId(server.id);
                        setDraft(draftFrom(server));
                      }}
                    >
                      {s.searchEngineEdit}
                    </Button>
                    <ConfirmAction
                      label={s.remove}
                      title={s.mcp.removeTitle}
                      body={s.mcp.removeBody.replace('{name}', server.label)}
                      confirmLabel={s.remove}
                      onConfirm={() => {
                        remove(server.id);
                      }}
                    />
                  </span>
                </div>
                <p className="mt-1 truncate font-mono text-xs text-text-secondary">
                  {server.transport === 'stdio'
                    ? [server.command ?? '', ...(server.args ?? [])].join(' ')
                    : (server.url ?? '')}
                </p>
                {server.env !== undefined && Object.keys(server.env).length > 0 && (
                  <p className="mt-1 text-xs text-text-secondary">
                    {s.mcp.envNote}{' '}
                    <CrossLink sectionId="developer">{s.mcp.envLink}</CrossLink>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
