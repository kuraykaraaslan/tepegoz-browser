# @tepegoz/notary

Phase 7 **NotaryService** — the tamper-evidence layer over the Event Journal, and the standalone
`tepegoz-verify` CLI that checks its output. Node-only (`node:crypto`), Electron-free, no database:
every function takes the events or key material it needs as arguments so the same code runs in the
main process and in a verifier that has nothing installed but Node.

The three properties this package exists to provide, in order:

1. **A per-event hash chain** proves internal consistency — alter, add, remove, or reorder any event
   after the fact and the chain no longer verifies, because each event's hash folds in the previous
   one and the break propagates to the end.
2. **A signed checkpoint** anchors that chain externally — a device-held Ed25519 key signs the chain
   root, so a chain can't simply be rebuilt from scratch by whoever holds the database without also
   holding the key.
3. **A Replay Receipt** is the portable artifact — the event subtree for one `correlationId` plus the
   checkpoint that anchors it, as one self-contained JSON document. `verifyReceipt` needs nothing
   else: no tepegöz database, no prior state, no shared secret. An auditor checks a claim about what
   the agent did without trusting the vendor that produced the claim to also grade it.

## Exports

- **`canonicalJson(value)`** — deterministic, hash-safe JSON: object keys sorted recursively, array
  order preserved, `undefined` dropped. `JSON.stringify` key order is insertion order, which would
  flag an intact record as tampered the moment a payload was rebuilt.
- **`chainEvents` / `verifyChain` / `chainRoot` / `selfHashOf` / `GENESIS_HASH`** — build and check
  the hash chain over `ChainableEvent`s (a narrow structural subset of `EventRecord`, so no
  persistence-layer dependency).
- **`generateSigningKeyPair` / `signCheckpoint` / `verifyCheckpoint`** — Ed25519 over the chain root.
  Key custody (generation, `safeStorage` persistence, rotation) is deliberately out of scope — a
  main-process concern — so this module stays testable without Electron.
- **`buildReceipt` / `verifyReceipt`** — assemble a `ReplayReceipt` for one run, and grade one:
  `PASS`, `FAIL`, or `TAMPERED`.

## CLI

`tepegoz-verify <receipt.json>` (built to `dist/tepegoz-verify.mjs`) — imports nothing from
`apps/desktop`, opens no database, makes no network call. Exit codes double as the machine-readable
result: `0` PASS · `1` TAMPERED · `2` INVALID (wrong shape, not evidence of tampering) · `3` usage
error.

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`
