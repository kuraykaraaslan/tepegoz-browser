# agent-runtime — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Electron'suz agentic çalışma motoru (L3): user prompt → `ModelRouter` → `Planner` (DAG) → `Executor` (tek `ToolGateway` PEP + HITL) → canlı olaylar + Human Handoff Controller; tüm app/OS bağımlılıkları `AgentRunDeps` ile enjekte edilir.

## Kesinlikle olmalı
- [ ] Bir agent turn'ünü `runAgent` tek giriş noktası üzerinden yürütmeli
- [ ] Electron'a bağımlı olmamalı (Electron-free çalışmalı)
- [ ] Akışı user prompt → `ModelRouter` → `Planner` (DAG) → `Executor` → Reactor sırasıyla sürmeli
- [ ] Planner planı bir DAG olarak üretmeli
- [ ] Tüm araç çağrılarını tek bir `ToolGateway` PEP'inden geçirmeli
- [ ] Döngü öncesi plan önizlemesi için HITL onayı (`requestPlanApproval`) istemeli
- [ ] Gate'lenmiş her araç çağrısı için ayrı HITL onayı (`requestApproval`) istemeli
- [ ] Canlı ilerleme olaylarını `onEvent` üzerinden yayınlamalı
- [ ] Tüm app/OS bağımlılıklarını `AgentRunDeps` ile enjekte almalı (`browserHost`, `journal`, `activeTabUrl`, `handoffStrings`)
- [ ] `activeTabUrl()` sonucunu Policy Kernel site bağlamı için kullanmalı
- [ ] Sağlayıcıyı çalışma anında safeStorage vault anahtarından kaydetmeli
- [ ] Ham API anahtarının ana süreçten dışarı çıkmasına izin vermemeli
- [ ] `localInference` config yoksa `'local'` yönlendirmeyi devre dışı bırakıp bulut sağlayıcıya düşmeli
- [ ] Kooperatif iptal için `signal` ile turn'ü yarıda durdurabilmeli
- [ ] `AgentRunSummary` içinde `stoppedReason` ve `ok` döndürmeli
- [ ] Human Handoff Controller ile insana devri yönetmeli
- [ ] Handoff metinlerini enjekte edilen `handoffStrings`'ten almalı (kendi dize sözlüğü tutmamalı)
- [ ] `PlanApprovalDecision` ile `skipStepIds` verilen adımları plandan atlamalı
- [ ] `AgentRunDeps` / `AgentRunHooks` / `AgentRunSummary` / `PlanApprovalDecision` sözleşmelerini dışa aktarmalı
- [ ] `journal` okumasını enjekte edilen `JournalReader` üzerinden yapmalı

## Olsa iyi olur
- [ ] `apps/desktop`'un agent-service'inin `runAgent` üzerinde ince bir adaptör kalmasını sağlamalı
- [ ] Opsiyonel `summary` alanını konuşma hafızasına eklenmek üzere host'a döndürmeli
- [ ] `ModelRouter` ile turn içinde sağlayıcı/rota seçimini soyutlamalı
- [ ] Plan onayında kısmi onay (bazı adımları atla) desteklemeli
- [ ] Olay yayınını senkron akıştan ayırıp tüketiciyi bloklamamalı
- [ ] `browserHost` seam'ini `BrowserHost` arayüzüne göre tipli tutmalı
- [ ] `pnpm typecheck` · `pnpm lint` · `pnpm test` betiklerini sağlamalı

## Çok niş
- [ ] `requestApproval` reddedildiğinde turn'ü temiz bir `stoppedReason` ile kapatmalı
- [ ] İptal `signal`'i araç çağrısı ortasında geldiğinde yarım kalan işi tutarlı biçimde sonlandırmalı
- [ ] `localInference` verili ama yüklenemiyorsa yine buluta düşebilmeli
- [ ] DAG'da döngüsel bağımlılık tespit edildiğinde planı reddetmeli
- [ ] Journal okunamıyorsa turn'ü tümden düşürmeden ilerleyebilmeli
- [ ] Aynı anda birden çok turn çağrısında deps izolasyonunu korumalı
