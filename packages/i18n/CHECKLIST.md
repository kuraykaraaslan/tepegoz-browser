# i18n — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> i18n çekirdeği + runtime: İngilizce birincil/kaynak locale, Türkçe first-class; paylaşılan cross-cutting core (`common`/`window`/`errors`) ve her sahibin kullandığı makine.

## Kesinlikle olmalı
- [ ] `resources` (`Record<Locale, Resources>`) nesnesini dışa vermeli
- [ ] Paylaşılan çekirdek `coreDict`'i (`common` / `window` / `errors`) dışa vermeli
- [ ] `Resources = typeof en` ile eksik/uyumsuz çekirdek anahtarını build hatası yapmalı
- [ ] Parite testi tüm locale'lerde anahtar kümelerinin eşitliğini doğrulamalı
- [ ] `SUPPORTED_LOCALES` listesini dışa vermeli
- [ ] `Locale` tipini dışa vermeli
- [ ] `DEFAULT_LOCALE` `'en'` olmalı
- [ ] `resolveLocale(tag)` bir dil etiketini desteklenen locale'e çözmeli
- [ ] `defineDict({ en, tr })` ile paket sahibinin kendi sözlüğünü tanımlamasını sağlamalı
- [ ] `tr`'yi `typeof en` tipleyerek eksik Türkçe anahtarı sözlük başına build hatası yapmalı
- [ ] `pick(dict, locale)` React'siz erişimciyi (ana süreç için) sağlamalı
- [ ] `Dict<T>` tipini dışa vermeli
- [ ] `@tepegoz/i18n` girişi framework-agnostik olmalı (main/backend için güvenli, React importu yok)
- [ ] `@tepegoz/i18n/react` girişinde `I18nProvider({ locale, children })` sağlamalı
- [ ] `useLocale()` ve `useT(dict)` ile bir bileşen kendi sözlüğünden self-localize olabilmeli
- [ ] `@tepegoz/i18n/testing` girişinde `keyPaths(obj)` yardımcı fonksiyonunu sağlamalı

## Olsa iyi olur
- [ ] `useT(dict)` çeviri eksikse `en` fallback'e düşmeli
- [ ] Yalnızca cross-cutting `common`/`window`/`errors` string'lerini barındırmalı; feature string'leri paketlere bırakmalı
- [ ] `I18nProvider` kök yakınında bir kez mount edilebilmeli (`App` ve `PopupApp`)
- [ ] `keyPaths` her sahip paketin parite testinde yeniden kullanılabilmeli
- [ ] İngilizce kaynak/birincil, Türkçe first-class olarak ele alınmalı
- [ ] `resolveLocale` bölge alt-etiketli (`tr-TR`, `en-US`) girişleri temel locale'e indirmeli
- [ ] Hardcoded UI string'lerini yasaklayan lint kuralına zemin sağlamalı (Phase 1a)

## Çok niş
- [ ] Bilinmeyen/boş dil etiketinde `resolveLocale` `DEFAULT_LOCALE`'e düşmeli
- [ ] `defineDict` yalnızca `en` ve `tr` anahtarlarını kabul edecek şekilde tiplenebilmeli
- [ ] `pick` ana süreçte React runtime'ı yüklemeden çalışmalı
- [ ] Parite testi anahtar sırası farkını değil yalnızca küme farkını raporlamalı
- [ ] `Resources` tipi yeni bir locale eklendiğinde tüm anahtarları zorunlu kılmalı
