/**
 * Worker pool (SKELETON — Phase 1b). Heavy/CPU-bound work (vector embedding, FTS indexing, large DOM
 * snapshot parsing, Event Journal replay/projection) will run in Electron `utilityProcess` workers so
 * the main loop never blocks. Workers are spawned lazily AFTER `ready-to-show`, not at startup.
 *
 * Phase 1b will: build separate worker entry points (electron-vite), spawn via `utilityProcess.fork`,
 * and expose a typed request/response channel validated with zod (shared-types).
 */
export type WorkerKind = 'embedding' | 'fts-index' | 'journal-replay' | 'dom-parse';

export class WorkerPool {
  /** Lazily start the pool after the first window is shown. No-op until Phase 1b. */
  static initDeferred(): void {
    // TODO(Phase 1b): spawn utilityProcess workers on demand and route typed jobs to them.
  }
}
