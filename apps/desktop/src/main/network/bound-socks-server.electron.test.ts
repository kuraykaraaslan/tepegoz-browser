import { createServer, connect, type Server } from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  parseSocksRequest,
  startBoundSocksServer,
  type BoundSocksServer,
} from './bound-socks-server.electron';

/**
 * The bound SOCKS server is where the OpenVPN path's two silent failure modes live, so the tests aim at
 * exactly those: an unbound outbound socket, and a hostname resolved by the machine instead of the
 * tunnel. Both look like everything working.
 */

const started: BoundSocksServer[] = [];
const servers: Server[] = [];

afterEach(async () => {
  for (const s of started.splice(0)) await s.close();
  for (const s of servers.splice(0)) await new Promise<void>((r) => s.close(() => r()));
});

/** An echo server that records the source address every connection arrived from. */
async function echoServer(): Promise<{ port: number; sources: string[] }> {
  const sources: string[] = [];
  const server = createServer((socket) => {
    sources.push(socket.remoteAddress ?? '');
    socket.end('ok');
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return { port: (server.address() as AddressInfo).port, sources };
}

/** Speak SOCKS5 to the server and return the reply code plus whatever came back. */
async function socksConnect(
  socksPort: number,
  request: Buffer,
): Promise<{ code: number; body: string }> {
  return new Promise((resolve, reject) => {
    const socket = connect(socksPort, '127.0.0.1');
    let greeted = false;
    let replied = false;
    let code = -1;
    let body = '';
    const finish = (): void => {
      socket.destroy();
      resolve({ code, body });
    };
    socket.on('error', reject);
    socket.on('data', (chunk: Buffer) => {
      if (!greeted) {
        greeted = true;
        socket.write(request);
        return;
      }
      if (!replied) {
        replied = true;
        code = chunk[1] ?? -1;
        if (code !== 0x00) {
          finish();
          return;
        }
        // The 10-byte reply and the first payload bytes can arrive in ONE segment; treating the whole
        // chunk as the reply would silently drop the body and make a passing proxy look broken.
        if (chunk.length > 10) body += chunk.subarray(10).toString();
        return;
      }
      body += chunk.toString();
    });
    socket.on('close', () => resolve({ code, body }));
    socket.write(Buffer.from([0x05, 0x01, 0x00]));
    setTimeout(finish, 4000);
  });
}

function ipv4Request(port: number): Buffer {
  const buf = Buffer.from([0x05, 0x01, 0x00, 0x01, 127, 0, 0, 1, 0, 0]);
  buf.writeUInt16BE(port, 8);
  return buf;
}

function nameRequest(name: string, port: number): Buffer {
  const head = Buffer.from([0x05, 0x01, 0x00, 0x03, name.length]);
  const tail = Buffer.alloc(2);
  tail.writeUInt16BE(port, 0);
  return Buffer.concat([head, Buffer.from(name, 'utf8'), tail]);
}

describe('the request parser', () => {
  it('accepts an IPv4 CONNECT', () => {
    const { target } = parseSocksRequest(ipv4Request(8080));
    expect(target).toEqual({ host: '127.0.0.1', port: 8080, isName: false });
  });

  it('accepts a DOMAINNAME CONNECT and marks it as needing tunnel DNS', () => {
    const { target } = parseSocksRequest(nameRequest('example.test', 443));
    expect(target).toEqual({ host: 'example.test', port: 443, isName: true });
  });

  it('REFUSES an IPv6 literal — reaching it would leave over the physical v6 path', () => {
    const v6 = Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x04]), Buffer.alloc(16), Buffer.alloc(2)]);
    const { target, code } = parseSocksRequest(v6);
    expect(target).toBeNull();
    expect(code).toBe(0x08); // address type not supported
  });

  it('refuses BIND and UDP ASSOCIATE rather than half-implementing them', () => {
    const bind = Buffer.from([0x05, 0x02, 0x00, 0x01, 127, 0, 0, 1, 0, 80]);
    expect(parseSocksRequest(bind).code).toBe(0x07);
  });

  it('refuses a truncated or non-SOCKS5 request', () => {
    expect(parseSocksRequest(Buffer.from([0x04, 0x01])).target).toBeNull();
    expect(parseSocksRequest(Buffer.from([0x05, 0x01, 0x00, 0x01, 1, 2])).target).toBeNull();
  });
});

describe('starting the server', () => {
  it('REFUSES to start with no tunnel DNS — the silent hostname leak', () => {
    // With no resolver inside the tunnel every name would have to go to the machine's own, which hands
    // the browsing list to the ISP while the traffic itself is tunneled.
    return expect(
      startBoundSocksServer({ localAddress: '127.0.0.1', dnsServers: [] }),
    ).rejects.toThrow(/no DNS server/);
  });

  it('listens on loopback only — a LAN-reachable proxy would lend the tunnel to anyone', async () => {
    const socks = await startBoundSocksServer({ localAddress: '127.0.0.1', dnsServers: ['127.0.0.1'] });
    started.push(socks);
    expect(socks.port).toBeGreaterThan(0);
  });
});

describe('carrying traffic', () => {
  it('proxies an IPv4 CONNECT and binds the outbound socket to the given address', async () => {
    const echo = await echoServer();
    // 127.0.0.1 stands in for the tunnel address here: it is the one address a test can bind to and
    // still observe on the other end.
    const socks = await startBoundSocksServer({ localAddress: '127.0.0.1', dnsServers: ['127.0.0.1'] });
    started.push(socks);

    const { code, body } = await socksConnect(socks.port, ipv4Request(echo.port));

    expect(code).toBe(0x00);
    expect(body).toBe('ok');
    expect(echo.sources.every((src) => src.includes('127.0.0.1'))).toBe(true);
  });

  it('fails a name it cannot resolve INSIDE the tunnel instead of falling back', async () => {
    // The resolver points at a port where nothing answers, standing in for a tunnel whose DNS is
    // unreachable. A server that fell back to the system resolver would succeed here — that is the bug.
    const socks = await startBoundSocksServer({
      localAddress: '127.0.0.1',
      dnsServers: ['127.0.0.1'],
    });
    started.push(socks);

    const { code } = await socksConnect(socks.port, nameRequest('example.com', 80));

    expect(code).toBe(0x04); // host unreachable
  }, 20_000);
});
