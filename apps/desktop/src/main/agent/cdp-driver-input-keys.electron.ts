import type { WebContents } from 'electron';
import { parseChords, type ChordStep } from '@tepegoz/tool-executor';
import { Logger } from '@tepegoz/libs';
import type { HumanInputAdapter } from '@tepegoz/human-input';
import { KEY_MAP, type DriverCore, type KeySpec } from './cdp-driver-schemas.electron.js';

/**
 * Keyboard concern of the input driver (see `cdp-driver-input.electron`): chord parsing, per-key CDP
 * dispatch and the human-adapter branch. Unsupported keys are reported, never guessed at.
 */

/** Dispatch a keyDown+keyUp for one key, with optional modifier bitmask (CDP: 2 = Ctrl). */
async function sendKey(wc: WebContents, spec: KeySpec, modifiers = 0): Promise<void> {
  const common = {
    modifiers,
    key: spec.key,
    code: spec.code,
    windowsVirtualKeyCode: spec.keyCode,
    nativeVirtualKeyCode: spec.keyCode,
  };
  await wc.debugger.sendCommand('Input.dispatchKeyEvent', {
    type: spec.text === undefined ? 'rawKeyDown' : 'keyDown',
    ...common,
    ...(spec.text === undefined ? {} : { text: spec.text }),
  });
  await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
}

/**
 * Resolve one chord step to the CDP key fields, or null when this transport cannot express it.
 *
 * A single printable character is dispatchable directly — that is what makes `Ctrl+A` work without
 * every letter needing a table entry. Anything else must be a named key we know; a name we do not know
 * is reported, never guessed at.
 */
function specForStep(step: ChordStep): KeySpec | null {
  const named = KEY_MAP[step.key];
  if (named !== undefined) return named;
  if (step.key.length !== 1) return null;
  const upper = step.key.toUpperCase();
  const code = /[a-z]/i.test(step.key)
    ? `Key${upper}`
    : /[0-9]/.test(step.key)
      ? `Digit${step.key}`
      : '';
  if (code === '') return null;
  // With a modifier held the keystroke is a shortcut, not typing, so no `text` is sent — Ctrl+A must
  // select all, not insert the letter "a".
  const spec: KeySpec = { key: step.key, code, keyCode: upper.charCodeAt(0) };
  return step.modifiers === 0 ? { ...spec, text: step.key } : spec;
}

/**
 * Send a chord or a sequence of chords (S3 PR2).
 *
 * **An unsupported key is a reported no-op, not an error.** The old single-key path raised
 * `AppError(400)`, which ended the step on something the agent could nearly always work around if it
 * were simply told. Every step that CAN be sent is sent; the rest come back in `unsupported` so the
 * result is honest about what actually reached the page.
 */
export async function sendKeys(
  wc: WebContents,
  keys: string,
  adapter: HumanInputAdapter | undefined,
  core: DriverCore,
): Promise<{ sent: number; unsupported: string[] }> {
  await core.ensure(wc);
  const { steps, malformed } = parseChords(keys);
  const unsupported = [...malformed];
  let sent = 0;
  for (const step of steps) {
    const spec = specForStep(step);
    if (spec === null) {
      unsupported.push(step.key);
      continue;
    }
    if (adapter === undefined) {
      await sendKey(wc, spec, step.modifiers);
    } else {
      await adapter.idle(); // human think/react pause between behaviors
      await adapter.pressKey(spec, step.modifiers);
    }
    sent += 1;
  }
  // Settle once for the whole sequence: a chord is one intent, and settling between keystrokes would
  // make a two-key sequence pay two page-settle budgets.
  if (sent > 0) await core.settle(wc);
  if (unsupported.length > 0) {
    Logger.warn('[input] some keys could not be sent', { keys, unsupported });
  }
  return { sent, unsupported };
}

/** Single-key alias kept for the existing `press` action — now degrading like {@link sendKeys}. */
export async function pressKey(
  wc: WebContents,
  key: string,
  adapter: HumanInputAdapter | undefined,
  core: DriverCore,
): Promise<{ sent: number; unsupported: string[] }> {
  return sendKeys(wc, key, adapter, core);
}
