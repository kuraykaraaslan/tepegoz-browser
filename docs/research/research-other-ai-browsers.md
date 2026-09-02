# Research — diğer kapalı kaynak AI tarayıcı / ajanları (toplu)

> **Ne bu?** Kendi başına bir belgeyi hak etmeyen ama kayda değer kapalı kaynak rakiplerin
> toplu incelemesi. **Hiçbirinin kodu okunmadı** — hepsi kamuya açık kaynaklardan.
> Ayrı belgeleri olanlar: [Comet](research-perplexity-comet.md) ·
> [Dia](research-dia-browser.md) · [Opera Neon](research-opera-neon.md) ·
> [Fellou](research-fellou.md) · [Claude for Chrome](research-claude-for-chrome.md) ·
> [HARPA AI](research-harpa-ai.md).
>
> **Tarih.** 2026-09-01. **Dil notu.** Türkçe.

---

## 1. ChatGPT Atlas — kapandı (en önemli pazar sinyali)

**Ne oldu.** OpenAI, Atlas'ı **9 Ağustos 2026'da kapattı** — lansmandan 292 gün sonra.
Yetenekler kayboldu değil, **taşındı**: Chrome için bir ChatGPT uzantısına ve ChatGPT
masaüstü uygulamasının yükseltilmiş tarayıcı moduna.

**Neden önemli.** TechCrunch'ın formülasyonu tam yerinde:

> OpenAI, agentic tarayıcılığın çıkmaz sokak olduğu sonucuna varmadı — **onu barındırmak
> için bir tarayıcı sevk etmenin** çıkmaz olduğu sonucuna vardı.

Bu, Tepegöz'ün tez seçimine doğrudan bir meydan okuma ve dürüstçe kaydedilmeli:

- **Karşı-argüman:** dünyanın en büyük AI şirketi, "AI için ayrı bir tarayıcı" bahsinden
  bir yıl dolmadan çekildi ve uzantı + masaüstü moduna döndü. Dağıtım maliyeti (kullanıcıyı
  tarayıcı değiştirmeye ikna etmek) yeteneğin önüne geçti.
- **Tepegöz'ün cevabı ne olmalı:** Tepegöz'ün tarayıcı olma gerekçesi "AI'yı barındırmak"
  değil — **eklentinin yapısal olarak yapamadığı şeyi yapmak**: model-öncesi politika
  çekirdeği, origin-kapsamlı yürütme, kriptografik denetim, kernel-zorlamalı hassas-site
  kilidi. WebBrain'in kendi `THREAT-MODEL.md`'si (G1/G2/G4) bir eklentinin bu boşlukları
  kapatamadığını itiraf ediyor. Yani Atlas'ın kapanışı Tepegöz'ün tezini çürütmüyor ama
  **dağıtım riskini** çok net gösteriyor: kimse tarayıcı değiştirmek istemiyor.
- **Aksiyon:** bu, `phases/README.md`'nin v1 ship line kararlarında ve
  `ai-agent/README.md`'nin kuzey-yıldızı gerekçesinde referans verilmeye değer bir
  pazar verisi. "Neden tarayıcı" sorusunun cevabı güvenlik/hesap-verebilirlik olmalı,
  "AI daha iyi otursun diye" değil.

## 2. Prisma Browser (Palo Alto Networks) — kurumsal güvenlik açısı

Mart 2026'da duyuruldu: "agentic AI çağı için inşa edilmiş, sektörün en güvenli tarayıcısı".
Konumlanma: **gölge AI ajanlarına, prompt injection saldırılarına ve ajan ele geçirmeye
karşı koruma**; web'i "güvenli, AI-güdümlü bir çalışma alanına" çeviriyor; SASE ürün
ailesine bağlı.

**Tepegöz için anlamı.** Bu, Tepegöz'ün en yakın _tez_ rakibi — "güvenlik-önce AI tarayıcı".
Farklar:

- Prisma **kurumsal/SASE** ürünü (BT yöneticisi alır, çalışana dayatılır); Tepegöz **local-first
  kişisel** ürün (kullanıcının kendi kararı).
- Prisma'nın koruması **ağ/politika kenarında** (SASE); Tepegöz'ünki **süreç içinde,
  model-öncesi kernel'de**.
- Prisma "gölge AI ajanları"nı da tehdit sayıyor — yani başka ajanların kurumsal tarayıcıda
  koşmasını. Tepegöz'ün karşılığı `@tepegoz/mcp-client`'ın tek-PEP disiplini ve ADR-0021
  (agent-controllable extensions).
- Sektör anketi: **siber güvenlik profesyonellerinin %48'i agentic AI'yı 2026'nın bir
  numaralı güvenlik endişesi sayıyor.** Bu, Tepegöz'ün Phase 9 (safe autonomy) / ADR-0032-0035
  yatırımının pazar gerekçesi.

## 3. Genspark — MCP Store + Super Agent

Otopilot modu (otonom gezinme), telefon araması yapabilen / rezervasyon yapabilen / takvime
göre e-posta taslağı hazırlayan bir "Super Agent", ve **700+ araç entegrasyonlu bir MCP
Store**. $160M yatırım, ~$530M değerleme.

**Tepegöz için:** ilginç olan **MCP Store** — kullanıcının ajanına araç ekleyebildiği bir
mağaza. Tepegöz'de MCP istemcisi var ama **keşif/kurulum yüzeyi yok** (Settings'te sunucu
eklenir). LibreChat'in "Tools marketplace"i ve Kilo'nun "MCP Marketplace"i ile aynı desen —
üç ürün aynı yöne gitmiş. Tepegöz'de bunun evi **Phase 12** (developer platform/marketplace)

- ADR-0037 (SupplyChainGate) ve şu an frozen; ama "MCP sunucu keşfi" en azından bir
  `tepegoz://` sayfası olarak Phase 12'den önce düşünülebilir. Güvenlik notu: bir mağazadan
  kurulan MCP sunucusu **yeni araçlar** demek — Tepegöz'de bunlar zaten `dangerClassFor`
  fail-safe'i ve tek PEP'ten geçiyor, yani mağaza eklemek kernel'i zayıflatmaz.

## 4. Sigma AI Browser — gizlilik-önce, yerel asistan

SigmaGPT asistanı **varsayılan olarak yerelde** çalışıyor, izleme yok, bulut bağımlılığı
yok; buna rağmen tam agentic yetenekler (siteye giriş yapma, form doldurma, veri çıkarma,
çok-adımlı görev).

**Tepegöz için:** en yakın _konumlandırma_ rakibi (local-first + gizlilik + agentic).
Tepegöz'ün ayrıştığı yer yine aynı: Sigma "yerelde çalışıyor" diyor, Tepegöz "**kernel
kararı deterministik ve model-öncesi**, egress denetleniyor, run kriptografik olarak
doğrulanabiliyor" diyor. Yerellik gizlilik verir; hesap-verebilirlik vermez. Bu ayrım
pazarlama metninde net anlatılmalı, yoksa Tepegöz "bir gizlilik tarayıcısı daha" gibi
görünür.

## 5. Google Disco — adres çubuğu yok

URL çubuğu olmayan, yerine prompt composer koyan Google deneyi. **Tepegöz'ün tezinin tam
zıddı**: `apps/desktop/src/i18n/en.ts` yorumu adres çubuğunu bilerek deterministik tutuyor
ve AI'ya yalnızca `@agent` prefix'inden geçiyor. Disco (bir uçta) ↔ Dia (ortada) ↔ Tepegöz
(diğer uçta) ekseni, `phases/tracks/omnibox-competitive-parity.md`'nin korumaya değer
farkını gösteriyor.

## 6. Samsung Internet (Perplexity destekli), Chrome+Gemini, Edge+Copilot, Brave+Leo, Opera One+Aria

Mevcut tarayıcılara **gömülü** AI katmanı. Ortak özellik: ajan değil, çoğunlukla asistan
(özet/soru-cevap/yazma) — Chrome'un "Gemini auto browse"u ve Edge'in çekirdeğe gömülen
AI'sı istisna yönünde ilerliyor.

**Tepegöz için anlamı:** asıl rekabet baskısı burada. Kullanıcı zaten kullandığı tarayıcıda
"yeterince iyi" bir asistan bulursa, ayrı bir tarayıcı indirmez. Bu, Atlas dersinin
tekrarı: **Tepegöz'ün farkı asistanlıkta değil, ajanlıkta + hesap-verebilirlikte olmalı.**
Brave'in tarayıcısı açık kaynak (Leo asistanı içinde) — istenirse `.junk`'a çekilebilir
ama çok-GB'lık bir Chromium fork'u.

## 7. Manus Browser Operator, MultiOn (→ Please), Google Project Mariner

- **Manus Browser Operator:** eklentiyle _yerel_ tarayıcıyı sürme — oturum/IP avantajı.
  AIPex ve Tencent BrowserSkill ile aynı fikir (bkz. `docs/others/tepegoz-vs-aipex.md`),
  farkı kapalı kaynak olması.
- **MultiOn:** "Please" olarak pivot etti; browser-agent kategorisinden çıktı sayılabilir.
- **Project Mariner (Google):** araştırma önizlemesi; API/ürün olarak açık değil.

Üçü de Tepegöz'e yeni bir fikir vermiyor; kategorinin yoğunluğunu gösteriyorlar.

## 8. Asistan/sidebar sınıfı — Sider, Monica, Merlin, Glasp, Perplexity Extension

Ajan değil, **yan panel asistanı**: özet, çeviri, yazma, alıntı toplama. Tepegöz'ün Chat
modu + `ext-translate` + `ext-typo` üçlüsü bu sınıfı zaten kapsıyor. Glasp'in tek ayırt
edici fikri **alıntı/vurgu toplama ve dışa aktarma** — LibreChat'in quote çiplerine benzer
bir UX (bkz. `docs/others/librechat-agent-ui-learnings.md` A4).

---

## Toplu çıkarımlar

1. **Atlas'ın kapanışı en ağır veri.** "Ayrı tarayıcı" bahsinin dağıtım riski kanıtlandı.
   Tepegöz'ün cevabı, tarayıcı olmayı **güvenlik/hesap-verebilirlik gerekçesine** bağlamak
   olmalı — "AI daha iyi otursun" gerekçesi pazarda çürüdü.
2. **Kategori güvenlik krizinde.** Comet (2 ayrı sızıntı), Claude for Chrome (ShadowPrompt,
   ClaudeBleed), sektör anketinde %48 "1 numaralı endişe", ve Palo Alto'nun bu boşluğa
   kurumsal ürün sokması. **Tepegöz'ün tezi pazar tarafından doğrulanıyor** — ama tez
   ancak ölçülürse iddia olur (S6 ASR bataryası hâlâ measurement-owed).
3. **MCP mağazası üç bağımsız üründe belirdi** (Genspark, LibreChat, Kilo Code). Tepegöz'de
   MCP istemcisi var, keşif yüzeyi yok — Phase 12'de, frozen.
4. **Yerel/gizlilik tek başına farklılaştırıcı değil** (Sigma da öyle diyor). Tepegöz'ün
   ayrımı Notary + kernel + kanıt-atıflı tamamlama olmalı — **ama Notary bugün yalnızca
   yazılmış/testli bir paket; `apps/desktop` onu import etmiyor, hiçbir çalışma makbuz
   üretmiyor.** Bu ayrım bir _iddia_ değil, Phase 7'nin kapatması gereken bir _borç_.

## Kaynaklar

- [OpenAI is shutting down Atlas, but its AI browser ambitions are still growing — TechCrunch](https://techcrunch.com/2026/07/09/openai-is-shutting-down-atlas-but-its-ai-browser-ambitions-are-still-growing/)
- [Evolving Atlas into ChatGPT for browser-based agentic work — OpenAI Help Center](https://help.openai.com/en/articles/20001371-evolving-atlas-into-chatgpt-for-browser-based-agentic-work)
- [Palo Alto Networks Unveils the Industry's Most Secure Browser Built for Agentic AI](https://www.paloaltonetworks.com/company/press/2026/palo-alto-networks-unveils-the-industry-s-most-secure-browser-built-for-agentic-ai)
- [Prisma Browser: Where Agentic AI Meets Enterprise-Grade Security — Palo Alto Networks Blog](https://www.paloaltonetworks.com/blog/sase/prisma-browser-where-agentic-ai-meets-enterprise-grade-security/)
- [The Agentic Browser Landscape in 2026: A Complete Guide — No Hacks](https://nohacks.co/blog/agentic-browser-landscape-2026)
- [ChatGPT Atlas Is Shutting Down: What Happened and What's Next — Sigma Browser](https://www.sigmabrowser.com/blog/chatgpt-atlas-is-shutting-down-what-happened-and-the-best-alternatives)
