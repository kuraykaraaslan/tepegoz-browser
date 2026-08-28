# desktop-ipc — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Main/preload/renderer arasında paylaşılan typed IPC sözleşmesi: `.` entry'si zod'suz ve preload-safe, `./schemas` entry'si main-process-only zod validator'lar; `Preferences`, `TabInfo`/`TabGroupInfo` ve `TepegozApi` tiplerinin sahibi (ADR-0009).

## Kesinlikle olmalı
- [ ] Paket main / preload / renderer arasında paylaşılan typed IPC sözleşmesini sağlamalı
- [ ] Kanal adları `domain:action` biçiminde olmalı
- [ ] Default `.` entry dependency-free olmalı (sıfır zod import — doğrulanmış)
- [ ] Sandboxed preload `.` entry'yi güvenle import edebilmeli (external npm modülü require edemez)
- [ ] Runtime zod validator'lar ayrı `./schemas` entry'sinde, yalnızca main-process'te olmalı
- [ ] `package.json` `exports`'u `.` ve `./schemas` olarak ayrılmalı
- [ ] Paket `Preferences` tipinin sahibi olmalı (tek kaynak)
- [ ] `Preferences` tam persist-edilen şekli içermeli (theme, locale, telemetry, default AI provider, extensions, MCP servers, agent/local-model config, file-access grants, …)
- [ ] `TabInfo` / `TabGroupInfo` / `TabsState` / `TabGroupColor` wire tiplerinin sahibi olmalı
- [ ] `TepegozApi` preload'un renderer'a açtığı `contextBridge` API şeklini tanımlamalı
- [ ] `IpcChannels` her kanal adı + internal-page adreslerinin haritasını içermeli
- [ ] `IpcBoundaryError` / `encodeBoundaryMessage` / `decodeBoundaryError` ADR-0009 hata transportunu sağlamalı
- [ ] Main tarafı boundary `{ message, statusCode }`'u tek string'e encode etmeli (`"[403] Action blocked by policy"`)
- [ ] Preload o string'i typed `IpcBoundaryError`'a decode etmeli; renderer bare string parse etmemeli
- [ ] `./schemas` renderer'dan gelen her untrusted IPC payload'u için zod validator içermeli
- [ ] Her kanal için bir şema, handler payload'u görmeden önce boundary'de safeParse edilmeli
- [ ] `PUBLIC_SETTING_KEYS` / `SETTINGS_VISIBILITY` / `PublicSettings` / `SettingsHostApi` her preference için fail-closed public/private sınıflandırması sağlamalı
- [ ] Sınıflandırma `Record<keyof Preferences, …>` tipli olmalı — yeni preference sınıflandırılana kadar compile error
- [ ] Cross-cutting DTO re-export'ları (`AgentEvent`, `AgentPlanStep`, `AgentConfig`, `BookmarkEntry`, `HistoryEntry`, `PopupBlockerSettings`, …) type-only olmalı
- [ ] Type-only re-export'lar erase olmalı, preload bundle'a hiçbir şey eklememeli
- [ ] `@tepegoz/preferences` kendi zod şemasını bu tipe `satisfies` ile pinlemeli

## Olsa iyi olur
- [ ] credential / tab / history / bookmark / popup / login / macro / agent kanalları için şemalar bulunmalı
- [ ] `TabMoveSchema` / `TabPinSchema` / `TabGroupCreateSchema` gibi drag-reorder / grouping / pinning şemaları (ADR-0020)
- [ ] `AddProviderKeyInputSchema` / `RemoveKeyByIdSchema` / `ReorderKeysSchema` credential şemaları
- [ ] Kanal adı haritası tek noktada tutulmalı, elle string yazılmamalı
- [ ] `SettingsHostApi` extension'lara yalnızca read-only, curated bir yüzey sunmalı
- [ ] `statusCode` değerleri HTTP-benzeri semantik taşımalı (403 = policy)

## Çok niş
- [ ] `.` entry'ye zod sızması CI'da yakalanmalı (zero-zod doğrulaması)
- [ ] Yeni bir preference `SETTINGS_VISIBILITY`'e eklenmezse build kırılmalı
- [ ] Decode edilemeyen malformed boundary string'i için güvenli fallback olmalı
- [ ] internal-page adresleri kanal haritasında normal kanallardan ayırt edilebilmeli
- [ ] Agent run/approval flow şemaları çok adımlı payload'ları kapsamalı
