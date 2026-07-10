import { describe, it, expect } from 'vitest';
import { RunControlHandle } from './agent-run-lock.electron';

const noop = (): void => {};

describe('RunControlHandle', () => {
  it('waitWhileHeld resolves immediately when not held', async () => {
    const h = new RunControlHandle(noop);
    await h.waitWhileHeld(); // must not hang (vitest times out if it does)
    expect(h.isHeld()).toBe(false);
  });

  it('parks while paused-by-user and wakes on resume', async () => {
    const h = new RunControlHandle(noop);
    h.pause();
    expect(h.isHeld()).toBe(true);
    let resolved = false;
    const p = h.waitWhileHeld().then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false); // still parked while paused
    h.resume();
    await p;
    expect(resolved).toBe(true);
  });

  it('parks while offline and wakes on setOnline', async () => {
    const h = new RunControlHandle(noop);
    h.setOffline();
    let resolved = false;
    const p = h.waitWhileHeld().then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    h.setOnline();
    await p;
    expect(resolved).toBe(true);
  });

  it('abort wins over an active hold', async () => {
    const h = new RunControlHandle(noop);
    h.pause();
    const p = h.waitWhileHeld();
    h.abort(); // aborts despite still-paused
    await p; // resolves
    expect(h.aborted).toBe(true);
  });

  it('drainSteer returns then clears', () => {
    const h = new RunControlHandle(noop);
    h.steer('do X');
    h.steer('then Y');
    expect(h.drainSteer()).toEqual(['do X', 'then Y']);
    expect(h.drainSteer()).toEqual([]);
  });

  it('modelSignal fires on abort and on setOffline, but NOT on a user pause', () => {
    const hAbort = new RunControlHandle(noop);
    const sAbort = hAbort.modelSignal();
    expect(sAbort.aborted).toBe(false);
    hAbort.abort();
    expect(sAbort.aborted).toBe(true);

    const hOff = new RunControlHandle(noop);
    const sOff = hOff.modelSignal();
    hOff.setOffline();
    expect(sOff.aborted).toBe(true); // cancel a call stuck on a dead socket

    const hPause = new RunControlHandle(noop);
    const sPause = hPause.modelSignal();
    hPause.pause();
    expect(sPause.aborted).toBe(false); // a pause lets the in-flight call finish cheaply
  });

  it('modelSignal is pre-aborted when created already offline/aborted', () => {
    const h = new RunControlHandle(noop);
    h.setOffline();
    expect(h.modelSignal().aborted).toBe(true);
  });

  it('lost-wakeup stress: rapid pause→wait→resume bursts always terminate', async () => {
    const h = new RunControlHandle(noop);
    for (let i = 0; i < 100; i++) {
      h.pause();
      const p = h.waitWhileHeld();
      h.resume(); // notify races the just-started wait
      await p; // MUST terminate — a lost wakeup would hang here
      expect(h.isHeld()).toBe(false);
    }
  });

  it('enterOfflineHold pokes the offline hint and holds', () => {
    let hinted = 0;
    const h = new RunControlHandle(() => {
      hinted += 1;
    });
    h.enterOfflineHold();
    expect(hinted).toBe(1);
    expect(h.isHeld()).toBe(true);
  });

  it('enterHandoffHold parks the run until resume', async () => {
    const h = new RunControlHandle(noop);
    h.enterHandoffHold('re-read the page and continue');
    expect(h.isHeld()).toBe(true);
    let resolved = false;
    const p = h.waitWhileHeld().then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false); // parked until the user signs in and resumes
    h.resume();
    await p; // MUST terminate
    expect(resolved).toBe(true);
  });

  it('resume() releases a handoff hold and the queued guidance is available to drain', async () => {
    const h = new RunControlHandle(noop);
    h.enterHandoffHold('the user signed in — re-read and continue');
    const p = h.waitWhileHeld();
    h.resume(); // same button the user presses after logging in
    await p; // MUST terminate
    expect(h.isHeld()).toBe(false);
    expect(h.drainSteer()).toEqual(['the user signed in — re-read and continue']);
  });

  it('enterHandoffHold is idempotent (a re-detected wall does not re-queue guidance)', () => {
    const h = new RunControlHandle(noop);
    h.enterHandoffHold('guidance');
    h.enterHandoffHold('guidance'); // second detection on the same held page
    expect(h.drainSteer()).toEqual(['guidance']); // queued once, not twice
  });

  it('abort wins over a handoff hold', async () => {
    const h = new RunControlHandle(noop);
    h.enterHandoffHold('guidance');
    const p = h.waitWhileHeld();
    h.abort();
    await p; // resolves despite still being handoff-held
    expect(h.aborted).toBe(true);
  });
});
