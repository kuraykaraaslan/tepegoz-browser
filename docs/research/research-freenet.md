# Research — Freenet: anonimlik mühendisliğinin kullanılabilirlikte kaybetmesi

> **Ne bu?** Bir **uyarıcı vaka** — rakip değil. Güçlü anonimlik mühendisliğine sahip bir projenin
> kullanıcıları kurulum, paketleme, okunmaz hatalar ve sessiz bağlantı ölümü yüzünden kaybetmesi.
>
> **Tarih.** Derleme 2026-08-21 · bu formata çevirisi 2026-09-02. **Dil notu.** Türkçe.
> **Sahibi faz:** [phase-5](../../phases/product/phase-5-vpn-network-privacy.md) →
> `### Network-privacy onboarding & health (rival evidence: Freenet)`.

---

## Tek rakam

Şikâyetlerin kabaca **%35'i kurulum/kullanılabilirlik**, **%10'u anonimliğin kendisi**. Yani proje
teknik olarak çalışıyordu; kullanıcı onu çalıştıramadı.

Şikâyet temaları: kurulum ve paketleme, ilk bağlantı, **anlaşılmaz hata mesajları**, sessizce ölen
bağlantılar, dokümantasyon boşlukları, ve performans belirsizliği ("yavaş mı, bozuk mu?").

## Alınacaklar / Alınmayacaklar

**Alınacak** — dördü de Faz 5'te satır:

- **Tünel için ilk-çalıştırma akışı.** Yapılandırmayı içe aktar, adlandır, **test et**, ve düz bir
  sonuç gör. Başarısız test _hangi adımın_ düştüğünü söyler (config parse / handshake / DNS / çıkış
  erişilebilirliği) — "bağlı değil" demez.
- **Zaman içinde bağlantı sağlığı.** Keep-alive, yeniden bağlanma, bağlantı-başına metrikler
  (handshake başarı oranı, gecikme, çalışma süresi). Sessizce ölen bir tünel **görünür** olmalı — yoksa
  bir sızıntıyla keşfedilir.
- **Kullanıcının dilinde hata + tek bir sonraki adım.** Ham sağlayıcı `stderr`'i arayüzde asla.
- **Hiçbir şey varsaymayan dokümantasyon** — TR + EN, ve tünelin neyi gizlemediğini **açıkça** söyleyen.
- **Bağımsız doğrulama:** Tor şikâyet korpusu ([`research-tor-browser.md`](research-tor-browser.md))
  aynı sonuca varıyor — en ağır acı anonimlik teorisi değil, kurmak ve bağlı kalmak. İlgisiz iki
  anonimlik ürününün aynı şekilde başarısız olması, bu bölümün sahip olduğu en güçlü kanıt.

**Alınmayacak:**

- Freenet'in ürün kapsamı (dağıtık depolama ağı) — Tepegöz'ün işi değil. Buradan alınan tek şey
  **başarısızlık deseni**.

## Kaynaklar

Freenet/Hyphanet proje forumları, GitHub konuları, kullanıcı raporları ve proje dokümantasyonu.
