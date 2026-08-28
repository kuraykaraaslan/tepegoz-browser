# password-ui — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Parola yöneticisi özellik-sayfası UI'ı: tek bir kabuk değil, üç bağımsız parça — `CredentialsSettings` (kayıtlı kimlik-bilgisi listesi + ekle/düzenle formu + sil), `ImportExportPanel` (CSV sürükle-bırak import + Google-CSV export) ve `AutofillSuggestion` (eşleşen giriş alanı üzerinde açılan otomatik-doldur menüsü).

## Kesinlikle olmalı
- [ ] `CredentialsSettings` kayıtlı kimlik-bilgisi listesini gösterebilmeli
- [ ] `CredentialsSettings` listede arama/filtreleme sunmalı
- [ ] `CredentialsSettings` ekleme formu sunmalı
- [ ] `CredentialsSettings` düzenleme formu sunmalı
- [ ] `CredentialsSettings` bir kimlik-bilgisini silebilmeli
- [ ] Üç parçanın her biri kendi yerel UI durumunu (arama/form/import-export) sahiplenmeli
- [ ] Kendi kalıcılık (persistence) mantığı olmamalı
- [ ] `ImportExportPanel` sürükle-bırak ile CSV içe aktarımı desteklemeli
- [ ] `ImportExportPanel` dosya seçici ile CSV içe aktarımı desteklemeli
- [ ] `ImportExportPanel` Google-CSV dışa aktarım kontrolü sunmalı
- [ ] `AutofillSuggestion` tespit edilen giriş alanının yanında açılır menü göstermeli
- [ ] `AutofillSuggestion` `url` + `matches` almalı, `onFill(id)` ve `onDismiss()` sunmalı
- [ ] Veri okuma/yazma işlemleri async callback olarak enjekte edilmeli (doğrudan Electron köprü bağımlılığı yok)
- [ ] Callback'ler `@tepegoz/desktop-ipc`'nin `LoginCredentialMeta` / `LoginImportResult` tiplerine göre tiplenmeli
- [ ] Kendi i18n sözlüğünü `useT(passwordUiDict)` ile taşımalı
- [ ] Hiçbir kullanıcıya görünür metni sabit kodlamamalı
- [ ] `@tepegoz/ui`'yi import etmemeli; paylaşılan atomları yansıtan yerel Tailwind token sınıfları kullanmalı
- [ ] Her bileşen kendi enjekte-props sözleşme tipini dışa vermeli
- [ ] Üç bileşen bağımsız kullanılabilmeli, tek kabuk olarak değil
- [ ] `passwordUiDict`'i dışa vermeli

## Olsa iyi olur
- [ ] Parola alanı varsayılan olarak maskeli, "göster" düğmesiyle açılabilir olmalı
- [ ] İçe aktarım sonrası özet (imported/skipped/errors) göstermeli
- [ ] Silmeden önce onay istemeli
- [ ] Kimlik-bilgisi listesi için boş durum (empty state) göstermeli
- [ ] Dışa aktarılacak bir şey yokken export kontrolünü pasifleştirmeli
- [ ] `AutofillSuggestion` klavye gezinmesi + Enter ile doldur, Esc ile kapat sunmalı
- [ ] Satırda "kullanıcı adını kopyala" / "parolayı kopyala" eylemleri sunmalı
- [ ] İçe aktarım bırakma alanında sürükle-üzerinde (drag-over) görsel durumu göstermeli
- [ ] `onAdd` öncesi form doğrulaması (url + kullanıcı adı zorunlu) yapmalı
- [ ] Kimlik-bilgisi metadata'sından satır başına favicon / site etiketi göstermeli

## Çok niş
- [ ] İçe aktarım alanına bırakılan CSV olmayan dosyayı net bir mesajla reddetmeli
- [ ] `AutofillSuggestion` giriş alanı görünüm alanı kenarına yakınken kendini yeniden konumlandırmalı
- [ ] Ayarlar sayfası ve açılır menü için RTL yerleşimini desteklemeli
- [ ] Çok uzun listelerde tepkisel (responsive) kalmalı
- [ ] Bir kimlik-bilgisini, değişmeyen parolayı yeniden yazmadan düzenleyebilmeli
- [ ] Otomatik-doldur menüsü kaydırma / dışına tıklama / sekme odak kaybında kapanmalı
