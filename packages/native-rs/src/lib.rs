//! Tepegöz native hot-path module (napi-rs) — PLACEHOLDER (Phase 1b).
//!
//! Planned responsibilities (see plan §7 / ADR-0001):
//!   - Egress anomaly / Base64-exfiltration scanner (ported from the MVP TypeScript implementation)
//!   - Screenshot eviction + WebP encoding
//!   - Checkpoint (de)serialization hot path
//!   - Local-SLM bridge
//!
//! The egress firewall ships in TypeScript for the MVP; it is moved here once measured to need it.

// #[macro_use]
// extern crate napi_derive;
//
// #[napi]
// pub fn noop() -> i32 {
//     0
// }
