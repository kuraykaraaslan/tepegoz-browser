// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ContextGauge, contextWindowFor } from './panel-context-gauge';
import { agentDict } from './i18n';

const a = agentDict.en;

afterEach(cleanup);

describe('contextWindowFor', () => {
  it('uses the exact per-model window when a model is pinned', () => {
    expect(contextWindowFor('anthropic', 'claude-haiku-4-5')).toBe(200_000);
    expect(contextWindowFor('anthropic', 'claude-sonnet-5')).toBe(1_000_000);
  });

  it('falls back to the provider floor when the run auto-routes (no pinned model)', () => {
    expect(contextWindowFor('anthropic', '')).toBe(200_000);
    expect(contextWindowFor('anthropic', undefined)).toBe(200_000);
  });

  it('falls back to a conservative default for an unknown provider + model', () => {
    expect(contextWindowFor(undefined, undefined)).toBe(128_000);
    expect(contextWindowFor('anthropic', 'some-future-model')).toBe(200_000);
  });
});

describe('ContextGauge', () => {
  it('renders nothing when the run has reported no context size', () => {
    const { container } = render(
      <ContextGauge contextTokens={0} provider="anthropic" model="" a={a} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a non-finite value', () => {
    const { container } = render(
      <ContextGauge contextTokens={Number.NaN} provider="anthropic" model="" a={a} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the percentage of the window used', () => {
    // 40k of Haiku's 200k = 20%.
    render(<ContextGauge contextTokens={40_000} provider="anthropic" model="claude-haiku-4-5" a={a} />);
    expect(screen.getByText(`${a.context.label} 20%`)).toBeTruthy();
  });

  it('stays in the normal band below 70%', () => {
    const { container } = render(
      <ContextGauge contextTokens={100_000} provider="anthropic" model="claude-haiku-4-5" a={a} />,
    );
    expect(container.querySelector('.bg-amber-500')).toBeNull();
    expect(container.querySelector('.bg-red-500')).toBeNull();
  });

  it('turns amber past ~70% of the window', () => {
    // 150k of 200k = 75%.
    const { container } = render(
      <ContextGauge contextTokens={150_000} provider="anthropic" model="claude-haiku-4-5" a={a} />,
    );
    expect(container.querySelector('.bg-amber-500')).not.toBeNull();
    expect(container.querySelector('.bg-red-500')).toBeNull();
  });

  it('turns red past ~85% of the window', () => {
    // 190k of 200k = 95%.
    const { container } = render(
      <ContextGauge contextTokens={190_000} provider="anthropic" model="claude-haiku-4-5" a={a} />,
    );
    expect(container.querySelector('.bg-red-500')).not.toBeNull();
  });

  it('clamps a run that overflows its estimated window at 100%', () => {
    render(
      <ContextGauge contextTokens={5_000_000} provider="anthropic" model="claude-haiku-4-5" a={a} />,
    );
    expect(screen.getByText(`${a.context.label} 100%`)).toBeTruthy();
  });

  it('carries a localized tooltip distinct from the token quota, in both languages', () => {
    const { rerender } = render(
      <ContextGauge contextTokens={100_000} provider="anthropic" model="claude-haiku-4-5" a={a} />,
    );
    const en = screen.getByRole('progressbar').getAttribute('title') ?? '';
    expect(en).toContain('working memory');
    expect(en).toContain('100k');
    expect(en).toContain('200k');
    expect(en.toLowerCase()).toContain('not your token quota');

    rerender(
      <ContextGauge
        contextTokens={100_000}
        provider="anthropic"
        model="claude-haiku-4-5"
        a={agentDict.tr}
      />,
    );
    const tr = screen.getByRole('progressbar').getAttribute('title') ?? '';
    expect(tr).toContain('çalışma belleği');
    expect(tr).not.toEqual(en);
  });
});
