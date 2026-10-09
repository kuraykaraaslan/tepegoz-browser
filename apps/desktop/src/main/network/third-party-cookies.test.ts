import { describe, expect, it } from 'vitest';
import { isThirdPartyRequest, withoutCookieHeader, withoutSetCookie } from './third-party-cookies';

describe('isThirdPartyRequest', () => {
  const top = 'https://www.news.example/story';

  it.each([
    ['https://ads.tracker.test/pixel.gif', 'image'],
    ['https://cdn.other.test/lib.js', 'script'],
    ['https://news.example.evil.test/x', 'xhr'],
  ])('treats %s (%s) as third-party', (url, type) =>
    expect(isThirdPartyRequest(top, url, type)).toBe(true),
  );

  it.each([
    ['https://www.news.example/api', 'xhr'], // same host
    ['https://static.news.example/app.js', 'script'], // same registrable domain
    ['http://news.example/img.png', 'image'], // other scheme, same site
  ])('treats %s (%s) as first-party', (url, type) =>
    expect(isThirdPartyRequest(top, url, type)).toBe(false),
  );

  it('never calls a main-frame navigation third-party, whatever site it goes to', () => {
    expect(isThirdPartyRequest(top, 'https://elsewhere.test/', 'mainFrame')).toBe(false);
  });

  it('does not strip cookies on single-label hosts (localhost, an intranet name)', () => {
    expect(isThirdPartyRequest('http://localhost:3000/', 'http://localhost:3000/api', 'xhr')).toBe(
      false,
    );
    expect(isThirdPartyRequest('http://intranet/app', 'http://intranet/api', 'xhr')).toBe(false);
  });

  it('treats the same IP as first-party and a different IP as third-party', () => {
    expect(isThirdPartyRequest('http://10.0.0.5/', 'http://10.0.0.5:8080/x', 'xhr')).toBe(false);
    expect(isThirdPartyRequest('http://10.0.0.5/', 'http://10.0.0.6/x', 'xhr')).toBe(true);
  });

  it('leaves alone what it cannot judge: no page URL, internal pages, non-web requests', () => {
    expect(isThirdPartyRequest('', 'https://a.test/x', 'image')).toBe(false);
    expect(isThirdPartyRequest('tepegoz://settings', 'https://a.test/x', 'image')).toBe(false);
    expect(isThirdPartyRequest(top, 'data:image/gif;base64,AAAA', 'image')).toBe(false);
    expect(isThirdPartyRequest(top, 'not a url', 'image')).toBe(false);
  });

  it('separates sites under a multi-part public suffix', () => {
    expect(isThirdPartyRequest('https://a.co.uk/', 'https://b.co.uk/x', 'image')).toBe(true);
    expect(isThirdPartyRequest('https://www.a.co.uk/', 'https://img.a.co.uk/x', 'image')).toBe(
      false,
    );
  });
});

describe('header filters', () => {
  it('removes Cookie in any case and keeps everything else', () => {
    expect(withoutCookieHeader({ Cookie: 'a=1', cookie: 'b=2', Accept: '*/*' })).toEqual({
      Accept: '*/*',
    });
  });

  it('removes every Set-Cookie in any case and keeps everything else', () => {
    expect(
      withoutSetCookie({ 'Set-Cookie': ['a=1', 'b=2'], 'set-cookie': ['c=3'], Server: ['x'] }),
    ).toEqual({ Server: ['x'] });
  });
});
