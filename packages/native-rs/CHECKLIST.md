# native-rs CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [ ] Support Rust-backed hot paths through napi-rs bindings.
- [x] Support egress anomaly scanning for outbound data.
- [x] Support Base64 exfiltration detection.
- [x] Support high-entropy secret detection.
- [ ] Support screenshot eviction decisions in native code.
- [ ] Support WebP screenshot encoding.
- [ ] Support checkpoint serialization hot paths.
- [ ] Support checkpoint deserialization hot paths.
- [x] Support a local small-language-model bridge.
- [ ] Support Node and Electron ABI compatible builds.
- [ ] Support Windows build artifacts.
- [ ] Support macOS build artifacts.
- [ ] Support Linux build artifacts.
- [ ] Support CI toolchain setup for Rust.
- [ ] Support deterministic native test fixtures.
- [ ] Support TypeScript declarations for exported native functions.
- [ ] Support safe error conversion from Rust to JavaScript.
- [ ] Support memory-safe buffer handling across the native boundary.
- [ ] Support streaming interfaces for large blobs.
- [ ] Support cancellation for long-running native operations.
- [ ] Support benchmark suites for TypeScript versus Rust paths.
- [ ] Support fallback JavaScript paths when native loading fails.
- [ ] Support feature flags for enabling native acceleration.
- [ ] Support crash containment and clear diagnostics for native panics.
- [ ] Support versioned native API contracts.
- [ ] Support package metadata for workspace and release tooling.
- [ ] Support local development builds through documented commands.
- [ ] Support reproducible release builds.
- [ ] Support security review documentation for native code paths.
- [ ] Support future native modules without coupling to app UI.
