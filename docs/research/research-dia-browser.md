# Research — Dia (The Browser Company → Atlassian)

> **Ne bu?** Kapalı kaynak bir rakibin (Dia, AI-öncelikli Chromium tarayıcı) dış
> kaynaklardan derlenmiş incelemesi. **Kod okunmadı.**
>
> **Durum:** kapalı kaynak · macOS (Windows beklemede) · Dia Pro $20/ay · Atlassian
> mülkiyetinde (satın alma 2025-10-21 kapandı, ~$610M).
> **Tarih.** 2026-09-01. **Dil notu.** Türkçe.

---

## Ne

Chromium üzerine kurulu, LLM'i doğrudan **omnibox'a ve sağ yan panele** yerleştiren
AI-öncelikli tarayıcı. Arc'ın yapımcısı The Browser Company'nin ikinci ürünü; Arc'ın
geliştirmesi fiilen durduruldu ve odak Dia'ya kaydı. Atlassian satın aldıktan sonra ürün
**tüketiciden kuruma** konumlandırıldı: 2026'nın ilk yarısında "Dia for Work" — güçlü
güvenlik kontrolleri olan, AI-native, ekip odaklı bir tarayıcı.

## Özellikler (Tepegöz'e alakalı olanlar)

| Dia özelliği                                                 | Ne yapıyor                                                         | Tepegöz karşılığı                                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Yan panelde AI asistanı**                                  | Açık sekmelerin içeriğiyle sohbet, taslak/özet/karşılaştırma       | `ext-agent` Agent Console (Chat modu) — var                                                                                                             |
| **Skills**                                                   | Yeniden kullanılabilir, özel AI kısayolları (prompt shortcut'ları) | S9 skill kütüphanesi = saklı prompt şablonları — **kavram birebir aynı**                                                                                |
| **Memory**                                                   | Açık sekmelerden kişisel bağlam çeken bellek sistemi               | S9 alan-başı advisory bellek (ATIL sevk)                                                                                                                |
| **Tab Groups** (otomatik düzenlenen toplantı sekme grupları) | Bağlama göre otomatik sekme gruplama                               | Tepegöz'de sekme grupları var; **otomatik gruplama yok**                                                                                                |
| **Omnibox'ta LLM**                                           | Adres çubuğu doğrudan AI girişi                                    | Tepegöz'de `@agent` prefix'i — **bilinçli olarak dar**: adres çubuğu deterministik kalır, AI'ya yalnızca kullanıcının kasten yazdığı prefix'ten geçilir |
| **Kurumsal güvenlik/admin kontrolleri**                      | Uyumluluk, yönetim                                                 | Tepegöz Phase 3/4 (frozen)                                                                                                                              |

## Tepegöz açısından en ilginç iki nokta

1. **"Skills" adı ve kavramı aynı yere yakınsadı.** Dia'nın Skills'i = yeniden kullanılabilir
   prompt kısayolu. Tepegöz'ün S9 skill'i = saklı prompt şablonu (seçince composer'ı doldurur,
   çalıştırmaz). LibreChat'in Skills'i = `SKILL.md` talimat paketi. WebBrain'in skill'i =
   markdown + HTTP araç manifesti. **Dört ürün, aynı isim, dört farklı yetki seviyesi** —
   en dardan (Tepegöz: sadece prompt) en genişe (WebBrain: HTTP tool çağırabilir).
   Bu yelpaze `phases/tracks/webbrain-agent-parity.md` P5'in tam konusu; Dia'nın konumu
   Tepegöz'e en yakın olan.

2. **Omnibox kararı zıt, ve Tepegöz'ünki savunulabilir.** Dia LLM'i omnibox'a koyuyor;
   Tepegöz `apps/desktop/src/i18n/en.ts`'deki yorumla açıkça tersini yapıyor:
   _"`@agent` is the ONE place the address bar crosses into AI, and only ever from a prefix
   the user typed on purpose"_ + _"Hands this text to the agent — leaves the deterministic
   address bar"_. Google Disco'nun "URL çubuğu yok, prompt composer var" uçuna karşı
   Tepegöz'ün duruşu net; Dia ikisinin arasında. Bu, ürün tezinin bilinçli bir farkı —
   `phases/tracks/omnibox-competitive-parity.md` bu ayrımı korumalı.

## Alınacaklar / Alınmayacaklar

**Alınacak:**

- **Otomatik sekme gruplama** (bağlama göre) — Tepegöz'ün sekme grupları zaten ajan
  oturumlarının anahtarı (`groupId`); "bu görev için bir grup aç ve ilgili sekmeleri
  içine topla" ajanla doğal eşleşiyor. Phase 2b/10 tarafında bir fikir, AI fazlarında değil.
- **Kurumsal konumlandırma dersi (ürün stratejisi):** Atlassian, tüketici AI tarayıcısını
  6 ayda kurumsal ürüne çevirdi. Tepegöz'ün Phase 11 (kamu/kurumsal güven) ve ADR-0032/
  0034/0035 (unattended trust profile, policy bundles, governed endpoints) zaten bu yöne
  bakıyor — pazar sinyali onu doğruluyor.

**Alınmayacak:**

- **Omnibox'u AI girişine çevirmek.** Tepegöz'ün deterministik adres çubuğu tezi bilerek
  farklı; Dia (ve Disco) bunun karşı örneği olarak kayda geçsin.
- macOS-öncelikli dağıtım (Tepegöz Windows-öncelikli).

## Kaynaklar

- [Atlassian Buys the Browser Company to Build an AI-Powered Enterprise Browser — Reworked](https://www.reworked.co/collaboration-productivity/atlassian-buys-the-browser-company-to-build-an-ai-powered-enterprise-browser/)
- [Inside Atlassian's Plan to Make Dia an AI Browser Built for Real Work — Reworked](https://www.reworked.co/collaboration-productivity/inside-atlassians-plan-to-make-dia-an-ai-browser-built-for-real-work/)
- [Dia Browser Status Tracker: Latest Updates, Features, and Roadmap (2026) — SupaSidebar](https://supasidebar.com/blog/dia-browser-status-tracker)
- [Dia Browser Mac Review (2026) — SupaSidebar](https://supasidebar.com/blog/dia-browser-mac-review-2026)
