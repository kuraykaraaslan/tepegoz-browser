// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { InternalPageLoadFailed, InternalPageLoading } from './InternalPageState';

/**
 * The two states a `tepegoz://` settings surface shows before it has preferences: a quiet loading
 * line (role=status) and a distinct failure panel (role=alert) whose retry button calls back. They
 * are told apart on purpose — a rejected first fetch used to leave a blank ground with no way back.
 */

function wrap(node: ReactElement) {
  return render(<I18nProvider locale="en">{node}</I18nProvider>);
}

afterEach(cleanup);

describe('InternalPageState', () => {
  it('loading renders as a polite status', () => {
    wrap(<InternalPageLoading />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('failure renders as an alert, separate from the loading state', () => {
    wrap(<InternalPageLoadFailed onRetry={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('failure retry button invokes the callback', () => {
    const onRetry = vi.fn();
    wrap(<InternalPageLoadFailed onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
