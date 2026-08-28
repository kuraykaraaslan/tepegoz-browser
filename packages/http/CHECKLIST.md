# http — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Tüm outbound HTTP için merkezi axios seam'i: timeout, redaction ve error mapping tek yerde (framework-agnostic, Electron importsuz).

## Kesinlikle olmalı
- [ ] `createHttpClient(options)` yapılandırılmış bir `AxiosInstance` döndürmeli
- [ ] Varsayılan JSON content type ayarlamalı
- [ ] Per-request timeout uygulamalı (varsayılan 30s, çağrı başına override edilebilir)
- [ ] Response interceptor her rejection'ı `AppError`'a çevirmeli
- [ ] `baseURL` / `headers` seçeneklerini bir provider client için kabul etmeli
- [ ] `http` — base URL / auth olmadan ad-hoc çağrılar için paylaşılan varsayılan instance sunmalı
- [ ] `normalizeHttpError(err)` saf bir axios-error → `AppError` mapper olmalı (yan etkisiz)
- [ ] 4xx hatalarını passthrough yapmalı (status korunmalı)
- [ ] 4xx dışındaki her şeyi 503'e çevirmeli
- [ ] Timeout/cancel durumlarını 503'e çevirmeli
- [ ] Hata mesajına `Logger.redact` uygulamalı
- [ ] `HttpMessages` sabit client mesajlarını dışa aktarmalı
- [ ] Framework-agnostic olmalı — Electron importu içermemeli
- [ ] Tüm outbound HTTP için tek axios seam olmalı; vendor SDK'ya gerek bırakmamalı
- [ ] Çağrı başına `signal` (iptal) ve `timeout` geçişini desteklemeli

## Olsa iyi olur
- [ ] Aynı redaction/timeout/error-mapping davranışını her provider client'ına otomatik taşımalı
- [ ] `normalizeHttpError`'ı interceptor dışında da ayrı ayrı çağrılabilir tutmalı
- [ ] Timeout'u per-call override ederken instance varsayılanını bozmamalı
- [ ] Yanıt gövdesindeki hassas alanları da loglamadan önce redakte etmeli
- [ ] 4xx passthrough'da orijinal sunucu mesajını (redakte edilmiş) korumalı
- [ ] `HttpMessages` mesajları tutarlılık için tek yerde tutulmalı

## Çok niş
- [ ] Yanıtsız ağ hatası (DNS/bağlantı reddi) durumunu da 503'e normalize etmeli
- [ ] Interceptor zincirine ek interceptor eklenmesine (genişletme) izin vermeli
- [ ] Çok büyük hata gövdelerinde redaction'ı makul sürede tamamlamalı
- [ ] Axios'un `CanceledError`'ını timeout'tan ayırt edip yine 503'e çevirmeli
- [ ] `baseURL` verilmiş instance'ta mutlak URL'li çağrıların davranışı öngörülebilir olmalı
