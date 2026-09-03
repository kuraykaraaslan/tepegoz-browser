import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `healSelector` — the ONE scoped model call M2 replay makes after a deterministic `SelectorChain`
 * fails. Determinism-first: the page script authors a unique CSS path for every candidate itself, the
 * model only picks an index. Pinned: every decline path returns `null` (no active tab, no provider
 * key, the page script throws, no / malformed candidates, the model call throws, a null or
 * out-of-range pick), and the one success path returns `{ kind: 'css', value: <that candidate's
 * path> }`.
 */

const wc = vi.hoisted(() => ({
  executeJavaScript: vi.fn(),
  getURL: () => 'https://shop.test/cart',
}));
const tab = vi.hoisted((): { active: unknown } => ({ active: wc }));
vi.mock('../tabs', () => ({ default: { activeWebContents: () => tab.active } }));

const gateway = vi.hoisted(() => ({ register: vi.fn(), complete: vi.fn() }));
vi.mock('@tepegoz/model-gateway', () => ({
  ModelGateway: gateway,
  resolveProviderBaseURL: () => 'https://api.test/v1',
  AnthropicProvider: class {},
  OpenAIProvider: class {},
  GeminiProvider: class {},
  KimiProvider: class {},
  NovaProvider: class {},
  DeepSeekProvider: class {},
  XaiProvider: class {},
  GroqProvider: class {},
  ANTHROPIC_MODEL: { classify: 'claude-classify' },
  OPENAI_MODEL: { classify: 'gpt-classify' },
  GEMINI_MODEL: { classify: 'gemini-classify' },
  KIMI_MODEL: { classify: 'kimi-classify' },
  NOVA_MODEL: { classify: 'nova-classify' },
  DEEPSEEK_MODEL: { classify: 'deepseek-classify' },
  XAI_MODEL: { classify: 'xai-classify' },
  GROQ_MODEL: { classify: 'groq-classify' },
}));

const selectorSchema = vi.hoisted(() => ({
  safeParse: vi.fn((v: unknown) => ({ success: true, data: v })),
}));
vi.mock('@tepegoz/shared-types', () => ({
  isRunnableProvider: () => true,
  SelectorSchema: selectorSchema,
}));

vi.mock('@tepegoz/tool-executor', () => ({
  finalizeElements: (raw: unknown[]) => ({ elements: raw }),
  wrapUntrustedContent: (s: string) => `<<${s}>>`,
}));

const vault = vi.hoisted(() => ({
  listMeta: vi.fn((): { provider: string; region?: string }[] => [{ provider: 'anthropic' }]),
  getFirstKeyForProvider: vi.fn((): string | null => 'sk-test'),
}));
vi.mock('@tepegoz/credential-vault', () => ({ default: vault }));

const { healSelector } = await import('./macro-selector-healer.electron');

const CHAIN = [
  { kind: 'css', value: '#buy-now' },
  { kind: 'text', attr: 'aria-label', value: 'Buy now' },
] as never;

/** Two well-formed page candidates as the injected script would emit them (a JSON string). */
const CANDIDATES = JSON.stringify([
  { tag: 'button', role: 'button', name: 'Add to cart', attributes: { name: 'add' }, path: '#add' },
  {
    tag: 'button',
    role: 'button',
    name: 'Buy it now',
    attributes: { 'data-testid': 'buy' },
    path: 'main > button:nth-of-type(2)',
  },
]);

beforeEach(() => {
  tab.active = wc;
  wc.executeJavaScript.mockReset().mockResolvedValue(CANDIDATES);
  gateway.register.mockReset();
  gateway.complete.mockReset().mockResolvedValue({ text: '{"index": 1}' });
  vault.listMeta.mockReset().mockReturnValue([{ provider: 'anthropic' }]);
  vault.getFirstKeyForProvider.mockReset().mockReturnValue('sk-test');
  selectorSchema.safeParse
    .mockReset()
    .mockImplementation((v: unknown) => ({ success: true, data: v }));
});

describe('decline paths → null', () => {
  it('no active web contents', async () => {
    tab.active = null;
    expect(await healSelector(CHAIN)).toBeNull();
  });

  it('no runnable provider key registered', async () => {
    vault.listMeta.mockReturnValue([]);
    expect(await healSelector(CHAIN)).toBeNull();
    expect(gateway.complete).not.toHaveBeenCalled();
  });

  it('a meta entry with no retrievable key', async () => {
    vault.getFirstKeyForProvider.mockReturnValue(null);
    expect(await healSelector(CHAIN)).toBeNull();
  });

  it('the page candidate script throws', async () => {
    wc.executeJavaScript.mockRejectedValue(new Error('detached'));
    expect(await healSelector(CHAIN)).toBeNull();
    expect(gateway.complete).not.toHaveBeenCalled();
  });

  it('the page returns no candidates', async () => {
    wc.executeJavaScript.mockResolvedValue('[]');
    expect(await healSelector(CHAIN)).toBeNull();
  });

  it('the page returns malformed candidates', async () => {
    wc.executeJavaScript.mockResolvedValue('[{"tag":"button"}]');
    expect(await healSelector(CHAIN)).toBeNull();
  });

  it('the model call throws', async () => {
    gateway.complete.mockRejectedValue(new Error('timeout'));
    expect(await healSelector(CHAIN)).toBeNull();
  });

  it('the model declines with a null index', async () => {
    gateway.complete.mockResolvedValue({ text: '{"index": null}' });
    expect(await healSelector(CHAIN)).toBeNull();
  });

  it('the model returns an unparseable body', async () => {
    gateway.complete.mockResolvedValue({ text: 'no json here' });
    expect(await healSelector(CHAIN)).toBeNull();
  });

  it('the model picks an out-of-range index', async () => {
    gateway.complete.mockResolvedValue({ text: '{"index": 9}' });
    expect(await healSelector(CHAIN)).toBeNull();
  });
});

describe('success path', () => {
  it("returns a css Selector carrying the picked candidate's own unique path", async () => {
    const healed = await healSelector(CHAIN);
    expect(healed).toEqual({ kind: 'css', value: 'main > button:nth-of-type(2)' });
  });

  it('registers a provider and sends the original selector + wrapped candidate listing', async () => {
    await healSelector(CHAIN);
    expect(gateway.register).toHaveBeenCalledTimes(1);
    const req = gateway.complete.mock.calls[0]![0] as {
      provider: string;
      model: string;
      messages: { role: string; content: string }[];
    };
    expect(req.provider).toBe('anthropic');
    expect(req.model).toBe('claude-classify');
    const userMsg = req.messages.find((m) => m.role === 'user')!.content;
    expect(userMsg).toContain('css="#buy-now"');
    expect(userMsg).toContain('OR');
    expect(userMsg).toContain('<<');
    expect(userMsg).toContain('Buy it now');
  });

  it('reads a fenced ```json code block from the model', async () => {
    gateway.complete.mockResolvedValue({ text: '```json\n{"index": 0}\n```' });
    expect(await healSelector(CHAIN)).toEqual({ kind: 'css', value: '#add' });
  });

  it('routes provider-specific model ids (openai → classify)', async () => {
    vault.listMeta.mockReturnValue([{ provider: 'openai' }]);
    await healSelector(CHAIN);
    const req = gateway.complete.mock.calls[0]![0] as { provider: string; model: string };
    expect(req.provider).toBe('openai');
    expect(req.model).toBe('gpt-classify');
  });

  it.each([
    ['gemini', 'gemini-classify'],
    ['kimi', 'kimi-classify'],
    ['nova', 'nova-classify'],
    ['deepseek', 'deepseek-classify'],
    ['xai', 'xai-classify'],
    ['groq', 'groq-classify'],
  ])('registers and routes the %s provider', async (provider, model) => {
    vault.listMeta.mockReturnValue([{ provider, region: 'us' }]);
    await healSelector(CHAIN);
    expect(gateway.register).toHaveBeenCalledTimes(1);
    const req = gateway.complete.mock.calls[0]![0] as { provider: string; model: string };
    expect(req).toMatchObject({ provider, model });
  });

  it('drops the pick when SelectorSchema rejects the shape', async () => {
    selectorSchema.safeParse.mockReturnValueOnce({ success: false } as never);
    expect(await healSelector(CHAIN)).toBeNull();
  });
});
