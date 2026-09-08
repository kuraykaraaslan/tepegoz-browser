import { describe, expect, it } from 'vitest';
import { isPublicHttpUrl } from './ssrf-guard';

describe('isPublicHttpUrl', () => {
  it('allows an ordinary public http(s) URL', () => {
    for (const url of [
      'https://example.com/',
      'http://example.com:8080/path?q=1',
      'https://sub.domain.co.uk/a/b',
      'https://93.184.216.34/', // a public IPv4 literal
      'http://example.com./', // trailing-dot FQDN
    ]) {
      expect(isPublicHttpUrl(url), url).toBe(true);
    }
  });

  it('blocks loopback, "this host", CGNAT, multicast and link-local IPv4', () => {
    for (const url of [
      'http://127.0.0.1/',
      'http://127.1.2.3/',
      'http://0.0.0.0/',
      'http://169.254.169.254/latest/meta-data/', // cloud metadata
      'http://169.254.10.10/',
      'http://100.64.0.1/', // CGNAT
      'http://224.0.0.1/', // multicast
      'http://255.255.255.255/',
    ]) {
      expect(isPublicHttpUrl(url), url).toBe(false);
    }
  });

  it('blocks RFC-1918 private IPv4 ranges', () => {
    for (const url of [
      'http://10.0.0.1/',
      'http://10.255.255.255/',
      'http://172.16.0.1/',
      'http://172.31.255.255/',
      'http://192.168.1.1/',
    ]) {
      expect(isPublicHttpUrl(url), url).toBe(false);
    }
    // 172.32.x is public — the private block is 172.16–31 only.
    expect(isPublicHttpUrl('http://172.32.0.1/')).toBe(true);
  });

  it('sees through decimal / octal / hex / short-form IPv4 (WHATWG URL normalizes them to dotted-quad)', () => {
    for (const url of [
      'http://2130706433/', // 127.0.0.1 as a 32-bit int
      'http://0x7f000001/', // hex
      'http://017700000001/', // octal
      'http://127.1/', // short form
      'http://0x7f.1/',
    ]) {
      expect(isPublicHttpUrl(url), url).toBe(false);
    }
  });

  it('blocks localhost-family hostnames and cloud-metadata names', () => {
    for (const url of [
      'http://localhost/',
      'http://localhost:9000/',
      'http://foo.localhost/',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://metadata/',
    ]) {
      expect(isPublicHttpUrl(url), url).toBe(false);
    }
  });

  it('blocks loopback, ULA and link-local IPv6 (bracketed or not)', () => {
    for (const url of [
      'http://[::1]/',
      'http://[::]/',
      'http://[fc00::1]/',
      'http://[fd12:3456::1]/',
      'http://[fe80::1]/',
      'http://[::ffff:127.0.0.1]/', // IPv4-mapped loopback
      'http://[::ffff:10.0.0.1]/', // IPv4-mapped private
    ]) {
      expect(isPublicHttpUrl(url), url).toBe(false);
    }
    expect(isPublicHttpUrl('http://[2606:2800:220:1::]/')).toBe(true); // a public IPv6
  });

  it('rejects a non-http(s) scheme and an unparseable string', () => {
    expect(isPublicHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isPublicHttpUrl('ftp://example.com/')).toBe(false);
    expect(isPublicHttpUrl('not a url')).toBe(false);
    expect(isPublicHttpUrl('')).toBe(false);
  });
});
