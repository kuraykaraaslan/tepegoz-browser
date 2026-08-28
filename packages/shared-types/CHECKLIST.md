# shared-types — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Katmanlar arası sözleşmelerin (zod şemaları + türetilen tipler) tek doğruluk kaynağı: her paket `z.infer` tiplerini buradan tüketir, şemalar asla kopyalanmaz, tüm trust boundary'ler (`safeParse`) bunlara karşı doğrular.

## Kesinlikle olmalı
- [ ] Katmanlar arası sözleşmeler için tek doğruluk kaynağı (single source of truth) olmalı
- [ ] Her sözleşmeyi zod şeması + ondan türetilen (`z.infer`) tip olarak sunmalı
- [ ] Şemalar asla kopyalanmamalı — diğer paketler tipi buradan tüketmeli
- [ ] Tüm trust boundary'ler (`safeParse`) bu şemalara karşı doğrulamalı
- [ ] Enum'ları `z.enum` olarak sağlamalı: `AIProviderEnum`, `PolicyDecisionEnum`, `HITLStatusEnum`, `RiskLevelEnum`, `McpTransportEnum`, `EventTypeEnum`, `ToolSourceEnum`, `ToolErrorCodeEnum`
- [ ] Event Journal için `EventSchema` / `EventRecord` — append-only fact (`lsn`, `deviceId`, `cas://` blobRef) tanımlamalı
- [ ] `EventInputSchema` / `EventInput` — append girdisi; `lsn` / `deviceId` journal tarafından atanır
- [ ] `ToolNameSchema` — `{domain}_{verb}_{noun}` biçimini zorlamalı
- [ ] `ToolDescriptorSchema` ve `ToolErrorSchema` dışa aktarılmalı
- [ ] Her tip yalnızca `z.infer` ile şemadan türetilmeli, elle yazılmamalı

## Olsa iyi olur
- [ ] `EventInput` şeması `lsn` / `deviceId` alanlarını girdi olarak kabul etmemeli (journal atar)
- [ ] `cas://` blobRef formatı şema düzeyinde doğrulanmalı
- [ ] Enum değerleri tek yazımla tutulmalı, tüketen paketlerde yeniden yazılmamalı
- [ ] Şema değişiklikleri kırıcı olduğunda tüm tüketen paketlerde tip hatası olarak görünmeli (sessiz drift yok)
- [ ] `ToolErrorSchema` hata kodlarını `ToolErrorCodeEnum` ile hizalı taşımalı
- [ ] Paket Electron/Node runtime'ına bağımsız, saf şema/tip olmalı

## Çok niş
- [ ] Geçersiz `{domain}_{verb}_{noun}` tool adları `safeParse` ile net biçimde reddedilmeli
- [ ] Bilinmeyen enum değeri taşıyan bir olay boundary'de sessizce kabul edilmemeli
- [ ] `EventRecord` alanları geriye dönük uyumlu biçimde genişletilebilmeli (opsiyonel alan ekleme)
- [ ] Aynı şemanın hem tam hem partial (input) türevi tutarlı alan adları kullanmalı
- [ ] `build` çıktısı tip tanımlarını (`.d.ts`) diğer paketlere yayabilmeli
