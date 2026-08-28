# mcp-client — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Dış MCP sunucularına bağlanıp onların araçlarını tek CapabilityRegistry/ToolGateway PEP'ine sıradan ToolDescriptor olarak sunan, her SDK yanıtını zod ile yeniden doğrulayan Electron-free L5 MCP istemcisi.

## Kesinlikle olmalı
- [ ] Yapılandırılmış her MCP sunucusuna başlangıçta bağlanabilmeli (McpSupervisor)
- [ ] Bağlantı hatası/kopması durumunda üstel geri çekilme (exponential backoff) ile yeniden bağlanmayı denemeli
- [ ] Bir sunucu koptuğunda o sunucunun tüm araçlarını CapabilityRegistry'den geri çekmeli (unregister)
- [ ] Yapılandırma değiştiğinde reconcile() ile sunucu kümesini yeniden uzlaştırmalı
- [ ] MCP araçlarını sıradan ToolDescriptor olarak tek CapabilityRegistry/ToolGateway PEP'ine sunmalı — planner, Policy Kernel, HITL, taint, audit yerel araçlarla ayırt edememeli
- [ ] Canlı bir sunucu bağlantısında tools/list ile araçları keşfetmeli (McpConnection)
- [ ] tools/call çağrılarını ters isim haritası üzerinden doğru sunucuya yönlendirmeli
- [ ] Her MCP aracı için `{domain}_{verb}_{noun}` biçiminde sentetik araç kimliği üretmeli (buildSyntheticId)
- [ ] Sentetik araç kimliklerini tüm sunucular arasında benzersiz tutmalı (tek paylaşılan NameMapper)
- [ ] Sentetik kimlikten kaynak sunucu + orijinal araç adına ters haritalama yapabilmeli
- [ ] MCP SDK'nın her yanıtını zod ile yeniden doğrulamalı — SDK asla güven sınırı olmamalı
- [ ] Sunucu başına araç sayısını MAX_TOOLS_PER_SERVER ile sınırlamalı
- [ ] Araç şeması boyutunu MAX_SCHEMA_BYTES ile sınırlamalı — düşman sunucu planner istemini dolduramamalı
- [ ] McpServerConfigSchema ile per-sunucu yapılandırmayı güven sınırında doğrulamalı
- [ ] MCP araç açıklamalarını (annotations) bir dangerClass'a eşlemeli (dangerClassFor)
- [ ] Bilinmeyen/eksik annotation'da en kısıtlayıcı dangerClass'a düşmeli (fail-safe)
- [ ] Bir MCP aracının idempotency gerektirip gerektirmediğini annotation'lardan türetmeli (requiresIdempotencyFor)
- [ ] MCP aracının JSON Schema'sından ajv tabanlı girdi doğrulayıcı kurabilmeli (jsonSchemaValidator)
- [ ] SDK Client ve StdioClientTransport'u desktop katmanından enjekte alabilmeli — kendi içinde Electron'a bağlı olmamalı
- [ ] Per-sunucu bağlantı durumunu (McpServerState / McpServerStatus) Settings'e sunabilmeli
- [ ] McpToolSchema / McpToolListSchema / McpToolResultSchema / McpToolAnnotationsSchema zod şemalarını sağlamalı

## Olsa iyi olur
- [ ] serverSlug ile sunucu adından kararlı, kısa bir slug üretmeli
- [ ] tokenize ile araç adlarını anlamlı parçalara ayırabilmeli
- [ ] verbFor ile bir araç adından uygun fiil bileşeni seçmeli
- [ ] Aynı araç adını farklı sunuculardan sunanlarda çakışmayı benzersizleştirerek çözmeli
- [ ] Yeniden bağlanma denemeleri arasında araçları çift kaydetmemeli
- [ ] Sunucu yeniden bağlandığında araçlarını yeniden keşfedip yeniden kaydetmeli
- [ ] McpSupervisorDeps / McpConnectionDeps üzerinden tüm bağımlılıkları enjekte alabilmeli (test edilebilirlik)
- [ ] McpClientLike arayüzü ile gerçek SDK Client yerine sahte bir istemci enjekte edilebilmeli

## Çok niş
- [ ] Düşman bir sunucu aşırı büyük şema göndererek planner prompt'unu şişirmeye çalıştığında MAX_SCHEMA_BYTES ile kesmeli
- [ ] Aynı anda çok sayıda sunucu koptuğunda geri çekilme zamanlayıcılarının birbirini boğmasını önlemeli
- [ ] Bir sunucu tools/list'te yinelenen araç adları döndürdüğünde NameMapper bunları benzersizleştirmeli
- [ ] Annotation'ı hiç olmayan bir MCP aracının yine de dangerClass + idempotency kararı alabilmesi
- [ ] Config'ten bir sunucu tamamen kaldırıldığında reconcile() o sunucuyu kapatıp araçlarını temizlemeli
- [ ] Yeni bir sunucu config'e eklendiğinde reconcile() yalnızca onu bağlamalı, diğerlerini yeniden başlatmamalı
- [ ] tools/call sonucu McpToolResultSchema'ya uymuyorsa hata olarak ele alınmalı, ham sonuç geçirilmemeli
