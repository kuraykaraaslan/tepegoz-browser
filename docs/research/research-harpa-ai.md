# Research — HARPA AI

> **Ne bu?** Kapalı kaynak bir rakibin (HARPA AI, tarayıcı uzantısı) dış kaynaklardan
> derlenmiş incelemesi. **Kod okunmadı.** Tepegöz açısından değeri: **otomasyon + ajan +
> web izleme**'yi tek üründe birleştirmesi — Tepegöz'ün üç ayrı yerde (ajan, macro,
> tasks) durduğu şeyi tek yüzeyde sunuyor.
>
> **Durum:** kapalı kaynak · Chrome uzantısı · freemium.
> **Tarih.** 2026-09-01. **Dil notu.** Türkçe.

---

## Ne yapıyor

| Yetenek | Detay |
|---|---|
| **Sayfa-farkında sohbet** | Web sayfası, PDF veya YouTube içeriğini okur; özet, soru-cevap, veri çıkarımı |
| **Tarayıcı otomasyonu** | Buton tıklama, form doldurma, sayfalar arası gezinme, yapılandırılmış veri kazıma |
| **Dış iş akışı tetikleme** | Zapier, Make.com, n8n, webhook entegrasyonları |
| **Web izleme** | Zamanlanmış sayfa kontrolleri; sayfa/fiyat/veri değişince bildirim veya otomasyon zinciri tetikleme; arka planda periyodik yenileme |
| **Çok-model** | GPT-4o/GPT-5.2, Claude Sonnet 4.6, Gemini 3.1 Pro, DeepSeek, Perplexity, Llama, Grok |
| **Hazır komut kütüphanesi** | 100+ önceden yazılmış komut: YouTube/PDF özetleyici, e-posta yanıt otomatı, fiyat izleyici, rakip takipçisi |
| **Arka plan otomasyon motoru** | Sayfaları arka planda çalıştırıp inceleyip aksiyon alabilen motor |

## Tepegöz'de bunların karşılığı — ve dağınıklık problemi

HARPA'nın tek üründe topladığı şey Tepegöz'de **üç ayrı yerde**:

| HARPA | Tepegöz | Durum |
|---|---|---|
| Sayfa-farkında sohbet | `ext-agent` Chat modu + `@tepegoz/reader` | Var |
| Tarayıcı otomasyonu (ajan) | `ext-agent` Do modu + `@tepegoz/orchestrator` | Var |
| Deterministik otomasyon | `ext-macros` + `@tepegoz/macro-engine` (iMacros halefi) | Var, **ayrı uzantı** |
| Web izleme / zamanlama | `ext-tasks` + `@tepegoz/tasks` (interval / page-change / external tetikleyici) + `tepegoz://tasks` | Var, **ayrı uzantı**; ajan panelindeki "Save as task" affordance'ı **kaldırılmış** (bir sonraki Tasks ürün revizyonuna bırakılmış) |
| Hazır komut kütüphanesi | S9 skill kütüphanesi (saklı prompt şablonları) | Var ama **boş** — paketlenmiş hazır komut yok |
| Dış iş akışı (Zapier/n8n/webhook) | `@tepegoz/mcp-client` (MCP sunucuları) | Farklı yol, aynı amaç |
| Çok-model | 8 sağlayıcı + `local` | Var, dar |

**Asıl ders bir özellik değil, bir ürün-mimarisi gözlemi:** kullanıcı için "bu sayfayı
özetle", "bu formu doldur", "bu fiyat düşünce haber ver" **aynı işin** üç hâli. HARPA
bunları tek bir komut yüzeyinde birleştirmiş. Tepegöz'de üç ayrı uzantı, üç ayrı sayfa
(`ext-agent` paneli, `ext-macros`, `tepegoz://tasks`) — ve ajan panelinden görev
kaydetme affordance'ı bilerek **çıkarılmış** durumda. Bu, mimari olarak temiz (her domain
kendi paketinde) ama **kullanıcı yüzeyinde dağınık**.

## Somut öneriler

1. **"Bunu bir göreve çevir" affordance'ını ajan panelinde geri getir.** `ext-agent`'ın
   i18n sözlüğünde `scheduleTask.*` anahtarları (`presetContinuous`, `presetInterval`,
   `presetPageChange`, `autonomyNotify`, `autonomySameOrigin`) **hâlâ duruyor** ama
   `phases/README.md` fold kaydına göre affordance kaldırılmış. `@tepegoz/tasks` zaten
   interval + page-change tetikleyicilerini destekliyor. Yani bu **yeni bir yetenek değil,
   yeniden bağlanacak bir yüzey**. HARPA'nın en çok kullanılan özelliği (fiyat/rakip
   izleme) tam olarak buradan çıkar.
2. **Skill kütüphanesini paketlenmiş şablonlarla doldur.** S9 skill'leri saklı prompt
   şablonları ve kütüphane boş başlıyor. HARPA'nın 100+ hazır komutunun Tepegöz karşılığı,
   **paketlenmiş birkaç iyi şablon** olurdu: "bu sayfayı özetle", "bu PDF'ten tabloyu
   çıkar", "bu ürünün fiyatı düşünce haber ver" (→ görev), "bu YouTube videosunun
   transkriptini özetle". Hiçbiri yeni yetki istemiyor; hepsi mevcut araçlarla çalışıyor.
   Türkçe-öncelikli birkaç şablon (sahibinden/trendyol fiyat takibi) `ai-agent`'ın
   TR-web benchmark setiyle de örtüşür.
3. **Webhook/dış-tetikleyici köprüsü — dikkatli.** HARPA Zapier/n8n/webhook ile dışarı
   çıkıyor. Tepegöz'de bunun doğru yeri `@tepegoz/mcp-client` (içeri) ve ADR-0035
   (governed agent endpoints, Phase 9, frozen) — **`@tepegoz/tasks`'ın "external" tetikleyici
   placeholder'ı** bu kapının şu anki adı. Açılırsa `EgressFirewall` + PolicyKernel'den
   geçmesi şart; HARPA'nın modeli (uzantı doğrudan webhook atıyor) Tepegöz'de kabul edilemez.

## Alınacaklar / Alınmayacaklar

**Alınacak:** ajan panelinden görev kaydetme (yeniden bağlama), paketlenmiş skill
şablonları (TR-öncelikli birkaçı dahil), "izleme" kavramının kullanıcıya tek yerde
görünmesi.

**Alınmayacak:** doğrudan webhook/Zapier egress'i (Phase 9 + EgressFirewall kapısı
olmadan), ve "her şey tek uzantı" mimarisi — Tepegöz'ün paket ayrımı doğru, birleşmesi
gereken **kullanıcı yüzeyi**, kod değil.

## Kaynaklar

- [HARPA AI | Getting Started](https://harpa.ai/guides/getting-started)
- [What Can HARPA AI Do for Your Web Tasks? — Medium](https://medium.com/@kawsarlog/what-can-harpa-ai-do-for-your-web-tasks-d43a854cbaff)
- [Harpa AI Review, Features, Pricing & Alternatives (2026) — AI Agents Directory](https://aiagentsdirectory.com/agent/harpa-ai)
- [HARPA AI — 2026 Review, Pricing & Alternatives — AIGearBase](https://aigearbase.com/tool/harpa-ai)
