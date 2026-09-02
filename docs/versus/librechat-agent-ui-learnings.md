# LibreChat → Tepegöz Agent Console: alınabilecek dersler

> **Ne bu?** `.junk/librechat` (LibreChat v0.8.8-rc1 — olgun, çok-sağlayıcılı açık kaynak
> sohbet/ajan platformu) deposunun **yalnızca ajan sohbet arayüzü** açısından incelenmesi.
> Amaç rakip analizi değil: **`extensions/ext-agent` panelini geliştirmek** için somut,
> ayıklanmış fikirler. "Her özelliğini almamıza gerek yok" — bu belge neyi alıp neyi
> almayacağımızı gerekçesiyle ayırır.
>
> **Yöntem.** `README.md` (v0.8.8-rc1 changelog), `client/src/components/` ağacı — özellikle
> `Chat/{Input,Messages,Steering,Subagents,Menus}`, `Chat/Messages/Content/`, `Agents/`,
> `Skills/`, `SidePanel/{Agents,Builder,Memories,Parameters,Schedules,MCPBuilder}`,
> `Conversations/`, `Prompts/` — ve bunların Tepegöz `extensions/ext-agent/src/` karşılıklarıyla
> eşleştirilmesi.
>
> **Tarih.** 2026-09-01. **Dil notu.** Türkçe tutuluyor.

---

## Neden LibreChat'e bakmaya değer

LibreChat bir tarayıcı ajanı değil — sohbet/ajan **arayüzü**. Tam da bu yüzden faydalı:
Tepegöz'ün zayıf olduğu yer ajan _motoru_ değil (orası mimari olarak güçlü), uzun bir
otonom çalışmanın **okunabilirliği ve kullanıcı kontrolü**. LibreChat bu problemi yıllardır
ve çok kullanıcıyla çözüyor; v0.8.8 changelog'unun neredeyse tamamı bu konu başlıklarından
oluşuyor ("Agent run control", "Human-in-the-loop Agents", "Readable Agent activity",
"Messages and navigation", "Streaming and tool reliability").

Bugünkü `ext-agent` paneli zaten iyi bir temele sahip: plan önizleme, kademeli otonomi +
risk banner, effort ön-ayarları, kanıt rozetleri (Checked/Unconfirmed/Contradicted),
kaydırılabilir replay timeline, çalışırken `steer`, pause/resume, arka-plana devam,
sekme-grubu-başı oturum, sohbet geçmişi + arama, composer ekleri, ticaret çift-onayı,
scope-grant, Human Handoff. Aşağıdakiler **bunun üstüne** ne konulabileceği.

---

## A) Doğrudan alınabilir — küçük, net kazanç

### A1. Steer kuyruğu + bekleyen-steer çipleri

**LibreChat:** `Input/InterruptSteerButton.tsx`, `SteerMenu.tsx`, `InFlightSteers.tsx`,
`PendingSteerChips.tsx`, `DuringRunSendButton.tsx`, `Chat/Steering/Receipt.tsx`.
Çalışma sürerken mesaj **kuyruğa alınır**; bekleyen steer'lar çip olarak görünür; kullanıcı
bekleyen bir steer'ı **geri alabilir, düzenleyebilir ya da yükseltebilir**; uygulandığında
bir "receipt" gösterilir.

**Tepegöz'de bugün:** `steer` var (`steerPlaceholder: 'Add an instruction while it works…'`)
ama tek-atımlık: gönderirsin, çalışan göreve katılır, görünür bir kuyruk/geri-alma yok.

**Neden değerli:** uzun bir Do-modu çalışmasında kullanıcı üst üste iki şey söylemek ister
ve ilkinin uygulanıp uygulanmadığını göremez. Çip + receipt bu belirsizliği kapatır. Ayrıca
**güvenlik açısından da iyi**: bir steer bir sonraki model çağrısına kadar _uygulanmadı_
demek, kullanıcıya "hâlâ geri alabilirsin" demektir.

**Uyarlama:** steer metni Tepegöz'de **güvenilir kullanıcı girdisi** — kuyruktaki bir steer
sayfa içeriğinden asla türetilemez, aynı `clarify` cevaplarının güvenilir sayıldığı gibi.
Kuyruk `ext-agent` panel-state'inde tutulur, IPC'ye yalnızca uygulanacağı anda geçer.

### A2. Context-doluluk göstergesi (token sayacından ayrı)

**LibreChat:** `Input/TokenUsage/{Gauge,Breakdown}.tsx` + changelog "a more faithful Context
Usage gauge".

**Tepegöz'de bugün:** `tokens` sayacı + kota %80 uyarısı var — bu **maliyet** göstergesi.
Context penceresinin ne kadarının dolduğu **görünmüyor**.

**Neden değerli:** uzun bir çalışmada asıl kırılma noktası bütçe değil, context. Tepegöz
zaten `cache-window.ts` + Reactor working-state collapse ile bunu yönetiyor; kullanıcıya
görünür kılmak, "neden birden özetledi" sorusunun cevabını önceden verir. WebBrain'in
"Context automatically compacted" ayracıyla birlikte düşünülmeli.

### A3. Aktivite fazı gruplaması + canlı araç-niyet etiketi

**LibreChat:** `Messages/Content/ActivityPhaseGroup.tsx`, `ProgressText.tsx`,
`InProgressCall.tsx`, `SkillPills.tsx`; changelog: "generated activity-group headers,
parent phase summaries, and live tool intent labels make long reasoning and tool runs
easier to scan".

**Tepegöz'de bugün:** adım akışı düz bir liste (`step_start`/`step_ok`/`step_error`) +
katlanabilir "Reasoning" bölümü. 40 adımlık bir çalışmada okunması zor.

**Neden değerli:** Tepegöz'ün planı zaten bir **DAG** — yani faz başlıkları _üretilmek_
zorunda değil, plandan **türetilebilir**. LibreChat'in modele başlık ürettirdiği yerde
Tepegöz deterministik olarak plan adımını başlık yapabilir: daha ucuz, daha dürüst,
determinism-first kuralına uygun. "Canlı araç-niyet etiketi" ("Fiyatı okuyor…" yerine
`browser_get_page`) tool descriptor'ının `description`'ından gelir.

### A4. Mesaj-seviyesi eylemler: kopyala / alıntıla / düzenle

**LibreChat:** `Messages/HoverButtons.tsx`, `QuoteButton.tsx`, `PendingQuoteChips.tsx`,
`MessageQuotes.tsx`, `EditMessage.tsx`, `MessageNav.tsx`; changelog: "full-message copy,
a dock-style message rail".

**Tepegöz'de bugün:** kod bloklarında `copy` var; mesajın tamamını kopyalama, bir cevaptan
alıntı alıp yeni turda referanslama, kendi mesajını düzenleyip yeniden gönderme yok.

**Neden değerli:** ucuz, tamamen renderer-içi, hiçbir güvenlik sınırına dokunmaz.
"Alıntı çipi" özellikle iyi eşleşir: Tepegöz'ün composer'ında zaten **seçili metin eki**
mekanizması var (`panel-attachments.ts`) — alıntı onun bir varyantı.

---

## B) Uyarlanarak alınabilir — fikir iyi, Tepegöz'de şekli farklı olmalı

### B1. "Tek formda dört soru" — `clarify`'ın toplu hali

**LibreChat:** `Messages/Content/AskUserQuestion*.tsx` (`Call`, `Progress`, `Questions`) +
`Input/AskUserQuestionPopover.tsx`; changelog: "ask up to four related questions in one
form, pause for input or tool approval, and resume".

**Tepegöz'de bugün:** `clarify` tek soru sorar; her soru bir tur.

**Uyarlama:** Tepegöz'ün `clarify` tool şeması **çoklu-soru** alabilir (soru + 2-4 seçenek,
en fazla 4 soru). Kazanç: 4 tur yerine 1 tur = daha az token, daha az bekleme. **Ama
güvenlik sınırı korunmalı:** `clarify` cevabı güvenilir kullanıcı girdisidir; sorular
model tarafından üretilir ve **sayfa içeriği sorunun içine kaçamaz** — soru metni
`sanitizeText`'ten geçmeli ve `wrapUntrustedContent` sınırının dışında kalmalı. WebBrain'in
"research escalation" clarify'ında yaptığı daraltmanın (tam iki seçenek, sabit amaç) aynısı:
şema ne kadar dar olursa o kadar iyi.

### B2. Skill'lerin manual / automatic / always-on üç durumu

**LibreChat:** `components/Skills/*` + `Input/SkillsCommand.tsx`,
`PendingManualSkillsChips.tsx`, `Messages/Content/SkillPills.tsx`; Skills = yeniden
kullanılabilir `SKILL.md` talimat paketleri, "manual, automatic, or always-on" iş akışları.

**Tepegöz'de bugün:** skill = saklı prompt şablonu; seçince composer'ı doldurur, **asla
çalıştırmaz** (S9'un bilinçli kararı). Tek durum: manuel.

**Uyarlama:** "always-on" (her çalışmada yüklenir) ve "automatic" (katalogdan model seçer)
Tepegöz'de **yeni bir yetki yüzeyi** demek — S9'un "bir skill asla bir çalışma başlatamaz"
kuralını bozmaz ama prompt'a ne girdiğini modele bırakır. Alınacak parça sadece **UI
tarafı**: transkriptte **hangi skill'in aktif olduğunu gösteren pill'ler**. Tepegöz'de
zaten skill seçimi görünür değil; pill, "bu cevap şu talimat paketiyle üretildi"yi
görünür kılar — kanıt rozetleriyle aynı dürüstlük mantığı. Otomatik/always-on yönlendirme
`phases/tracks/webbrain-agent-parity.md` P5'in konusu, buraya değil.

### B3. Çalışma-içi araç onayı transkriptin içinde

**LibreChat:** `Messages/Content/ToolApproval.tsx` + `ApprovalContext.tsx` — onay,
modal değil, **mesaj akışının içinde bir kart**.

**Tepegöz'de bugün:** onay bir modal (`panel-modals.tsx`).

**Uyarlama:** Tepegöz'ün onayı **güvenlik açısından bilerek engelleyici** (modal, odak
çalar) — risk sınıfı adlandırması + ticaret çift-onayı bunun üstüne kurulu. Modal'ı
kaldırmak bir gerileme olur. Ama **onay geçmişi** transkripte kalıcı bir kart olarak
düşmeli: "şu adımda şuna izin verdin" — bugün onay verildikten sonra modal kapanıyor ve
kaydı yalnızca journal'da. LibreChat'in yaptığı şey aslında bu kaydı görünür kılmak.

### B4. Yan panelde "parametreler" bölümü

**LibreChat:** `SidePanel/Parameters/` — model parametreleri (temperature vb.) ayrı bir
panel bölümü olarak.

**Tepegöz'de bugün:** composer'ın dişli popover'ı (provider · model · autonomy · effort).

**Uyarlama:** Tepegöz'ün popover'ı daha iyi (az yer kaplar, bağlam yakın). Alınacak fikir
yalnızca **kalıcı görünürlük**: hangi provider/model/otonomi ile çalıştığı transkriptte
turun başında bir satır olarak kalmalı — sonradan bir çalışmayı okurken "bu hangi modelle
ve hangi otonomiyle koştu" sorusu şu an cevapsız. (Journal biliyor, panel göstermiyor.)

---

## C) Bilerek ALINMAYACAKLAR — ve nedenleri

| LibreChat özelliği                                                                         | Neden almıyoruz                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code Interpreter** (Python/Node/Go/Rust… sandbox'ta kod çalıştırma)                      | ADR-0026: izole-dünya sandbox ölçümle **çürütüldü**, agent code-exec salt-okunur; ADR-0029: DevTools kullanıcı-only. Tepegöz bilerek kod çalıştırmıyor.                                                                       |
| **Artifacts** (sohbette React/HTML üretip render etme)                                     | Aynı sınır: renderer'da model-üretimi kod çalıştırmak Tepegöz'ün renderer-untrusted modelini deler. Mermaid/SVG dışa aktarımı bile ayrı bir güvenlik incelemesi ister.                                                        |
| **Agent Marketplace** (topluluk ajanları keşfet/kur)                                       | Phase 12 (developer platform/marketplace) + ADR-0037 SupplyChainGate'in konusu; bir sohbet-paneli özelliği değil. Şu an frozen.                                                                                               |
| **Image generation / DALL-E / Flux**                                                       | Ürün kapsamı dışı.                                                                                                                                                                                                            |
| **Subagents** (izole child-run'lar, kendi context'leriyle)                                 | Tepegöz aynı anda **tek run** (ADR-0013); paralel DAG Phase 1b'de ve frozen. Yeni bir eşzamanlılık yüzeyi açmak ADR-0013'ü süperseden bir karar ister.                                                                        |
| **Agent Plugins** (deployment skill'leri + MCP sunucularını başlangıçta yükleyen paketler) | "Başlangıçta otomatik yüklenen bundle" = model-öncesi yetki genişlemesi. S9'un "skill asla çalışma başlatamaz" kuralına ve tek-PEP disiplinine aykırı.                                                                        |
| **Presets'i paylaşma / konuşma paylaşımı (stabil URL, misafir görüntüleme)**               | Bulut/hesap gerektirir — Phase 3 (yönetilen abonelik + sync) konusu, frozen. Yerel `/export` zaten var.                                                                                                                       |
| **Langfuse observability**                                                                 | Üçüncü-taraf telemetri; Tepegöz'ün sevk edilmiş event journal'ı yereldir (Notary'nin kriptografik katmanı ise yazılı/testli ama `apps/desktop`'a bağlanmadı, bugün receipt üretmiyor) — dışarı trace göndermek tezine aykırı. |

---

## D) Uygulama sırası önerisi (ucuzdan pahalıya)

1. **A4** mesaj-seviyesi kopyala/alıntıla/düzenle — saf renderer, güvenlik sınırı yok, en ucuz.
2. **A2** context-doluluk göstergesi — veri zaten `cache-window`/`TokenLedger` tarafında var.
3. **A3** faz gruplaması + araç-niyet etiketi — plandan deterministik türetilir, model çağrısı yok.
4. **A1** steer kuyruğu + çip + receipt — `ext-agent` panel-state + IPC'de küçük bir sözleşme değişikliği.
5. **B4** turun başında provider/model/otonomi satırı — journal'da olan bilgiyi görünür kılmak.
6. **B3** onay geçmişini transkripte kalıcı kart olarak düşürmek (modal kalır).
7. **B2** skill pill'leri (yalnız görünürlük; otomatik yönlendirme buraya değil).
8. **B1** çoklu-soru `clarify` — şema değişikliği + `@tepegoz/shared-types` + güvenlik incelemesi ister; en pahalısı ve en dikkatlisi.

Hepsi `extensions/ext-agent` + (B1 için) `@tepegoz/shared-types`/`@tepegoz/orchestrator`
kapsamında; hiçbiri `apps/desktop`'u büyütmez. Her yeni kullanıcı-görülür string
`extensions/ext-agent/src/i18n/{en,tr}.ts`'e **aynı PR'da** EN + tam TR parity ile girer
(ADR-0016) — LibreChat'in kendisi locize ile ~20 dile çevrili, bu disiplin ondan da tanıdık.

---

## Bir de not: LibreChat'in sağlayıcı genişliği

Doğrudan panel konusu değil ama kayda değer: LibreChat "Custom Endpoints — **proxy'siz**
herhangi bir OpenAI-uyumlu API" modeliyle Ollama/groq/Cohere/Mistral/MLX/koboldcpp/
together/OpenRouter/Perplexity/Deepseek/Qwen'i tek bir yapılandırma dosyasından
(`librechat.yaml`) destekliyor. Bu, `phases/tracks/webbrain-agent-parity.md` **P1**'in
(sağlayıcı kataloğu = kod değil veri) bir başka canlı örneği — WebBrain'in 108 kartıyla
aynı fikir, farklı ambalaj. P1 yazılırken `librechat.yaml`'ın şeması ikinci bir referans
olarak okunabilir.
