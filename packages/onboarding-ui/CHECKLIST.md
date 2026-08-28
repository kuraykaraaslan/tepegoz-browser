# onboarding-ui — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Masaüstü kabuğu için ilk-çalıştırma karşılama/onboarding arayüzü: akışın sunumunu ve i18n'ini sahiplenir, Electron/preload eylemleri masaüstü uygulaması tarafından prop olarak enjekte edilir.

## Kesinlikle olmalı
- [ ] Masaüstü kabuğu için ilk-çalıştırma karşılama ekranını render edebilmeli
- [ ] Onboarding'i çok adımlı bir akış olarak sunabilmeli
- [ ] Tüm onboarding metinlerini kendi i18n sözlüğünde sahiplenmeli
- [ ] Hiçbir kullanıcıya görünür metni sabit kodlamamalı
- [ ] Electron/preload eylemlerini prop olarak enjekte alabilmeli (doğrudan köprü bağımlılığı olmamalı)
- [ ] Yalnızca sunum yapmalı; onboarding durumunu kendisi kalıcılaştırmamalı
- [ ] Akış tamamlandığında host'a bunu bildirmeli (ör. `onComplete`/`onFinish` prop'u)
- [ ] Kullanıcının adımlar arasında ileri gitmesine izin vermeli
- [ ] Kullanıcının önceki adıma geri dönmesine izin vermeli
- [ ] Akışı atlama / kapatma seçeneği sunmalı
- [ ] İngilizce öncelikli, Türkçe birinci sınıf olacak şekilde yerelleştirilmiş olmalı

## Olsa iyi olur
- [ ] Adım ilerleme göstergesi sunabilmeli
- [ ] Adımlar arasında klavye gezinmesini desteklemeli
- [ ] "Varsayılan tarayıcı yap" adımını enjekte edilen bir eylemle bağlayabilmeli
- [ ] "Başka tarayıcıdan içe aktar" adımını enjekte edilen bir eylemle sunabilmeli
- [ ] Tema/görünüm seçimi adımı sunabilmeli
- [ ] Akış aktifken odağı akış içinde tutabilmeli (focus trap)
- [ ] Kullanıcının kaldığı adımı (enjekte edilen durum üzerinden) hatırlayabilmeli
- [ ] Son adımda "taramaya başla" çağrısı (CTA) sunabilmeli

## Çok niş
- [ ] `prefers-reduced-motion` altında adım geçişlerini sadeleştirebilmeli
- [ ] Akış için RTL yerleşimini desteklemeli
- [ ] Akışı yalnızca ilk çalıştırmada değil, sonradan ayarlardan da açılabilir kılmalı
- [ ] Enjekte edilen bir eylem prop'u eksikse akışı yine de düzgün render edebilmeli
- [ ] Telemetri/opt-in onay adımı sunabilmeli
