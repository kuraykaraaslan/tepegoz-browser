/**
 * `@tepegoz/socks5` — a pure, incremental SOCKS5 CONNECT client (RFC 1928, no-auth). The network
 * layer hands back a trusted loopback SOCKS5 port; this is the piece that lets a raw `node:net`
 * socket ride it, so chat / mail connections honour the Phase-5 egress binding the same way tab
 * traffic does through Chromium's proxy.
 */
export { Socks5Negotiator, type Socks5Target, type Socks5Step } from './negotiator';
export {
  socks5Connect,
  type Socks5Socket,
  type Socks5ConnectOptions,
} from './connect';
