# Research — ISS ve web sitelerince izlenebilirliğin teknik anatomisi

> **Ne bu?** Bir tarayıcının **ağ** (ISS) ve **site** tarafından nasıl izlendiğinin katman katman
> analizi, ve hangi kontrolün neyi kapattığı. Alan araştırması.
>
> **Tarih.** Derleme 2026-08-21 · bu formata çevirisi 2026-09-02. **Dil notu.** Türkçe.
> **Sahibi fazlar:** [phase-5](../../phases/product/phase-5-vpn-network-privacy.md) (ağ katmanı) ·
> [phase-2](../../phases/product/phase-2-adapters-safe-browsing.md) (site katmanı).

---

## Katmanlar

**ISS'in gördüğü.** DNS sorguları (şifresizse), TLS **SNI**, hedef IP'ler, trafik hacmi ve şekli,
QUIC/HTTP-3 desenleri, OCSP ve session resumption sinyalleri.

**Sitenin gördüğü.** Çerezler ve durum depoları, cache, HSTS süper-çerez teknikleri, Service Worker'lar,
Beacon ve arka plan görevleri, WebRTC, prefetch/push, ve parmak izi + cookie-sync ekosistemi.

**Kontroller ve sınırları.** DoH/DoT/DoQ DNS'i şifreler ama **resolver'ı görür kılar** — sessizce
merkezîleştirmek yerine şeffaf sağlayıcı politikası, kurumsal kontrol, opt-out ve yerel ağ/ebeveyn
denetimi senaryoları açıkça yönetilmeli. **ECH** SNI'yı kapatır ama hedef IP ve trafik kalıbını değil —
_"SNI kapandı, ISS hiçbir şey göremez"_ yanıltıcıdır. **HPKP ölü**; yön Certificate Transparency +
sağlam iptal + kontrollü trust store.

**Hukuk.** GDPR / KVKK / ePrivacy boyutu ve telemetri-azaltma stratejisi ayrıca ele alınıyor.

## Alınacaklar / Alınmayacaklar

**Alınacak:**

- **Şifreli DNS bir güven kaydırmasıdır** — sağlayıcı politikası, görünür seçim, çalışan opt-out, ve
  tünelle etkileşim: tünele bağlı bir sekmenin DNS'i **tünelin içinden** çözülmeli, yanından değil.
  Faz 5 L10'a indi.
- **ECH** ve **onun sınırları** — aynı satırda; fazla vaat etmemek için ikisi birlikte yazıldı.
- **Durum depolarının bölümlenmesi** (`Partitioned` çerezler, storage partitioning) → Faz 2'nin
  üçüncü-taraf çerez izolasyonu.
- **`Referrer-Policy` ve Client Hints minimizasyonu**, UA reduction — Faz 2'nin `navigator` yüzey
  daraltmasıyla aynı eksende.
- **KVKK/GDPR izi** → Faz 7'nin uyumluluk paketi.

**Alınmayacak:**

- **Kendi DNS resolver'ımızı işletmek.**
- Kullanıcıya sorulmadan tek bir DoH sağlayıcısına sabitleme — raporun açıkça uyardığı şey.

## Kaynaklar

MDN, RFC'ler (DoH/DoT/DoQ, ECH taslakları), Chromium ve Firefox ağ dokümantasyonu, HPKP kullanımdan
kaldırma kaynakları, KVKK/GDPR/ePrivacy metinleri.
