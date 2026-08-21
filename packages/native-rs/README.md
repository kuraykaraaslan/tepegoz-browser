# native-rs (placeholder)

Rust hot-path crate (napi-rs) for Tepegöz. **Not yet built** — this is a documented placeholder for
**Phase 1b**. It deliberately has **no `package.json`**, so it is not a pnpm workspace package and CI
does not require a Rust toolchain at this stage.

Planned (see plan §7, ADR-0001):

- Egress anomaly / Base64-exfiltration scanner (ported from the MVP TypeScript version)
- Screenshot eviction + WebP encoding
- Checkpoint (de)serialization hot path
- Local-SLM bridge

When activated: add `package.json` (napi-rs build via `@napi-rs/cli`), wire into Turborepo, and add a
Rust toolchain step to CI.
