/**
 * `@tepegoz/mail-core` — the Electron-free, protocol-agnostic mail client core (ext-mail, phase
 * X-mail.0). MIME parse/build, RFC 5322 address handling, JWZ threading, the filter engine, the
 * Turkish-aware search fold and snippet extraction. Pure and fixture-tested; the schemas it speaks
 * live in `@tepegoz/shared-types` `mail.ts`.
 */

export {
  parseAddressList,
  formatAddress,
  formatAddressList,
} from './address';
