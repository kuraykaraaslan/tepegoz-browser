/**
 * The minimal shape of a spawned child process this package needs — narrow enough that a test can
 * inject a fake without touching `node:child_process`, the same injection convention `ChatTransport`
 * uses for a socket (`chat-transport-node`) and `McpConnection` uses for the MCP SDK `Client`.
 */
export interface ChildProcessLike {
  readonly stdin: { write(chunk: string): void } | null;
  readonly stdout: { on(event: 'data', cb: (chunk: Buffer | string) => void): void } | null;
  readonly stderr: { on(event: 'data', cb: (chunk: Buffer | string) => void): void } | null;
  on(event: 'exit', cb: (code: number | null, signal: NodeJS.Signals | null) => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  kill(signal?: NodeJS.Signals): void;
}

/** Spawns the child — the real implementation wraps `node:child_process`'s `spawn`; a test supplies
 *  a fake that never touches the OS. */
export type SpawnFn = (
  command: string,
  args: readonly string[],
  env: Record<string, string>,
  cwd: string | undefined,
) => ChildProcessLike;
