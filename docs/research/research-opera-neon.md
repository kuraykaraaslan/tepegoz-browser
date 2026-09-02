# Research — Opera Neon

> **Ne bu?** Kapalı kaynak bir rakibin (Opera Neon, deneysel agentic AI tarayıcı) dış
> kaynaklardan derlenmiş incelemesi. **Kod okunmadı.**
>
> **Durum:** kapalı kaynak · 2025-12-11'de bekleme listesi kaldırıldı, herkese açık.
> **Tarih.** 2026-09-01. **Dil notu.** Türkçe.

---

## Ne

Opera'nın deneysel agentic tarayıcısı. Tepegöz açısından en dikkat çekici tarafı:
**mod isimleri Tepegöz'ünkiyle neredeyse birebir aynı.**

| Neon ajanı                           | Ne yapıyor                                                                                  | Tepegöz karşılığı                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Chat**                             | Normal sohbet/soru-cevap                                                                    | `ext-agent` komut paleti → **Chat**                     |
| **Do**                               | Tarayıcı oturumu içinde aksiyon: sekme açma, bilgi toplama, form doldurma, çok-adımlı süreç | `ext-agent` → **Do** (ajan modu)                        |
| **Make**                             | İçerik üretimi: web sitesi, rapor, video; kaynak dosyaları da veriyor                       | `ext-agent` → **Make**                                  |
| **ODRA** (Opera Deep Research Agent) | Derin araştırma; "1 dakikalık araştırma" modu daha kısa sonuç üretiyor                      | Tepegöz'de **yok** (araştırma ajanı ayrı bir mod değil) |
| **Intelligent Mode** (Şub 2026)      | Kullanıcının niyetine göre **doğru ajanı otomatik öneriyor**                                | Tepegöz'de **yok** — kullanıcı modu kendi seçer         |

`extensions/ext-agent/src/command-palette-core.ts` → `PALETTE_MODES = ['chat','do','make','tasks']`.
Yani Tepegöz ve Neon bağımsız olarak aynı dörtlüye yakınsamış (Neon'da 4.'sü Tasks değil ODRA).

## Tepegöz açısından iki somut fikir

### 1. Intelligent Mode — niyet→mod yönlendirmesi

Neon'un Şubat 2026 güncellemesi: kullanıcı isteğini yazıyor, Neon niyeti anlıyor ve en
uygun ajanı **öneriyor** (Chat / Do / Make / 1-Minute Research). Basit ama gerçek bir UX
kazancı: kullanıcı "hangi moddayım" bilişsel yükünden kurtuluyor.

**Tepegöz'e uyarlama.** Bu Tepegöz'de **determinism-first** kuralıyla çatışabilecek bir
yer, o yüzden şekli dikkatli olmalı:

- **Öneri, otomatik geçiş değil.** Neon da "recommends" diyor. Tepegöz'de mod seçimi bir
  **yetki** seçimidir (Do = aksiyon, Chat = salt-okunur); bir modelin kullanıcıyı sessizce
  Do moduna geçirmesi kabul edilemez. Öneri bir çip/ipucu olmalı, tıklamayla onaylanmalı.
- **Sınıflandırıcı ucuz katmanda.** `ModelRouter`'ın `classify` yeteneği (Haiku/GPT-5-mini/
  Flash-Lite tier'ı) tam bu iş için var — plan/exec modeli harcanmaz.
- **Yerel model adayı.** `@tepegoz/local-inference` + GBNF JSON grameriyle "niyet →
  {chat|do|make|tasks}" tek-token'lık bir sınıflandırma; S12'nin "cheap-capability track"
  tezine birebir uygun bir ilk gerçek kullanım.

### 2. ODRA — derin araştırma ayrı bir mod

Neon araştırmayı ayrı bir ajan yapmış, üstelik **iki hızda** (tam derin araştırma + "1
dakikalık" kısa mod). Tepegöz'de araştırma, Do modunun içinde `web_search` + `web_get_page`
ile örtük. Ayrı bir mod yapmanın değeri: farklı bütçe, farklı çıktı biçimi (kaynaklı
rapor), farklı durma koşulu.

**Uyarlama.** Yeni bir yetki yüzeyi gerektirmez — araştırma **salt-okunur** (`web_*` +
`browser_get_page`), yani Chat modunun yetkileriyle çalışır. Farkı: uzun-soluklu, çok
kaynaklı, kaynak-atıflı çıktı. Tepegöz'ün `CompletionEvidence` + kanıt rozetleri altyapısı
burada doğal olarak parlar (her iddia hangi sayfadan geldi). "1 dakikalık" varyant ise
S7'nin (speed) wall-clock hedefiyle uyumlu bir kullanıcı-görülür bütçe.

## Alınacaklar / Alınmayacaklar

**Alınacak:** (a) mod-önerisi çipi (otomatik geçiş DEĞİL, ucuz `classify` tier'ında,
tercihen yerel modelde), (b) araştırma modunun kaynak-atıflı, bütçeli bir varyant olarak
netleştirilmesi.

**Alınmayacak:** "Make" tarafının içerik/video üretimi (ürün kapsamı dışı; Tepegöz'ün
Make'i şu an bir palet modu, içerik-üretim stüdyosu değil), ve niyet-tabanlı **otomatik
mod geçişi** (yetki sınırı).

## Kaynaklar

- [Opera Neon introduces Intelligent mode — Opera Blog (Şub 2026)](https://blogs.opera.com/news/2026/02/opera-neon-ai-browser-intelligent-mode/)
- [Opera Neon goes into deep research mode (ODRA) — Opera Blog](https://blogs.opera.com/news/2025/10/opera-neon-deep-research-agent-odra/)
- [Opera Neon Browser Drops Waitlist, Adds Deep Research Agent — MacRumors](https://www.macrumors.com/2025/12/11/opera-neon-ai-browser-ends-waitlist/)
- [Opera opens public access to Opera Neon — Opera Limited IR](https://investor.opera.com/news-releases/news-release-details/opera-opens-public-access-opera-neon-its-experimental-agentic-ai)
