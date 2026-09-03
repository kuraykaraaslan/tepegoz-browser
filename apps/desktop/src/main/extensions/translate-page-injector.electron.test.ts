import { beforeEach, describe, expect, it, vi } from 'vitest';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const bindingListener = vi.hoisted(() => vi.fn());
const makeBindingListener = vi.hoisted(() => vi.fn(() => bindingListener));
vi.mock('./translate-page-injector-binding.electron', () => ({
  BINDING: '__tepegozTranslatePost',
  MAX_PAGE_ITEMS: 260,
  MAX_ITEM_CHARS: 1600,
  makeBindingListener,
}));

function translatePageScript(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, 'translate-page-injector.electron.ts'), 'utf8');
  const match = /export const TRANSLATE_PAGE_SCRIPT = `([\s\S]*?)`;\r?\n\r?\nconst listeners/.exec(
    source,
  );
  if (match?.[1] === undefined) throw new Error('TRANSLATE_PAGE_SCRIPT not found');
  return match[1].replaceAll('${MAX_PAGE_ITEMS}', '260').replaceAll('${MAX_ITEM_CHARS}', '1600');
}

describe('translate page injector', () => {
  it('ships a syntactically valid injection script', () => {
    expect(() => new vm.Script(translatePageScript())).not.toThrow();
  });

  it('keeps restore and receive entry points available', () => {
    const script = translatePageScript();
    expect(script).toContain('__tepegozTranslateReceive');
    expect(script).toContain('__tepegozTranslateRestore');
  });
});

interface FakeWc {
  debugger: {
    isAttached: ReturnType<typeof vi.fn>;
    attach: ReturnType<typeof vi.fn>;
    sendCommand: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    removeListener: ReturnType<typeof vi.fn>;
  };
  executeJavaScript: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  isDestroyed: ReturnType<typeof vi.fn>;
}

function fakeWc(over: { attached?: boolean } = {}): FakeWc {
  return {
    debugger: {
      isAttached: vi.fn(() => over.attached ?? false),
      attach: vi.fn(),
      sendCommand: vi.fn(() => Promise.resolve()),
      on: vi.fn(),
      removeListener: vi.fn(),
    },
    executeJavaScript: vi.fn(() => Promise.resolve()),
    once: vi.fn(),
    isDestroyed: vi.fn(() => false),
  };
}

describe('inject / ensureBinding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    makeBindingListener.mockReturnValue(bindingListener);
  });

  it('attaches the debugger, enables Runtime, registers the binding + message listener, then runs the script', async () => {
    const { inject, TRANSLATE_PAGE_SCRIPT } = await import('./translate-page-injector.electron');
    const wc = fakeWc();
    await inject(wc as never);

    expect(wc.debugger.attach).toHaveBeenCalledWith('1.3');
    expect(wc.debugger.sendCommand).toHaveBeenCalledWith('Runtime.enable');
    expect(wc.debugger.sendCommand).toHaveBeenCalledWith('Runtime.addBinding', {
      name: '__tepegozTranslatePost',
    });
    expect(wc.debugger.on).toHaveBeenCalledWith('message', bindingListener);
    expect(wc.executeJavaScript).toHaveBeenCalledWith(TRANSLATE_PAGE_SCRIPT, true);
  });

  it('does not re-attach a debugger that is already attached', async () => {
    const { inject } = await import('./translate-page-injector.electron');
    const wc = fakeWc({ attached: true });
    await inject(wc as never);
    expect(wc.debugger.attach).not.toHaveBeenCalled();
  });

  it('registers the message listener only once per WebContents', async () => {
    const { inject } = await import('./translate-page-injector.electron');
    const wc = fakeWc();
    await inject(wc as never);
    await inject(wc as never);
    expect(makeBindingListener).toHaveBeenCalledTimes(1);
    expect(wc.debugger.on).toHaveBeenCalledTimes(1);
    // The idempotent Runtime setup still re-runs each call.
    expect(wc.executeJavaScript).toHaveBeenCalledTimes(2);
  });

  it('swallows an addBinding rejection — the page still gets the script', async () => {
    const { inject } = await import('./translate-page-injector.electron');
    const wc = fakeWc();
    wc.debugger.sendCommand.mockImplementation((method: string) =>
      method === 'Runtime.addBinding'
        ? Promise.reject(new Error('binding exists'))
        : Promise.resolve(),
    );
    await expect(inject(wc as never)).resolves.toBeUndefined();
    expect(wc.executeJavaScript).toHaveBeenCalled();
  });

  it('on destroy, removes the message listener while the wc is still alive and forgets it', async () => {
    const { inject } = await import('./translate-page-injector.electron');
    const wc = fakeWc();
    await inject(wc as never);
    const onDestroyed = wc.once.mock.calls.find((c) => c[0] === 'destroyed')?.[1] as () => void;

    wc.isDestroyed.mockReturnValue(false);
    onDestroyed();
    expect(wc.debugger.removeListener).toHaveBeenCalledWith('message', bindingListener);

    // Forgotten: a later inject re-registers.
    await inject(wc as never);
    expect(makeBindingListener).toHaveBeenCalledTimes(2);
  });

  it('on destroy, does NOT touch wc.debugger when the wc is already gone', async () => {
    const { inject } = await import('./translate-page-injector.electron');
    const wc = fakeWc();
    await inject(wc as never);
    const onDestroyed = wc.once.mock.calls.find((c) => c[0] === 'destroyed')?.[1] as () => void;

    wc.isDestroyed.mockReturnValue(true);
    onDestroyed();
    expect(wc.debugger.removeListener).not.toHaveBeenCalled();
  });
});
