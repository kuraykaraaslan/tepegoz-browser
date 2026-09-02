# Research — VPN güvenliğini zayıflatan etkenler

> **Ne bu?** VPN'in gerçekte neyi koruduğu, nerede sızdırdığı ve bir **tarayıcı geliştiricisi** için ne
> anlama geldiği. Alan araştırması; rakip incelemesi değil.
>
> **Tarih.** Derleme 2026-08-21 · bu formata çevirisi 2026-09-02. **Dil notu.** Türkçe.
> **Sahibi fazlar:** [phase-5](../../phases/product/phase-5-vpn-network-privacy.md) ·
> [phase-2](../../phases/product/phase-2-adapters-safe-browsing.md) (parmak izi stratejisi).

---

## Ne söylüyor

**VPN görünürlüğü yeniden dağıtır, yok etmez.** ISS'den sakladığınızın önemli kısmını VPN/proxy
operatörü görür. Tarayıcı seviyesinde entegrasyon geliştiriyorsanız _"ISS'den gizleme"_ vaadini
_"uç noktadan gizleme"_ ile karıştırmamak ve **güven kaymasını kullanıcıya açıkça anlatmak** zorundasınız.

**Sızıntı yüzeyleri:** DNS, IPv6, WebRTC, meta-veri ve trafik analizi; protokol/yapılandırma kusurları;
anahtar yönetimi; zamanlama saldırıları ve kötü amaçlı sunucular.

**Tarayıcı tarafı kararlar:**

- **WebRTC** — özel IP ifşasını daraltmak, mDNS obfuscation'ı etkin tutmak, non-proxied UDP'yi politikayla
  sınırlamak.
- **ECH** — öncelik listesinde yukarıda olmalı; SNI'daki alan adı görünürlüğünü kapatır. Ama config DNS
  üzerinden geldiği için **şifreli DNS ile birlikte** anlam kazanır, ve hedef IP ile trafik şeklini
  gizlemez.
- **QUIC** — connection-ID rotasyonu bir **gizlilik** ayarı olarak tasarlanmalı, yalnızca performans
  değil; yanlış uygulanırsa parmak izine döner.
- **Anti-fingerprinting** — "her şeyi rastgeleleştir" değil. W3C rehberi ve Firefox pratiği
  **normalize / null / partition**'ı önce koyuyor; doğru sıra **entropi bütçesini küçültmek**, sonra
  gerçekten gereken yerde kontrollü gürültü.

**Güvenli varsayılan temel çizgisi:** HTTPS-only + HSTS + karışık içerik yükseltme · DoH/DoT/DDR ·
WebRTC politikası · çerez/storage'da `Secure`/`HttpOnly`/`SameSite` + partitioning · `Referrer-Policy`
ve Client Hints minimizasyonu · uzantılarda en-az-yetki + imzalama · telemetride veri minimizasyonu.

## Alınacaklar / Alınmayacaklar

**Alınacak:**

- **ECH**, **şifreli DNS'in güven-kayması politikası**, ve **QUIC CID rotasyonu** → Faz 5 L10'a satır
  olarak indi.
- **WebRTC yerel-IP sızıntısı bir kill-switch meselesidir**, gizlilik tercihi değil — tünele bağlı bir
  partition için host-candidate ifşası engellenmeli. Faz 5 L10'da.
- **Parmak izi strateji sırası** → Faz 2'nin fingerprinting ADR çerçevesine girdi; karşı örnek
  [`research-brave.md`](research-brave.md)'nin farbling'i.
- **"Tünel neyi gizlemez" açıkça yazılmalı** — Faz 5'in açıklama metni satırı.
- **Güvenli varsayılan temel çizgisi** bir kontrol listesi olarak; çoğu zaten sevk edilmiş, eksikleri
  gap-listesinde.

**Alınmayacak:**

- **Kendi VPN altyapımızı işletmek** — Faz 5 BYO/üçüncü-taraf sağlayıcı modelinde; 5b opsiyonel ve
  Faz 3 backend'ine biniyor.
- **HPKP/pinning'i web platformunda kullanmak** — bkz.
  [`research-secure-browser-design.md`](research-secure-browser-design.md).

## Kaynaklar

IETF/RFC belgeleri (ECH, QUIC, DoQ RFC 9250), MDN, Mozilla VPN ve Firefox dokümantasyonu, Chrome
Enterprise `WebRtcIPHandling` politikası, W3C anti-fingerprinting rehberi, seçilmiş CVE listesi.
