# Research — ChatGPT Atlas

> **Ne bu?** OpenAI'nin AI-öncelikli tarayıcısı Atlas'ın **kullanıcı şikâyeti korpusu**. Kod okunmadı;
> forum, Reddit, HN ve resmî destek sayfalarından derlenmiş.
>
> **Durum:** kapalı kaynak · **2026-08-09'da kapatıldı** (lansmandan 292 gün sonra). Yetenekler bir
> Chrome uzantısına ve ChatGPT masaüstünün tarayıcı moduna taşındı.
> **Tarih.** Derleme 2026-08-21 · bu formata çevirisi 2026-09-02. **Dil notu.** Türkçe.
> **Kardeş:** kapanışın **pazar sinyali** olarak okunması
> [`research-other-ai-browsers.md`](research-other-ai-browsers.md) §1'de ve
> [`phases/README.md`](../../phases/README.md)'nin v1 ship line'ında. Bu belge onun _öncesini_ —
> ürün yaşarken neyin şikâyet edildiğini — taşıyor.

---

## Ne

Chromium tabanlı, ChatGPT'yi tarayıcının merkezine koyan macOS-öncelikli tarayıcı: yan panelde asistan,
"Browser memories" (gezinti geçmişinden bağlam çıkarma), ve **agent mode** (çok adımlı görev yürütme).
Tepegöz'ün doğrudan tez rakibiydi; kapanışı bu projenin gerekçesini değiştirmiyor ama **dağıtım riskini**
kanıtlıyor.

## Şikâyet teması ve kök neden

| Kategori                   | Sıklık | Temsilî alıntı                                        | Şiddet      | Kök neden                                      |
| -------------------------- | -----: | ----------------------------------------------------- | ----------- | ---------------------------------------------- |
| Hata ve kararlılık         |     13 | "Parçalar rastgele beyaz/boş oluyor"                  | Yüksek      | Render/compositing, uzun oturum                |
| Entegrasyon / uyumluluk    |     13 | "Bitwarden hiç yüklenmiyor"                           | Yüksek      | Chromium'un farklı gömülme biçimi              |
| UI/UX                      |     11 | "Çok hata, zayıf UX, özelleştirme az"                 | Orta-Yüksek | AI-first tasarımın klasik tarayıcıyı ezmesi    |
| Performans                 |     10 | **"71 GB bellek kullanıyordu"**                       | Yüksek      | Renderer süreç birikimi, olası leak            |
| Gizlilik algısı            |     10 | "Yapay zekânın tarama verime dokunmasına izin vermem" | Yüksek      | **Browser memories'in varsayılan açık olması** |
| Ajan güvenilirliği         |      9 | "Açık oturum varken bile LinkedIn yazısı gönderemedi" | Yüksek      | Agent mode preview aşamasında                  |
| **Yerelleştirme / Türkçe** |      5 | "İngilizce dışı düzende Cmd+C/V/F duruyor"            | Orta-Yüksek | IME ve klavye düzeni katmanı                   |
| Platform kapsamı           |      3 | "En popüler iki platformda bile yok"                  | Orta        | macOS-only                                     |
| Erişilebilirlik            |      2 | "WCAG'a henüz tam uyumlu değil"                       | Orta-Yüksek | Olgunlaşmamış a11y katmanı                     |
| Faturalama / limit         |      2 | "40 kullanım ilk dört günde bitti"                    | Düşük-Orta  | Limit iletişimi                                |

Rapor bunları üç kök nedene indiriyor: **teknik mimari** (Chromium'u süreç düzeyinde farklı gömme),
**güven modeli** (varsayılan açık bellek + belirsiz "sayfa görünürlüğü" kavramları), ve **ürün olgunluğu +
iletişim boşluğu** (kullanıcılar "ürün durmuş gibi" hissediyor).

## Alınacaklar / Alınmayacaklar

**Alınacak:**

- **Hata bir gerekçe taşımalı, omuz silkme değil.** Atlas'ın en çok tekrarlanan şikâyeti jenerik hata
  metni — _"Something seems to have gone wrong"_. Karşılığı
  [S8](../../phases/ai-agent/phase-s8-assistant-ux.md) PR7'nin ilk satırı: hangi adım, ne gözlendi, tek
  bir sonraki eylem. **Ve adımdan devam** (yeniden başlatma değil).
- **İngilizce dışı klavye/IME kalite matrisi P0.** Atlas'ta Türkçe düzende `Cmd+C/V/F`'nin durması,
  burada zaten bir kapı — [phase-1a](../../phases/product/phase-1a-walking-skeleton-mvp.md)'nin i18n
  satırı `IME_MATRIX` verisinin var olduğunu ama Playwright koşucusunun olmadığını açıkça kaydediyor.
  Bu belge o boşluğun neden pahalı olduğunun kanıtı.
- **Bellek/kaynak muhasebesi.** "71 GB" bir uç değer ama yön doğru; karşılığı
  [S7](../../phases/ai-agent/phase-s7-speed.md) PR6'nın koşu-başına RSS/CPU muhasebesi ve "boşta maliyet
  sıfır" satırı.
- **Belleğin varsayılanı kapalı olmalı.** Atlas'ın gizlilik tedirginliğinin tek kaynağı Browser
  memories'in varsayılan açık gelmesi. Burada karşılığı Faz 1b'nin **Memory Audit Panel**'i ve onun
  "default OFF opt-in" kuralı — bu belge o varsayılanın neden pazarlık konusu olmadığını gösteriyor.
- **Uyumluluk programı.** Şifre yöneticisi, popup, passkey ve giriş akışları en görünür kırılma noktası.
  [S11](../../phases/ai-agent/phase-s11-benchmark-h2h.md) PR6'nın rakip-hata katmanına girdi.
- **Erişilebilirlik erteleme olmaz** → [phase-10b](../../phases/product/phase-10b-accessibility-voice-reach.md).

**Alınmayacak:**

- **macOS-öncelikli dağıtım** — bu proje Windows-öncelikli.
- **AI-first kabuğun klasik tarayıcıyı ezmesi.** Atlas'ın UI/UX şikâyet kümesinin özeti bu; buradaki
  karşı-karar [phase-2c](../../phases/product/phase-2c-classic-browser-essentials.md)'nin tamamı —
  klasik tarayıcı önce, ajan onun üstünde.

## Kaynaklar

OpenAI yardım merkezi ve ürün sayfaları, OpenAI topluluk forumu, Reddit, Hacker News, sürüm notları
(Kasım 2025 – Mart 2026 aralığı) ve kapanış duyurusu.
