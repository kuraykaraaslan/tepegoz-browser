# Research — Claude for Chrome

> **Ne bu?** Anthropic'in Claude for Chrome uzantısının (kapalı kaynak) dış kaynaklardan
> derlenmiş incelemesi — özellikle **izin modeli ve prompt-injection olay geçmişi**
> açısından. **Kod okunmadı.** (Not: `.junk/webbrain/docs/claude-chrome-comparison.md`
> WebBrain ekibinin deobfuscate ettiği bir ağaca dayanan ayrı bir kaynaktır; oradaki araç
> isimleri tersine mühendislik ürünüdür, resmî bir ürün sözleşmesi değildir.)
>
> **Durum:** kapalı kaynak · Chrome uzantısı · Claude aboneliği gerekir.
> **Tarih.** 2026-09-01. **Dil notu.** Türkçe.

---

## Ne

Chrome yan panelinde çalışan, kullanıcının oturum-açık tarayıcısını süren AI ajanı.
Tepegöz'ün `ai-agent` kuzey-yıldızı bunu **güvenilirlik + güvenlik** ekseninde
açıkça yardımcı ölçüt alıyor ("competitive with Claude for Chrome on reliability + safety").
Yani bu, Tepegöz'ün kendi roadmap'inde adı geçen iki referans üründen biri.

## Bilinen tasarım özellikleri

- **Site-bazlı izin modeli.** Domain başına izin modları + domain geçişlerinde uyarı.
- **Hassas işlemlerde onay.** Anthropic dokümantasyonu "duyarlı aksiyonlarda kullanıcı
  onayı zorunlu" diyor; ayrıca belirli aksiyonları engelleyen politikalar var.
- **Plan onayı** (`update_plan` benzeri bir akış) ve tab-grup/domain bağlam hatırlatmaları.
- **Quick Mode** — modele araç şeması vermeden, kompakt bir komut DSL'i ile sürüş (WebBrain
  karşılaştırmasında `ST/NT/C/T/K/S/D/Z/J/W` gibi tek-harfli komutlar olarak belgelenmiş);
  sonra sentetik `tool_use`/`tool_result` mesajları + taze ekran görüntüsü ekleniyor.
- **Koordinat/computer-odaklı sürüş.** Erişilebilirlik ağacı okuyucusu da var, ama birincil
  yol `computer` tool'u + ekran görüntüsü.

## Olay geçmişi — kategorinin en öğretici güvenlik dosyası

2026 boyunca ardışık, ciddi zafiyetler kamuya açıklandı:

**ShadowPrompt (Mart 2026)** — _sıfır-tıklama_ prompt injection zinciri. Kurban
saldırganın sayfasına girer, hiçbir şeye tıklamaz, Claude saldırganın prompt'unu alıp
uygular. Zincirin temeli: uzantıda **fazla geniş bir origin allowlist** — `*.claude.ai`
kalıbına uyan **herhangi bir alt alan adı** uzantıya prompt gönderip çalıştırabiliyordu.
Basın özeti aynen: _"No clicks, no permission prompts. Just visit a page, and an attacker
completely controls your browser."_

**ClaudeBleed (Mayıs 2026)** — iki kusurun birleşimi: (a) **herhangi bir Chrome uzantısı**
Claude in Chrome'a komut çalıştırabiliyordu, (b) güven, komutun _çalıştırma bağlamına_
değil _origin'ine_ dayanıyordu. Saldırganın script'i, onay mesajını **tekrar tekrar
göndererek kullanıcı onayını taklit ediyor** ve **DOM manipülasyonu ile UI öğelerini
değiştirip** Claude'un aksiyon algısını çarpıtıyordu — yani "kullanıcı onayı zorunlu"
korumasını aşıyordu.

**Temmuz 2026** — kötü niyetli uzantıların Gmail okumalarını tetikleyebildiği ayrı bir
bulgu.

## Tepegöz için çıkarılacak dersler (en yüksek değerli bölüm)

1. **"Kullanıcı onayı zorunlu" bir UI iddiasıdır; UI kandırılabilir.** ClaudeBleed'in
   özü budur: onay diyaloğu DOM'da yaşıyorsa, DOM'a erişebilen bir aktör onayı forge
   edebilir. **Tepegöz'ün yapısal cevabı doğru yerde:** HITL onayı **main process**'te
   round-trip ediyor (`ipc-agent-*`, pending-promise map, run-scoped confirm handler),
   renderer yalnızca gösterip cevaplıyor, ve **renderer güvenilmez** (ADR-0013). Ayrıca
   "confirm handler yoksa = deny" fail-safe'i var. Bu belge, o tasarım kararının bedelini
   ödemeyen bir ürünün ne yaşadığının kanıtı olarak `docs/threat-model.md`'ye referans
   verilebilir.
2. **Origin allowlist'i kalıpla yazma.** `*.claude.ai` kalıbı ShadowPrompt'un kökü.
   Tepegöz'ün IPC'si **exact-host allow-list** kullanıyor (ADR-0013'ün IPC disiplin
   maddesi: "sender-validated (exact-host allow-list)"). Bu doğru karar — kayıt altına
   alınmaya değer, çünkü "kolaylık olsun" diye wildcard'a dönmek tam olarak bu CVE'yi
   üretir.
3. **Uzantı-uzantıya güven yüzeyi.** ClaudeBleed'in (a) maddesi bir uzantı-ekosistemi
   problemi. Tepegöz native tarayıcı olduğu için bu yüzey farklı ama yok değil:
   `extension_*` araçları + `@tepegoz/extension-host` + ADR-0021 (agent-controllable
   extensions). Kontrol edilmesi gereken soru: **bir kullanıcı uzantısı, ajan çalışmasına
   komut enjekte edebilir mi?** Cevap hayır olmalı ve bunun bir testi olmalı.
4. **Sıfır-tıklama = en yüksek şiddet.** Comet'te de aynı desen (takvim daveti). Tepegöz'ün
   S6 ASR bataryası **sıfır-tıklama senaryolarını ayrı bir aile** olarak içermeli; "kullanıcı
   bir sayfaya girdi ve başka hiçbir şey yapmadı" başlangıç durumu.
5. **Quick Mode dersi (negatif).** Araç şemasını kaldırıp kompakt DSL + her adımda ekran
   görüntüsü, token ucuzlatır ama **denetlenebilirliği düşürür** (araç adı yok, argüman
   şeması yok, audit satırı yok). Tepegöz'ün tek-PEP + zod-doğrulama disiplini bunun
   tam tersi; **Quick Mode benzeri bir mod eklenmemeli.** Küçük modeller için doğru cevap
   `webbrain-agent-parity.md` P8'deki **tool-yüzeyi tier'leme** (daha az araç, ama hâlâ
   şemalı ve PEP'ten geçen).

## Alınacaklar / Alınmayacaklar

**Alınacak:**

- **Domain-geçişi uyarısı.** Claude'da bir çalışma başka bir domain'e geçtiğinde kullanıcıya
  söyleniyor. Tepegöz'de `plan-grant-scope` + `remembered-grant-scope` eTLD+1 bazlı;
  **kullanıcıya görünür bir "site değişti" olayı** `ext-agent` transkriptinde yok. Ucuz
  ve dürüstlük artırıcı. (`webbrain-agent-parity.md` P4'ün adaptör-yeniden-enjeksiyonuyla
  aynı yerde oturur.)
- **Tab/domain bağlam hatırlatması** — uzun çalışmada modelin hangi domain'de olduğunu
  periyodik hatırlatmak; Tepegöz'ün `runtime-context` envelope'una benzer, karşılaştırılabilir.

**Alınmayacak:**

- Quick Mode / şemasız DSL (yukarıda).
- Koordinat-öncelikli sürüş — ADR-0008 (DOM/a11y-önce) zaten tersini söylüyor ve
  Anthropic'in kendi `browser-use-demo`'su bile `ref`-tabanlı hedeflemenin koordinata
  üstünlüğünü sayıyor (bkz. `docs/research-computer-use-agents.md`).

## Kaynaklar

- [Claude Extension Flaw Enabled Zero-Click XSS Prompt Injection via Any Website — The Hacker News](https://thehackernews.com/2026/03/claude-extension-flaw-enabled-zero.html)
- [ShadowPrompt: Zero-Click Prompt Injection Chain in Anthropic's Claude Chrome Extension — SOCRadar](https://socradar.io/blog/shadowprompt-zero-click-anthropics-claude/)
- [ShadowPrompt: How Any Website Could Have Hijacked Claude's Chrome Extension — Koi](https://www.koi.ai/blog/shadowprompt-how-any-website-could-have-hijacked-anthropic-claude-chrome-extension)
- [Claude in Chrome is taking orders from the wrong extensions — CSO Online](https://www.csoonline.com/article/4168867/claude-in-chrome-is-taking-orders-from-the-wrong-extensions.html)
- [Vulnerability in Claude Extension for Chrome Exposes AI Agent to Takeover — SecurityWeek](https://www.securityweek.com/vulnerability-in-claude-extension-for-chrome-exposes-ai-agent-to-takeover/)
- [Researchers Say Claude for Chrome Flaw Lets Rogue Extensions Trigger Gmail Reads — The Hacker News](https://thehackernews.com/2026/07/claude-for-chrome-flaw-lets-other.html)
- [Use Claude in Chrome safely — Anthropic Help Center](https://support.claude.com/en/articles/12902428-use-claude-in-chrome-safely)
