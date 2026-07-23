# @tepegoz/navigation CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support safe detection of web-loadable http and https URLs.
- [x] Support rejecting unsafe schemes for browser-view navigation.
- [x] Support internal tepegoz page URL canonicalization.
- [x] Support tolerant internal-page matching with trailing slashes.
- [x] Support omnibox input conversion to navigable URLs.
- [x] Support passing through existing http and https URLs.
- [x] Support inferring schemes for bare hostnames.
- [x] Support localhost defaulting to http.
- [x] Support non-local bare hosts defaulting to https.
- [x] Support host:port inputs.
- [x] Support web-search fallback for non-URL text.
- [x] Support injected search URL builders.
- [x] Support safe treatment of typed file URLs as search text when not allowed.
- [x] Support safe treatment of javascript and data schemes as search text.
- [x] Support trusted app URL checks for IPC sender validation.
- [x] Support file URLs as trusted app content when appropriate.
- [x] Support localhost dev server trust in development mode.
- [x] Support exact host matching to avoid prefix spoofing.
- [x] Support injected packaged versus development mode flags.
- [x] Support injected internal-page sets from the host.
- [ ] Support URL normalization through the platform URL parser.
- [x] Support whitespace trimming for pasted omnibox input.
- [ ] Support internationalized domain handling through URL parsing.
- [x] Support clear failure behavior for malformed URLs.
- [x] Support unit tests for dangerous scheme handling.
- [x] Support unit tests for trusted-origin spoofing cases.
- [ ] Support shared use by renderer and main-process guards.
- [x] Support zero-dependency usage.
- [x] Support future internal protocols through host configuration.
- [ ] Support docs for adding new navigation schemes safely.
