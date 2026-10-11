# Code cleanup: kill the "çift başlılık" — one tool-calling protocol + AIAdaptor → CapabilityGroup

> **Status:** planned — implementation deferred (execute later, ideally as the 3 PRs below).

## Context (why this change)

The observation was that the **extension-API logic** and the **AIAdaptor logic** feel _two-headed_
(_çift başlılık_), and the ask was for a single, flatter model. Investigation showed:

- There is **one** tool plane — `CapabilityRegistry` + `ToolGateway` (ADR-0007). Around it sit three
  **legitimately separate** layers that only _look_ duplicated because they share the words
  "adapter / adaptor / provider":
  1. **`ModelProvider`** — the real LLM-vendor adapter (Anthropic / OpenAI / local) in
     `@tepegoz/model-gateway`. Spelled "adapt**e**r".
  2. **`AIAdapt**o**r`** — a Settings-UI **projection** that _groups_ registered tools for
     "Cost & performance"; it registers nothing (ADR-0023). `apps/desktop/src/main/agent/ai-adaptors.ts`.
  3. **`ToolSource='adapter'`** — a reserved-but-unused enum value (`tool-descriptor.ts`).
- The **big** duplication is already gone on this branch: browser/tab/journal tools used to be
  registered twice (`packages/browser-tools/src/builtin-tools.ts` as `source:'builtin'` **and**
  `extensions/ext-agent/src/capabilities.ts` as `source:'extension'`). `builtin-tools.ts` is deleted;
  everything now flows through the extension path (disabling `com.tepegoz.agent` is a real kill-switch).
- **`tepegozApi`** is not part of the duplication. It is `window.tepegoz` (interface `TepegozApi`,
  `@tepegoz/desktop-ipc`): the **single** typed `contextBridge` between renderer and main — every method
  funnels through `invoke<T>(channel)` → IPC → a main handler (zod validation + the ADR-0009 security
  boundary). It just happens to expose both `listAiAdaptors()` and `listExtensionManifests()`, which is a
  _symptom_, not a cause.

**What remains** (the real, smaller "two-headedness"): a naming collision, some dead grouping code + stale
docs, and a **dormant second tool-calling protocol** (native provider tool-calls) that no production code
uses. This plan removes all three.

## Decisions

1. **Rename** the tool-group concept `AIAdaptor` → **`CapabilityGroup`**, so "adapter/provider" means
   _only_ the LLM-vendor layer. Also remove the unused `ToolSource='adapter'`.
2. **Re-split** the Agent extension's tools (currently collapsed into one "Agent" group) into
   **Browser / Tabs / Journal** sub-groups via per-capability `category`.
3. **Unify tool-calling** by deleting the dormant native plumbing → a single JSON-decision protocol.

## Verified grounding facts

- The native tool-calling path is **100 % dead in production**: `CanonRequest.tools` is set by no
  production caller; `CanonResponse.toolCalls` is read by nobody outside the two cloud providers + their
  unit tests. (Reactor/Planner build the tool list into the _system prompt_ and use `responseFormat:'json'`;
  their `ReactRequest.tools`/`PlanRequest.tools` are a **different** field.)
- **Local models can't do native tool-calling**: `packages/local-inference/src/map-response.ts` hardcodes
  `toolCalls: []` (GBNF-grammar JSON path). This is _why_ the provider-agnostic JSON protocol exists.
- `category` already flows from `capability()` → `ToolDescriptor.category` → registry — **no tool-plane
  type change** needed for Part 3.
- Agent's 7 tools today: `category:'browser'` ×6 (incl. `tab_list_items`, `tab_create_item`),
  `category:'journal'` ×1. No `tabs` category yet.
- `ext-macros` capabilities set **no** `category` → must keep collapsing to one "Macros" group.
- After the earlier refactor the only `system` groups are `file` (file-operations, `source:'builtin'`) and
  `extensions` (`EXTENSION_HOST_ID`) → `SYSTEM_TITLES.browser`/`.journal` are provably unreachable.
- `ToolSource='adapter'` appears only in the enum literal (`tool-descriptor.ts:19`) — no `switch`/`case`,
  no producer → safe to remove.
- ADR index currently ends at **0024**; new ADRs are 0025+.

---

## Execution order — three reviewable PRs

Keep each diff clean and avoid re-editing renamed files:

| PR    | Parts       | Nature                                         | Why isolated                                                         |
| ----- | ----------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| **A** | Part 4      | pure deletion of dead plumbing                 | isolated to `model-gateway` + `local-inference`; zero runtime change |
| **B** | Parts 2 + 3 | behavioral (grouping) on the **current** names | clean behavioral diff before the rename                              |
| **C** | Part 1      | mechanical rename + ADRs                       | huge rename kept separate from behavior                              |

Branch per repo rules: `chore/single-tool-protocol`, `feat/capability-group-subgroups`,
`refactor/aiadaptor-to-capability-group` (or similar `<type>/<scope>`), each self-review PR → `main`.

---

## Part 4 (PR-A) — one tool-calling protocol: delete the dormant native plumbing

**Recommendation:** keep the JSON-decision protocol as the single mechanism; delete the unused native
`CanonToolDef` / `CanonToolCall` / `CanonRequest.tools` / `CanonResponse.toolCalls`.
Rationale: option "standardize on native" is impossible (local has no native tool channel); option "native
for cloud + JSON for local" _adds_ a second protocol (more çift başlılık, two message-threading formats,
loses the `coerceDecisionShape` salvage weak models need); deleting the dead path achieves "one mechanism"
at **zero runtime risk** (the path is provably unused). Leave the door open in an ADR to reintroduce native
calling behind a provider-capability flag if a future cloud-only quality need justifies it.

**Deletions**

- `packages/model-gateway/src/types.ts`: remove `interface CanonToolDef`, `interface CanonToolCall`, the
  `tools?` field on `CanonRequest`, the `toolCalls` field on `CanonResponse`. (Optionally drop `'tool_use'`
  from `CanonStopReason` and map those to `'end'` in providers — low value; keeping is fine.)
- `packages/model-gateway/src/providers/anthropic.provider.ts`: remove the `params.tools` mapping, the
  `CanonToolCall` import, the `toolCalls`/`tool_use` extraction in `fromAnthropicResult`, the tool fields on
  `AnthropicCompletion.content`, and the `params.tools` branch in `countInputTokens`.
- `packages/model-gateway/src/providers/openai.provider.ts`: remove `interface OpenAIToolDef`, the `tools?`
  field on `OpenAIChatRequest`, the `body.tools` mapping, `parseToolArgs`, the `tool_calls` field on
  `OpenAICompletion`, the `CanonToolCall` import, and the `toolCalls` extraction in `fromOpenAIResult`.
- `packages/model-gateway/src/mock-provider.ts`: remove `toolCalls: []`.
- `packages/local-inference/src/map-response.ts`: remove `toolCalls: []` and update the doc comment.
- `packages/model-gateway/README.md`: drop `CanonToolDef`/`CanonToolCall` from the Types list.

**Tests to update** (compile-forced by the field removal): `anthropic.provider.test.ts` (delete the
"maps canon tools" + "extracts tool_use" cases), `openai.provider.test.ts` (delete the tool-mapping +
three `toolCalls` cases), `reactor.test.ts` / `planner.test.ts` (drop `toolCalls: []` from scripted
`CanonResponse`), `local-inference/src/{map.test.ts,local-provider.test.ts}` (drop `toolCalls`).

---

## Part 2 (PR-B) — remove residual dead code + fix stale docs

- `apps/desktop/src/main/agent/ai-adaptors.ts`: delete `SYSTEM_TITLES.browser` and `.journal` (leaves
  `{ file, extensions }`); fix the file header + `SYSTEM_TITLES` comment (only builtin category is now
  `file`; browser/tabs/journal are `source:'extension'`).
- `packages/desktop-ipc/src/ai-adaptor-types.ts`: fix the `AIAdaptorKind` + `AIAdaptor` doc comments — drop
  "browser / journal" from the list of _system_ groups.
- `docs/adr/0023-ai-adaptors.md`: fix Decision §2 bullet 3 ("browser-tools → browser/journal") and the
  §Consequences line — no longer true.
- **Do not** delete the settings-ui `adaptors.browser`/`.journal` keys — Part 3 repurposes them as
  category labels.

---

## Part 3 (PR-B) — re-split the Agent extension into Browser / Tabs / Journal

Group extension tools by **provenance + category** when a category is present; fall back to provenance-only
when absent (preserves Macros as one group). Exactly what ADR-0023 §Consequences anticipated.

1. **`extensions/ext-agent/src/capabilities.ts`** — change the two tab tools from `category:'browser'` to
   `category:'tabs'`: `tab_list_items` (~line 125) and `tab_create_item` (~line 137). Result:
   `browser`×4, `tabs`×2, `journal`×1.

2. **`apps/desktop/src/main/agent/ai-adaptors.ts`** — sub-split in `adaptorMetaOf`:

   ```ts
   interface AdaptorMeta {
     id: string;
     kind: AIAdaptorKind;
     provenance?: string;
     category?: string;
   }

   function adaptorMetaOf(d: ToolDescriptor): AdaptorMeta {
     if (d.source === 'extension') {
       const provenance = d.provenance ?? 'extensions';
       if (provenance === EXTENSION_HOST_ID) return { id: 'extensions', kind: 'system' };
       const id = d.category !== undefined ? `${provenance}:${d.category}` : provenance; // namespaced
       const meta: AdaptorMeta = { id, kind: 'extension', provenance };
       if (d.category !== undefined) meta.category = d.category;
       return meta;
     }
     // …mcp + system branches unchanged…
   }
   ```
   - The composite `provenance:category` id namespaces sub-groups and avoids colliding with a system id.
   - `buildAiAdaptors` copies `meta.category` onto the group; add a category tiebreaker to the sort (the
     three agent sub-groups share the same resolved extension title, so `localeCompare(title)` ties):
     `|| (a.category ?? '').localeCompare(b.category ?? '')`.
   - `titleOf` for `kind:'extension'` stays as-is (resolve the extension name from
     `manifestById(meta.provenance)` + `extensionLabel`); the category label is localized in the renderer.

3. **Wire `category` + localize in the renderer** (ADR-0023 "split localization by stability", one level
   deeper — the extension _name_ is dynamic → resolved in main; the _category_ is a stable known key →
   localized in the renderer):
   - `packages/desktop-ipc/src/ai-adaptor-types.ts`: add `category?: string` to `AIAdaptor`.
   - `apps/desktop/src/renderer/src/components/settings-ai-panels.tsx` — extend `adaptorTitle`
     (currently only special-cases `system`):
     ```ts
     const adaptorTitle = (a: AIAdaptor): string => {
       if (a.kind === 'system') return s.adaptors[a.id as keyof typeof s.adaptors] ?? a.title;
       if (a.category !== undefined)
         return `${a.title} · ${s.adaptors[a.category as keyof typeof s.adaptors] ?? a.category}`;
       return a.title;
     };
     ```
   - `packages/settings-ui/src/i18n/{en,tr}.ts`: the `adaptors` map already has `browser` + `journal`
     (now repurposed as category labels); **add `tabs`** — en `tabs: 'Tabs'`, tr `tabs: 'Sekmeler'`. This
     one map now serves both system-group ids **and** extension category keys — the elegant single source
     that resolves Part 2's otherwise-dead keys.

4. **New test** (there is currently none for the builder): add
   `apps/desktop/src/main/agent/ai-adaptors.test.ts` (renamed to `capability-groups.test.ts` in PR-C)
   asserting: agent tools split into 3 `extension` groups keyed `com.tepegoz.agent:{browser,tabs,journal}`;
   macros collapse to one group; `file`/`extensions` are `system`; each group carries the expected
   `category`. Optionally extend `extensions/ext-agent/src/capabilities.test.ts` for the new `tabs` values.

---

## Part 1 (PR-C) — rename AIAdaptor → CapabilityGroup + remove ToolSource='adapter'

**Symbol map** (apply consistently): `AIAdaptor`→`CapabilityGroup`, `AIAdaptorAction`→`CapabilityGroupAction`,
`AIAdaptorKind`→`CapabilityGroupKind`, `AI_ADAPTOR_KINDS`→`CAPABILITY_GROUP_KINDS`, field `adaptorId`→`groupId`,
`buildAiAdaptors`→`buildCapabilityGroups`, `listAiAdaptors`→`listCapabilityGroups`, channel key
`aiAdaptorsList`→`capabilityGroupsList` (value `'ai-adaptors:list'`→`'capability-groups:list'`), internal
`adaptorMetaOf`→`groupMetaOf` / `AdaptorMeta`→`GroupMeta`, settings-ui dict keys `adaptors`→`capabilityGroups`
and `adaptorKinds`→`groupKinds`.

**Files (~12, all in-repo consumers):**

- `packages/desktop-ipc/src/`: rename `ai-adaptor-types.ts` → `capability-group-types.ts` (symbols + docs);
  `contract.ts` (re-export path + comments); `channels.ts` (key + value + comment); `api.ts` (import +
  `listCapabilityGroups()` signature + comments).
- `apps/desktop/`: rename `src/main/agent/ai-adaptors.ts` → `capability-groups.ts`; `src/main/ipc/ipc-content.ts`
  (import, `buildCapabilityGroups`, handler on `IpcChannels.capabilityGroupsList`); `src/preload/api-agent-models.ts`
  (import, `Pick<…>` member, method impl); `src/renderer/src/components/settings-ai-panels.tsx` (types,
  `listCapabilityGroups`, locals `adaptors`/`setAdaptors`→`groups`/`setGroups`, `adaptorTitle`→`groupTitle`,
  dict refs `s.capabilityGroups`/`s.groupKinds`).
- `packages/settings-ui/src/i18n/{en,tr}.ts`: rename the two dict keys in **both** files (keeps the en/tr
  parity test green).

**Remove `ToolSource='adapter'`**: `packages/shared-types/src/tool-descriptor.ts:19` — drop `'adapter'` from
`ToolSourceEnum` + update the adjacent comment. Safe (no consumer matches the literal).

**Docs:** `docs/adr/0023-ai-adaptors.md` (title + §4 which reserved `'adapter'` → mark withdrawn);
`docs/adr/README.md` index row for 0023.

---

## ADRs to add / amend

- **New ADR 0025 — "CapabilityGroup: rename AIAdaptor + category-based extension sub-groups."** Refines /
  supersedes 0023. Covers Part 1 (rename rationale: "adapter/provider" reserved for the LLM-vendor layer),
  Part 3 (provenance+category sub-grouping), and withdrawal of `ToolSource='adapter'`.
- **Amend ADR 0023** with a "Superseded/renamed by 0025" banner + the Part 2 doc fixes.
- **New ADR 0026 — "Single tool-calling protocol; remove dormant native tool plumbing."** Refines ADR-0007.
  Records: the JSON-decision protocol is the one mechanism; the local-model constraint that rules out native
  calling; that the deleted native fields were unused; and that native calling may return behind a
  provider-capability flag if ever justified.

---

## Benefits / costs (yarar / zarar)

**Yarar:** one unambiguous vocabulary ("adapter/provider" = LLM vendor only; "capability group" = tool
grouping); dead code + one dormant protocol removed → smaller, honest surface; Settings shows meaningful
sub-groups (Browser / Tabs / Journal) instead of a monolithic "Agent"; easier onboarding & extension
authoring; better for both humans and the model reading the code.
**Zarar / risk:** `AIAdaptor` is a public IPC type → the rename ripples across desktop-ipc + preload +
renderer + main + settings-ui i18n + ADRs (wide but mechanical, all in-repo). Requires an ADR amendment.
The only "wire-ish" edits are the IPC channel string and the i18n keys — both ends live in-repo. Mitigated
by the 3-PR split and full typecheck coverage.

---

## Verification

- `pnpm exec turbo run typecheck lint test build` — catches every rename/deletion breakage (all consumers
  in-repo).
- Targeted: `pnpm --filter @tepegoz/model-gateway test` (provider mapping), `--filter @tepegoz/orchestrator test`
  (reactor/planner still parse JSON decisions), `--filter @tepegoz/local-inference test`, ext-agent
  `capabilities.test.ts`, `agent-runtime.test.ts`, and the new `capability-groups.test.ts`.
- `pnpm test:electron` — main IPC handler ↔ preload `listCapabilityGroups` bridge parity on the renamed
  channel.
- `pnpm e2e` — Settings → Cost & performance shows the Agent split into **Browser / Tabs / Journal**,
  Macros as one group, plus **File operations** and **Extensions**; per-action "run locally" toggles still
  work; Turkish renders "Ajan · Tarayıcı / Sekmeler / Günlük".
