// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ResourceChip } from './panel-resource-chip';
import { agentDict } from './i18n';

const a = agentDict.en;

afterEach(cleanup);

describe('ResourceChip', () => {
  it('renders nothing before any run has reported a measurement', () => {
    const { container } = render(
      <ResourceChip peakRssBytes={undefined} cpuSeconds={undefined} a={a} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when peak RSS is 0 (unmeasured, not "measured and free")', () => {
    const { container } = render(<ResourceChip peakRssBytes={0} cpuSeconds={1.2} a={a} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a non-finite value', () => {
    const { container } = render(
      <ResourceChip peakRssBytes={Number.NaN} cpuSeconds={1} a={a} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when CPU seconds is missing even if RSS is known', () => {
    const { container } = render(
      <ResourceChip peakRssBytes={50 * 1024 * 1024} cpuSeconds={undefined} a={a} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('formats peak memory and CPU seconds using the shared byte formatter', () => {
    render(<ResourceChip peakRssBytes={204_800_000} cpuSeconds={3.4} a={a} />);
    // 204_800_000 bytes = ~195.3 MB via @tepegoz/process-ui's formatBytes (binary prefix).
    expect(screen.getByText('Peak memory: 195.3 MB · CPU: 3.4s')).toBeTruthy();
  });

  it('rounds CPU seconds to whole seconds past ten', () => {
    render(<ResourceChip peakRssBytes={10 * 1024 * 1024} cpuSeconds={42.7} a={a} />);
    expect(screen.getByText('Peak memory: 10.0 MB · CPU: 43s')).toBeTruthy();
  });

  it('carries a localized tooltip + aria-label distinct from the token/context chips, in both languages', () => {
    const { rerender } = render(
      <ResourceChip peakRssBytes={10 * 1024 * 1024} cpuSeconds={1} a={a} />,
    );
    const chip = screen.getByText('Peak memory: 10.0 MB · CPU: 1.0s');
    const enTitle = chip.getAttribute('title');
    expect(enTitle).toContain('browser slow');
    expect(chip.getAttribute('aria-label')).toBe('Peak memory used by this run: 10.0 MB. CPU time: 1.0s.');

    rerender(
      <ResourceChip peakRssBytes={10 * 1024 * 1024} cpuSeconds={1} a={agentDict.tr} />,
    );
    const trChip = screen.getByText('En yüksek bellek: 10.0 MB · CPU: 1.0s');
    expect(trChip.getAttribute('title')).not.toEqual(enTitle);
    expect(trChip.getAttribute('title')).toContain('yavaşlat');
  });
});
