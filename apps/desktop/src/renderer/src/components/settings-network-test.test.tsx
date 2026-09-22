// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { settingsDict } from '@tepegoz/settings-ui';
import type { NetworkConnectionView } from '@tepegoz/desktop-ipc';
import type { ConnectionTestResult } from '@tepegoz/shared-types';
import { ConnectionTestAction } from './settings-network-test';

/**
 * The manual "test this connection" action (Phase 5 onboarding gap). What is pinned: each stage's
 * pass/fail/skip state is stated in words; a failed stage shows the SAME localized sentence
 * `classifyNetworkError` produces elsewhere (never the raw detail as the primary text, which stays one
 * hover away); a config-parse failure is shown with the handshake stage marked "not attempted"; and the
 * coarse `reachability` read-out is shown separately, with different wording for "connected but
 * unverified" vs "not reached".
 */

const s = settingsDict.en;

const conn: NetworkConnectionView = {
  id: 'c1',
  label: 'Mullvad',
  upstreamConnectionId: null,
  lastError: null,
  note: '',
  kind: 'wireguard',
  status: 'down',
  connectedSince: null,
  lastCheckedAt: null,
  drops: 0,
  lastHandshakeAt: null,
  lastErrorAt: null,
  handshakesOk: 0,
  handshakesFailed: 0,
  reconnects: 0,
  boundTabs: 0,
  slowCause: 'insufficient_signal',
};

function result(over: Partial<ConnectionTestResult> = {}): ConnectionTestResult {
  return {
    connectionId: 'c1',
    configParse: { status: 'pass', detail: null },
    handshake: { status: 'pass', detail: null },
    reachability: 'unverified',
    ...over,
  };
}

const bridge = { testNetworkConnection: vi.fn() };

/** The reachability line renders as ONE `<p>` text node ("{stage label} — {sentence}"), so this matches
 *  a substring on that specific paragraph rather than requiring an exact whole-node match (which would
 *  also spuriously match every ancestor whose concatenated text happens to contain it). */
function reachabilityLine(substring: string): (content: string, el: Element | null) => boolean {
  return (_content, el) => el?.tagName === 'P' && (el.textContent ?? '').includes(substring);
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(cleanup);

describe('ConnectionTestAction', () => {
  it('runs the test through the bridge and shows a fully-passed result', async () => {
    bridge.testNetworkConnection.mockResolvedValue(result());
    render(<ConnectionTestAction c={conn} s={s} />);

    fireEvent.click(screen.getByRole('button', { name: s.network.test.run }));
    expect(bridge.testNetworkConnection).toHaveBeenCalledWith('c1');

    await waitFor(() => expect(screen.getByText(s.network.test.resultTitle)).toBeTruthy());
    expect(screen.getAllByText(s.network.test.stagePass)).toHaveLength(2);
    expect(screen.getByText(reachabilityLine(s.network.test.reachabilityUnverified))).toBeTruthy();
  });

  it('shows a config-parse failure as its own sentence, and marks the handshake "not attempted"', async () => {
    bridge.testNetworkConnection.mockResolvedValue(
      result({
        configParse: {
          status: 'fail',
          detail: 'This connection has no stored WireGuard profile (or it could not be decrypted)',
        },
        handshake: { status: 'skipped', detail: null },
        reachability: 'notReached',
      }),
    );
    render(<ConnectionTestAction c={conn} s={s} />);
    fireEvent.click(screen.getByRole('button', { name: s.network.test.run }));

    await waitFor(() => expect(screen.getByText(s.network.test.stageFailed)).toBeTruthy());
    // The SAME localized sentence `classifyNetworkError` produces elsewhere for this exact message.
    expect(screen.getByText(s.network.connError.badConfig)).toBeTruthy();
    // Never the raw detail as the primary text — it stays one hover away.
    expect(screen.queryByText(/could not be decrypted/)).toBeNull();
    expect(screen.getByText(s.network.connError.badConfig).getAttribute('title')).toBe(
      'This connection has no stored WireGuard profile (or it could not be decrypted)',
    );

    expect(screen.getByText(s.network.test.stageSkipped)).toBeTruthy();
    expect(screen.getByText(s.network.test.stageSkippedDetail)).toBeTruthy();
    expect(screen.getByText(reachabilityLine(s.network.test.reachabilityNotReached))).toBeTruthy();
  });

  it('shows a handshake failure with the same localized cause the connections overview uses', async () => {
    bridge.testNetworkConnection.mockResolvedValue(
      result({
        handshake: { status: 'fail', detail: 'Nothing is listening on 127.0.0.1:9050' },
        reachability: 'notReached',
      }),
    );
    render(<ConnectionTestAction c={conn} s={s} />);
    fireEvent.click(screen.getByRole('button', { name: s.network.test.run }));

    await waitFor(() => expect(screen.getByText(s.network.connError.noListener)).toBeTruthy());
    expect(screen.getByText(reachabilityLine(s.network.test.reachabilityNotReached))).toBeTruthy();
  });

  it('shows the localized error and no result panel when the bridge call itself rejects', async () => {
    bridge.testNetworkConnection.mockRejectedValue(new Error('That connection no longer exists.'));
    render(<ConnectionTestAction c={conn} s={s} />);
    fireEvent.click(screen.getByRole('button', { name: s.network.test.run }));

    await waitFor(() => expect(screen.getByText('That connection no longer exists.')).toBeTruthy());
    expect(screen.queryByText(s.network.test.resultTitle)).toBeNull();
  });

  it('degrades to "could not be read" when the response fails zod validation', async () => {
    // A shape the main process could never actually emit (an invalid stage status).
    bridge.testNetworkConnection.mockResolvedValue({
      connectionId: 'c1',
      configParse: { status: 'maybe', detail: null },
      handshake: { status: 'pass', detail: null },
      reachability: 'unverified',
    });
    render(<ConnectionTestAction c={conn} s={s} />);
    fireEvent.click(screen.getByRole('button', { name: s.network.test.run }));

    await waitFor(() => expect(screen.getByText(s.network.test.unreadable)).toBeTruthy());
    expect(screen.queryByText(s.network.test.resultTitle)).toBeNull();
  });
});
