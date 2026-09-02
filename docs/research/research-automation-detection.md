# Research — tarayıcı otomasyon tespiti

> **Ne bu?** Bir sitenin "bu tarayıcıyı bir insan mı yoksa bir betik mi sürüyor" sorusunu **nasıl**
> yanıtladığının analizi: davranışsal ve çevresel sinyaller. Rakip araştırması değil, alan araştırması —
> ve bir ajan tarayıcısı için doğrudan tehdit modeli.
>
> **Tarih.** Derleme 2026-08-21 · bu formata çevirisi 2026-09-02. **Dil notu.** Türkçe.
> **Sonuç:** karşılığı **sevk edildi** — [`@tepegoz/human-input`](../../packages/human-input): gerçek
> jestler, doğrula-ve-yeniden-dene, rastgeleleştirilmiş eylemler-arası boşluk.

---

## Sinyal sınıfları

| Sınıf                       | Örnek                                                                        |
| --------------------------- | ---------------------------------------------------------------------------- |
| **Davranışsal**             | Fare yörüngesi ve hız profili, klavye tuş-arası zamanlaması, kaydırma ivmesi |
| **Düşük seviye API / olay** | `isTrusted`, olay özellikleri, sentetik olayların imzası                     |
| **Parmak izi**              | Başlıksız/otomasyon ortamına özgü değerler                                   |
| **WebDriver işaretleri**    | `navigator.webdriver`, otomasyon eklentilerinin izleri                       |
| **Zamanlama ve entropi**    | İstek ritmi, aksiyonlar arası varyansın **düşüklüğü**                        |

Çekirdek fikir: otomasyon yalnızca bayraklardan değil, **fazla düzenli olmaktan** yakalanır. Entropi
eksikliği başlı başına bir sinyal.

## Alınacaklar / Alınmayacaklar

**Alınacak:**

- **Gerçek jestler, sentetik olay değil** — `isTrusted` sınıfı kontrolleri geçmenin tek dürüst yolu, ve
  `@tepegoz/human-input` bunun için CDP üzerinden gerçek girdi üretiyor. **Sevk edildi.**
- **Rastgeleleştirilmiş eylemler-arası boşluk** — entropi eksikliği sinyaline karşılık. **Sevk edildi.**
- **Doğrula-ve-yeniden-dene** — kör tıklama yerine sonucu gözlemleyip tekrarlamak; hem güvenilirlik hem
  daha insana yakın ritim.
- **⚠️ Ritim de bir imzadır — ve bu ürünün _kendi ürettiği_ sinyaldir.** Faz 5 L10'da açık bir satır:
  `human-input`'un karşı önlemleri **girdi olaylarına mı yoksa istek ritmine de mi** uzanıyor,
  yazılmalı; ve ajan-sürüşlü bir sekmenin insan-sürüşlü bir sekmeyle **aynı gizlilik duruşunu iddia
  edip edemeyeceği** kararı verilmeli. Bu proje o ambiguity'yi bırakma hakkına sahip değil.
- **Görünürlük kapılı gerçekçilik.** Ekran dışı bir koşuda insan-pacing'i düşürmek maliyeti azaltıyor
  ama koşuyu marjinal olarak daha makine-benzeri yapıyor — [S7](../../phases/ai-agent/phase-s7-speed.md)
  PR3 bu ödünleşimi ölçtü ve açıkça kaydetti.

**Alınmayacak:**

- **Anti-bot atlatmayı bir ürün özelliği hâline getirmek.** Buradaki amaç, meşru bir kullanıcının kendi
  oturumunda çalışan bir ajanın **haksız yere bot sanılmaması**; koruma sistemlerini kırmak değil.
  CAPTCHA çözme ADR-0039 gereği **her koşulda insana devrediliyor**.

## Kaynaklar

Anti-bot sağlayıcılarının kamuya açık teknik yazıları, akademik bot-tespit literatürü, tarayıcı
otomasyon araçlarının kendi dokümantasyonu.
