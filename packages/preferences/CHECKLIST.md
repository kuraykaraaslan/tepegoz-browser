# preferences — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Kalıcı uygulama tercihleri deposu (theme, locale, telemetry, "run locally" toggle, default AI provider, extension states, MCP servers, …); tip `@tepegoz/desktop-ipc`'ye ait, bu paket zod şemasını ve varsayılanları kurup `satisfies` ile o tipe sabitler.

## Kesinlikle olmalı
- [ ] `PreferenceStore.init({ filePath })` dosyayı yükleyip doğrulamalı
- [ ] Eksik/bozuk dosyada varsayılanlara düşmeli (untrusted kabul: `readJsonFile` + `safeParse`)
- [ ] `getAll()` savunmacı bir kopya döndürmeli (iç duruma referans vermemeli)
- [ ] `update(patch)` patch'i doğrulamalı, birleştirmeli, tüm nesneyi yeniden doğrulamalı, kalıcılaştırmalı ve yeni snapshot döndürmeli
- [ ] Kalıcılaştırma `@tepegoz/json-store` üzerinden yapılmalı
- [ ] `reset()` bir test dikişi olarak sağlanmalı
- [ ] Dosya yolu enjekte edilmeli — Electron olmadan birim-test edilebilir kalmalı
- [ ] `PreferencesSchema` ve `PreferencesPatchSchema` (tam ve kısmi) ile `PreferencesPatch` tipini dışa aktarmalı
- [ ] Şemalar `@tepegoz/desktop-ipc`'nin kanonik enum'larından (`THEME_PREFS`, `LOCALE_PREFS`, `PROVIDER_IDS`, …) kurulmalı
- [ ] Her union için tek yazım olmalı — paket başına yeniden yazılmış kopya olmamalı
- [ ] `DEFAULT_PREFERENCES` varsayılan `Preferences` değerini dışa aktarmalı
- [ ] Şema ve varsayılanlar `satisfies` ile `@tepegoz/desktop-ipc`'nin `Preferences` tipine sabitlenmeli (sessiz drift olmamalı)
- [ ] `PublicSettingsSchema` — eklentilere açılan salt-okunur ayar yüzeyi için runtime doğrulayıcı sağlamalı
- [ ] `PublicSettings` şeklinin `@tepegoz/shared-types`'ta yaşadığını kabul etmeli (burada yalnızca validator)
- [ ] Şu tercih alanlarını kapsamalı: theme, locale, telemetry, "run locally" toggle, default AI provider, extension states, MCP servers, agent panel selections, file-access grants
- [ ] `ThemePrefSchema`, `LocalePrefSchema`, `ProviderPrefSchema`, `ExtensionIdSchema`, `ExtensionStateSchema`, `McpServerPrefSchema` gibi yeniden kullanılabilir alan şemalarını dışa aktarmalı

## Olsa iyi olur
- [ ] `update` yalnızca geçerli patch'leri kabul etmeli, geçersizde mevcut durumu bozmamalı
- [ ] Birleştirme (merge) kısmi patch'te belirtilmeyen alanları korumalı
- [ ] Bilinmeyen/fazladan alanlar doğrulamada güvenli biçimde ele alınmalı
- [ ] `PreferenceStore` varsayılan export ve statik (singleton) bir store olmalı
- [ ] Enum'ları tek kaynaktan türetme, yeni provider/theme eklendiğinde otomatik yansımalı
- [ ] Dosya yazımı atomik olmalı (yarım yazılan JSON sonraki açılışta bozuk sayılmamalı)
- [ ] `getAll` dönüşü mutasyona uğrasa bile store içi durum etkilenmemeli
- [ ] Bozuk dosyadan kurtulurken kullanıcıya sessiz veri kaybı olmadan yeni geçerli varsayılan yazılmalı

## Çok niş
- [ ] `init` çağrılmadan `getAll`/`update` çağrıldığında öngörülebilir davranmalı
- [ ] MCP server tercihleri liste halinde birden çok kayıt tutabilmeli
- [ ] Şemadan düşürülen eski bir tercih alanı dosyada kalmışsa yükte sorun çıkarmamalı
- [ ] Aynı `filePath` ile iki `init` çağrısı tutarlı sonuç vermeli
- [ ] `PublicSettings` yüzeyi tam tercihlerin yalnızca küratörlü bir alt kümesini göstermeli (hassas alanlar sızmamalı)
- [ ] Eşzamanlı `update` çağrıları son-yazan-kazanır olsa bile şemayı hep geçerli bırakmalı
