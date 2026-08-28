# agent-eval — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Dev-only, `private`, uygulamaya asla girmeyen "gerçek sonuç" eval harness'i: gerçek bir agent'ın gerçek sayfaları sürüp ground-truth ile puanlandığı, AI yetkinlik track'inin ölçüm omurgası.

## Kesinlikle olmalı
- [ ] Senaryo registry'sini `scenarios/*.json` dosyalarından yüklemeli
- [ ] Yüklenen her senaryo girişini `safeParse` ile doğrulamalı
- [ ] Yeni bir senaryo eklemek tek bir JSON girişi kadar olmalı (kod değişikliği gerektirmemeli)
- [ ] `EvalScenario` şemasını `@tepegoz/shared-types`'tan almalı, kendi kopyasını tutmamalı
- [ ] Geçersiz/bozuk senaryo JSON'ını sessizce yutmadan reddetmeli
- [ ] `test-fixtures/sites/` altını servis eden yerel bir HTTP fixture sunucusu sağlamalı (bulut bağımlılığı yok)
- [ ] Fixture sayfaları deterministik olmalı — aynı senaryo her koşuda aynı DOM'u vermeli
- [ ] Ground-truth (DOM/değer assertion) skorlamayı birincil skorlama yolu yapmalı
- [ ] LLM-judge'ı yalnızca `judgeRubric` içeren açık uçlu senaryolar için, ground-truth'a ikincil olarak kullanmalı
- [ ] Judge'ın model çağrısını enjekte edilebilir tutmalı; prompt üretimi ve verdict ayrıştırması saf ve test edilebilir olmalı
- [ ] Judge↔insan uyum oranını `calibration/human-labels.json`'a göre hesaplamalı
- [ ] Uyum oranını rapora yazmalı ki kayan (drift eden) bir judge görünür olsun
- [ ] `AcceptanceMetrics`'i toplayıp raporu üretmeli
- [ ] Held-out senaryoları raporda ayrı bölmeli
- [ ] Tam pass/fail tablosu + makine-okunur JSON artifact üretmeli
- [ ] Metrik sözleşmesini (`recordFromOutcomes` / `summarizeAcceptanceRuns`) `@tepegoz/orchestrator`'dan yeniden kullanmalı, çoğaltmamalı
- [ ] `_electron` harness gerçek uygulamayı başlatıp her senaryoyu (scripted veya live) sürmeli
- [ ] Scripted tier bulut anahtarı olmadan, gerçek uygulamayı yerel fixture'lar üzerinde sürebilmeli
- [ ] Scripted tier yalnızca scripted sequence'i olan senaryoları koşmalı; diğerlerini atlayıp loglamalı
- [ ] Live tier tüm registry'yi gerçek ürün modeliyle koşmalı
- [ ] Uygulamayı `TEPEGOZ_EVAL=1` ile Electron batch modda çalıştıran hook production'da inert olmalı
- [ ] `private` ve dev-only kalmalı — uygulama paketine asla girmemeli
- [ ] `pnpm test` saf modülleri (registry/scorer/report/judge/calibration) tarayıcısız koşabilmeli
- [ ] `pnpm eval` bloklayan bir CI gate'i olmamalı (out-of-band çalışmalı)

## Olsa iyi olur
- [ ] Live tier'i provider seçimiyle (`TEPEGOZ_EVAL_PROVIDER`) çalıştırabilmeli
- [ ] API anahtarını `TEPEGOZ_EVAL_API_KEY` env değişkeninden almalı, repoya gömmemeli
- [ ] Nightly non-blocking workflow JSON artifact'ini yüklemeli
- [ ] Pass-rate regresyonunda uyarı vermeli (hard-fail değil)
- [ ] Atlanan senaryolar için sebebi (scripted sequence yok) loglara yazmalı
- [ ] Scripted ve live tier'ları tek harness'tan çalıştırabilmeli
- [ ] Rapor artifact'i koşular arası karşılaştırılabilir (stabil şema) olmalı
- [ ] `TEPEGOZ_EVAL_MODE` ayarlanmadığında güvenli varsayılan (scripted) davranmalı
- [ ] Live tier'in Electron `better-sqlite3` ABI gereksinimini belgelemeli/kontrol etmeli

## Çok niş
- [ ] Judge verdict formatı beklenmeyen model çıktısında bile ayrıştırılabilir olmalı
- [ ] `calibration/human-labels.json` eksik/boşsa uyum oranını raporda "hesaplanamadı" olarak göstermeli
- [ ] Fixture sunucusu port çakışmasında deterministik biçimde başka porta düşebilmeli
- [ ] Bir senaryo hem scripted sequence hem `judgeRubric` içeriyorsa öncelik ground-truth'ta kalmalı
- [ ] Nightly çalıştırma Electron ABI ortamında koşarken `pnpm test`'in Node ABI'sini bozmamalı
- [ ] Registry'de yinelenen senaryo id'lerini tespit etmeli
- [ ] Held-out set boşsa rapor yine de geçerli bir tablo üretmeli
