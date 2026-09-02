# Research — güvenli tarayıcı tasarım rehberi

> **Ne bu?** Sıfırdan güvenli bir tarayıcı tasarlamanın **genel** kontrol listesi: süreç izolasyonu,
> ağ katmanı, kriptografi, uzantı modeli, güncelleme/imzalama, telemetri, test. Bir rakip incelemesi
> değil; Tepegöz'ün mimarisine karşı bir **çapraz kontrol** listesi.
>
> **Tarih.** Derleme 2026-08-21 · bu formata çevirisi 2026-09-02. **Dil notu.** Türkçe.
> _(Dosya adı eskiden `tor-network-security.md` idi; içeriği Tor'a özgü değil — adı yanıltıcıydı.)_

---

## MVP kontrol listesi ve Tepegöz'ün durumu

| #   | Rehberin maddesi                                                            | Tepegöz'de                                                                                |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | Çok süreçli izolasyon + sandbox (çekirdek yüksek, renderer düşük ayrıcalık) | ✅ Electron süreç modeli + `contextIsolation`/`sandbox`; **ADR-0013 renderer güvenilmez** |
| 2   | Güvenli ağ varsayılanları: HTTPS-only, HSTS, karışık içerik engeli          | 🟡 HTTPS-only tünel-kapsamlı; **global kullanıcı ayarı yok** → gap-listesi §7             |
| 3   | Güçlü kriptografi: TLS 1.2+ (tercihen 1.3), OS CSPRNG                       | ✅ Chromium + `safeStorage`                                                               |
| 4   | Katı same-origin, sınırlı çekirdek izinleri, CSP/CORS                       | ✅ `tepegoz://` sayfaları CSP ihlali sıfır olarak e2e-doğrulanıyor                        |
| 5   | İzleme engelleyici + parmak izi koruması                                    | 🟡 adblock sevk edildi; parmak izi **Faz 2, ADR bekliyor**                                |
| 6   | Güvenli güncelleme, kod imzalama, telemetride anonimleştirme                | ✅ imzalı Windows / notarize macOS; telemetri tek boolean                                 |
| 7   | Derleme-zamanı sertleştirmeler (stack protector, DEP/NX, ASLR/PIE)          | ⬜ Chromium'dan miras; **kendi native kodumuz için yazılı değil**                         |
| 8   | Fuzzing, statik analiz, pentest, ödül programı                              | 🟡 statik analiz + testler var; **fuzzing/pentest yok**                                   |

## Ağ katmanının söyledikleri

- **HPKP ölü.** Sertifika sabitleme artık önerilmiyor (kilitlenme riski); yerine **Certificate
  Transparency** + sağlam iptal kontrolü + kontrollü trust store. ⚠️ Bu bir **hassas nokta**:
  [S6](../../phases/ai-agent/phase-s6-safety-control-plane.md) PR8, Fellou'nun IDOR dersini Faz 3'e
  "transport pinning" olarak iletiyor. O bağlamda pinning **hâlâ geçerli**, çünkü orası uygulama→kendi
  sunucumuz bağlantısı (native/enterprise sınıfı), web platformu HPKP'si değil. Ayrım yazılı olmazsa
  biri gider HPKP başlığı ekler.
- **Şifreli DNS karşılaştırması** (DoT / DoH / DoQ / VPN / proxy) avantaj-dezavantajlarıyla; DoQ düşük
  gecikme, DoH ISS'den fark edilmezlik. Faz 5'in şifreli-DNS satırının kaynağı.
- **HTTPS-Only + HSTS ön yükleme** bir kullanıcı ayarı olarak.

## Alınacaklar / Alınmayacaklar

**Alınacak:**

- **Global HTTPS-Only modu ve HSTS** — bugün yalnızca tünel-kapsamlı; kullanıcıya açık bir ayar olması
  [`../tracks/browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md) §7'de zaten
  yakalanmış.
- **Şifreli DNS seçimi ve politikası** → [phase-5](../../phases/product/phase-5-vpn-network-privacy.md) L10.
- **CT + iptal kontrolü, HPKP değil** — ve Faz 3'ün pinning satırının **hangi anlamda** pinning olduğunu
  yazmak.
- **Derleme-zamanı sertleştirme duruşunu yazıya dökmek** — `packages/native-rs` gerçek koda dönüştüğünde
  bu liste onun kapısı olur.
- **Fuzzing / pentest / açık denetim** — bugün yok; Faz 4'ün olgunlaşma kapsamına ait.

**Alınmayacak:**

- **Sistem geneli proxy/VPN entegrasyonu.** Rehber öneriyor; Tepegöz bunu **bilerek reddediyor** —
  model sekme-başına tünel (ADR-0011), ve OS proxy'si o modeli yıkar. Gap listesi §18 bu reddi zaten
  kaydediyor.

## Kaynaklar

Chromium ve Firefox güvenlik mimarisi dokümantasyonu, OWASP, MDN (HPKP kullanımdan kaldırma), RFC 9250
(DoQ) ve ilgili IETF belgeleri.
