import { describe, expect, it } from 'vitest';
import {
  isConnectedState,
  isTerminalState,
  parseManagementLine,
  parsePushReply,
} from './openvpn-management';

const PUSH =
  "PUSH: Received control message: 'PUSH_REPLY,redirect-gateway def1,dhcp-option DNS 10.8.0.1,dhcp-option DNS 10.8.0.2,route 10.8.0.0 255.255.255.0,topology net30,ping 10,ifconfig 10.8.0.6 10.8.0.5'";

describe('the pushed options — where the tunnel address and DNS come from', () => {
  it('reads the adapter address and its peer', () => {
    const o = parsePushReply(PUSH);
    expect(o?.localAddress).toBe('10.8.0.6');
    expect(o?.peerAddress).toBe('10.8.0.5');
  });

  it('reads every pushed resolver, in order', () => {
    // These become the ONLY resolvers the tunnel's SOCKS server will use; missing one silently narrows
    // the tunnel's DNS to a single point of failure.
    expect(parsePushReply(PUSH)?.dnsServers).toEqual(['10.8.0.1', '10.8.0.2']);
  });

  it('still reports what the server asked for even though we ignore it', () => {
    // `redirect-gateway` is pushed regardless of our pull-filter; reading it is how the UI can say the
    // profile wanted the whole machine and we declined.
    expect(PUSH).toContain('redirect-gateway');
    expect(parsePushReply(PUSH)).not.toBeNull();
  });

  it('returns null for a line that is not a push reply', () => {
    expect(parsePushReply('>STATE:1,CONNECTED,SUCCESS,10.8.0.6')).toBeNull();
  });

  it('survives a push reply with no ifconfig or DNS at all', () => {
    const bare = "PUSH: Received control message: 'PUSH_REPLY,ping 10'";
    expect(parsePushReply(bare)).toEqual({ localAddress: null, peerAddress: null, dnsServers: [] });
  });
});

describe('classifying a management line', () => {
  it('recognises a state change and its detail', () => {
    const e = parseManagementLine('>STATE:1700000000,CONNECTED,SUCCESS,10.8.0.6,203.0.113.9');
    expect(e).toEqual({ kind: 'state', state: 'CONNECTED', detail: 'SUCCESS,10.8.0.6,203.0.113.9' });
  });

  it('recognises the password PROMPT, which has to be answered rather than watched', () => {
    // With --management-query-passwords the tunnel simply waits; a parser that treated this as noise
    // would produce a connection that hangs forever with no explanation.
    expect(parseManagementLine(">PASSWORD:Need 'Auth' username/password")).toEqual({
      kind: 'password',
      what: 'Auth',
    });
  });

  it('turns a rejected password into a fatal with a message a person can act on', () => {
    const e = parseManagementLine(">PASSWORD:Verification Failed: 'Auth'");
    expect(e.kind).toBe('fatal');
    expect(e.kind === 'fatal' && e.message).toMatch(/username or password/);
  });

  it('carries OpenVPN’s own fatal text through instead of flattening it', () => {
    for (const line of [
      'FATAL: Cannot pre-load keyfile',
      'Options error: Unrecognized option or missing parameter',
      'AUTH_FAILED',
    ]) {
      const e = parseManagementLine(line);
      expect(e.kind).toBe('fatal');
    }
    // "the tunnel did not come up" tells the user nothing; "Cannot resolve host address" tells them
    // exactly what to check.
    const resolved = parseManagementLine('Cannot resolve host address: de-fra.example.com');
    expect(resolved.kind === 'fatal' && resolved.message).toContain('de-fra.example.com');
  });

  it('finds the push reply when it arrives wrapped in a LOG line', () => {
    const e = parseManagementLine(`>LOG:1700000000,I,${PUSH}`);
    expect(e.kind).toBe('push');
    expect(e.kind === 'push' && e.options.localAddress).toBe('10.8.0.6');
  });

  it('calls anything else what it is, rather than guessing', () => {
    expect(parseManagementLine('>INFO:OpenVPN Management Interface').kind).toBe('other');
    expect(parseManagementLine('').kind).toBe('other');
  });
});

describe('state meanings', () => {
  it('treats only CONNECTED as carrying traffic', () => {
    expect(isConnectedState('CONNECTED')).toBe(true);
    for (const s of ['WAIT', 'AUTH', 'GET_CONFIG', 'ASSIGN_IP', 'RECONNECTING']) {
      expect(isConnectedState(s)).toBe(false);
    }
  });

  it('treats EXITING as the end', () => {
    expect(isTerminalState('EXITING')).toBe(true);
    expect(isTerminalState('RECONNECTING')).toBe(false);
  });
});
