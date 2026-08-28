# libs — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Katmanlar arası paylaşılan altyapı (framework-agnostik, Electron importu yok): `AppError`/`toBoundary`, zod ile parse edilen `env`, redaksiyonlu `Logger`, sabit `Messages` katalogu.

## Kesinlikle olmalı
- [ ] `AppError(message, statusCode)` sınıfını sağlamalı; servisler bunu fırlatır
- [ ] `toBoundary(err)` her hatayı `{ message, statusCode }` biçimine indirmeli
- [ ] `statusCode` değerleri HTTP semantiğinde olmalı (ADR-0009)
- [ ] Bilinmeyen/beklenmeyen hataları `toBoundary` güvenli bir genel statusCode'a eşlemeli
- [ ] `env` nesnesi tüm yapılandırmayı import anında bir kez zod ile parse etmeli
- [ ] Geçersiz env'de uygulamayı başlangıçta çökertmeli (fail-fast)
- [ ] BYO API anahtarlarını env değişkeni olarak KABUL ETMEMELİ (OS anahtarlığına ait)
- [ ] `Logger` statik bir logger olarak sunulmalı
- [ ] `Logger.redact` ile secret/PII redaksiyonu yapmalı
- [ ] Event Journal ve Agent Console ile aynı redaksiyon mantığını paylaşmalı
- [ ] `Messages` sabitleri operatör/log mesajlarını tek yerde tutmalı
- [ ] Inline throw string'lerine izin vermemeli; mesajlar `Messages`'tan gelmeli
- [ ] Electron importu içermemeli; katmanlar arası framework-agnostik kalmalı

## Olsa iyi olur
- [ ] `Logger.redact` iç içe nesnelerde ve dizilerde de gizli alanları maskelemeli
- [ ] `env` parse hatası hangi değişkenin neden geçersiz olduğunu söylemeli
- [ ] `AppError` orijinal `cause`'u zincirleyebilmeli
- [ ] `toBoundary` zaten `AppError` olan hataları olduğu gibi geçirmeli
- [ ] `Messages` katalogu i18n'den bağımsız, sabit operatör dili olmalı
- [ ] `Logger` farklı seviyeler (info/warn/error) sunmalı
- [ ] Redaksiyon uygulanmış çıktı hâlâ okunabilir/teşhis edilebilir olmalı

## Çok niş
- [ ] Redaksiyon, token benzeri uzun rastgele string'leri kalıpla yakalayabilmeli
- [ ] `env` testlerde deterministik olacak şekilde bir kez dondurulmalı
- [ ] Döngüsel referans içeren hata nesnelerinde `toBoundary` güvenli davranmalı
- [ ] `AppError.statusCode` verilmezse makul bir varsayılana düşmeli
- [ ] Log çıktısı, secret sızıntısını önlemek için serialize öncesi redaksiyondan geçmeli
