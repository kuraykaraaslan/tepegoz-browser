# extension-sdk — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Tepegöz iç eklentileri için geliştirici API'si: zod manifest şeması + agent-çağrılabilir capability sözleşmesi + senkron action interceptor'lar (ADR-0021/0024).

## Kesinlikle olmalı
- [ ] `ExtensionManifestSchema` ile web-extension manifestini yansıtan bildirimsel, sürümlü bir sözleşme tanımlamalı
- [ ] Manifest `id`'sini reverse-DNS `EXTENSION_ID_RE` desenine göre doğrulamalı
- [ ] `name`/`version`/`description` ve bir icon slug alanlarını zorunlu kılmalı
- [ ] Bildirilen `surfaces` enum'unu (`popup`/`modal`/`panel`/`sidebar`/`page`) kısıtlamalı
- [ ] Toolbar `actions`'ı (click/double-click bağlamaları) varsayılanlayıp bildirilen surface'lere karşı çapraz doğrulamalı
- [ ] Per-locale `labels` desteklemeli
- [ ] `permissions`'ı kapalı enum tutmalı — serbest metin string kabul etmemeli
- [ ] Opsiyonel `mcpServer` bildirimini desteklemeli
- [ ] `defineExtension` geçersiz manifestte throw etmeli (dev-time sözleşme)
- [ ] `validateManifest` güvenilmeyen/üçüncü-taraf manifestler için throw etmeyen `safeParse` formu olmalı
- [ ] `McpServerDeclSchema` ile bir eklentinin sağladığı MCP sunucusunu tanımlamalı (araçları ToolGateway PEP üzerinden agent'a açılsın)
- [ ] MCP bildiriminde bugün yalnızca `stdio`'yu geçerli kabul etmeli; `http_sse` rezerve kalmalı
- [ ] `EXTENSION_ID_RE`'yi tek kaynak olarak dışa aktarmalı (host'un id doğrulayıcıları paylaşsın)
- [ ] `capability(def)` araç id'sini paylaşılan `ToolNameSchema`'ya karşı doğrulamalı
- [ ] `capability(def)` yazarın tanımını tam bir `ToolDescriptor` + validator + handler'a normalize etmeli
- [ ] `defineCapabilities(extensionId, capabilities)` eklenti id'sini doğrulamalı
- [ ] `defineCapabilities` yinelenen capability id'lerini reddetmeli
- [ ] `defineCapabilities` her descriptor'a `provenance = extensionId` damgası basmalı (atıf/audit)
- [ ] `capability`/`defineCapabilities` geçersiz tanımda throw etmeli (dev-time sözleşme)
- [ ] `defineActionInterceptors(extensionId, defs)` ile senkron allow/deny predikatları tanımlamalı (`popup:open`, `tab:create`, `tab:close`, `navigation:navigate`)
- [ ] Action interceptor'lar INLINE ve senkron olmalı — Promise kabul edilmemeli
- [ ] `defineActionInterceptors` eklenti id'sini doğrulayıp her interceptor'a damgalamalı
- [ ] `ActionType`/`ActionContext`'i interceptable aksiyonların kapalı birleşimi + tipli context olarak tek kaynakta tutmalı
- [ ] Yalnızca `@tepegoz/shared-types` ve zod'a bağımlı olmalı

## Olsa iyi olur
- [ ] `ExtensionSurfaceKindSchema`/`ExtensionSurfaceKind` enum ve tipini ayrı dışa aktarmalı
- [ ] `McpServerDecl` tipini dışa aktarmalı
- [ ] `ExtensionCapabilityDef`/`ExtensionCapability`/`ExtensionCapabilitySet` üçlüsünü (yazar-yüzü, normalize, per-extension set) ayırmalı
- [ ] `ActionInterceptorDef`/`ActionInterceptor`/`ActionInterceptorSet` üçlüsünü ayırmalı
- [ ] Bir action'a hem click hem double-click bağlanması gibi çakışmaları çözmeli/varsayılanlamalı
- [ ] Manifest hata mesajları hangi alanın neden geçersiz olduğunu açıkça söylemeli
- [ ] `defineExtension` ile `validateManifest` aynı şema üzerinden çalışıp tutarlı sonuç vermeli
- [ ] Bildirilmemiş bir surface'e action bağlayan manifesti reddetmeli

## Çok niş
- [ ] Rezerve/boş segmentli ama desene uyan reverse-DNS id'leri reddetmeli
- [ ] `http_sse` MCP transport'u bildirildiğinde bugün "rezerve/desteklenmiyor" biçiminde net davranmalı
- [ ] `ActionType` birleşimine yeni bir aksiyon eklendiğinde tek dosyada değişiklikle yayılmalı
- [ ] Çok sayıda locale içeren `labels` haritasını makul biçimde doğrulamalı
- [ ] `ToolNameSchema`'ya uymayan capability id'sinde açıklayıcı dev-time hata üretmeli
