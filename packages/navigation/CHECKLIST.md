# @tepegoz/navigation CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support safe detection of web-loadable http and https URLs.
- [ ] Support rejecting unsafe schemes for browser-view navigation.
- [ ] Support internal tepegoz page URL canonicalization.
- [ ] Support tolerant internal-page matching with trailing slashes.
- [ ] Support omnibox input conversion to navigable URLs.
- [ ] Support passing through existing http and https URLs.
- [ ] Support inferring schemes for bare hostnames.
- [ ] Support localhost defaulting to http.
- [ ] Support non-local bare hosts defaulting to https.
- [ ] Support host:port inputs.
- [ ] Support web-search fallback for non-URL text.
- [ ] Support injected search URL builders.
- [ ] Support safe treatment of typed file URLs as search text when not allowed.
- [ ] Support safe treatment of javascript and data schemes as search text.
- [ ] Support trusted app URL checks for IPC sender validation.
- [ ] Support file URLs as trusted app content when appropriate.
- [ ] Support localhost dev server trust in development mode.
- [ ] Support exact host matching to avoid prefix spoofing.
- [ ] Support injected packaged versus development mode flags.
- [ ] Support injected internal-page sets from the host.
- [ ] Support URL normalization through the platform URL parser.
- [ ] Support whitespace trimming for pasted omnibox input.
- [ ] Support internationalized domain handling through URL parsing.
- [ ] Support clear failure behavior for malformed URLs.
- [ ] Support unit tests for dangerous scheme handling.
- [ ] Support unit tests for trusted-origin spoofing cases.
- [ ] Support shared use by renderer and main-process guards.
- [ ] Support zero-dependency usage.
- [ ] Support future internal protocols through host configuration.
- [ ] Support docs for adding new navigation schemes safely.
