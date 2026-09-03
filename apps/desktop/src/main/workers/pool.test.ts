import { describe, expect, it } from 'vitest';
import { WorkerPool } from './pool';

/**
 * `WorkerPool` — the Phase 1b skeleton. `initDeferred()` is a no-op until the utility-process workers
 * land; this pins that it is callable and side-effect-free so the startup path can wire it now.
 */
describe('WorkerPool', () => {
  it('initDeferred is a safe no-op, callable more than once', () => {
    expect(() => {
      WorkerPool.initDeferred();
      WorkerPool.initDeferred();
    }).not.toThrow();
  });
});
