# Tepegöz vs LibreChat — AI/ajan fonksiyonları karşılaştırması

> **Ne bu?** Tepegöz'ün AI/ajan katmanı ile **LibreChat** (MIT lisanslı, kendi sunucunda barındırılan
> **çok-kullanıcılı AI sohbet platformu** + ajan çerçevesi, `v0.8.8-rc1`) arasında, örtüşen eksenlerde
> iş-iş kimin neyi daha iyi yaptığını tabloya döken derinlemesine bir karşılaştırma.
>
> **Yöntem.** `.junk/librechat` deposunun (`README.md`, `README.zh.md`, `CLAUDE.md`, `AGENTS.md`,
> `CONTEXT.md`, `tool-intent-spec.md`, `librechat.example.yaml` (1.282 satır), `.env.example`,
> `docker-compose.yml` / `deploy-compose.yml` / `rag.yml`, `package.json`'lar; `packages/api/src/
{agents,agents/hitl,agents/hooks,agents/steering,mcp,mcp/oauth,tools,web,code,files,actions,
artifacts,memory,protection,admin,acl,auth,crypto,langfuse,stream,skills}`, `packages/data-provider/
src/{schemas.ts,config.ts,permissions.ts,providers.ts,actions.ts}`, `packages/data-schemas/src/
{crypto,methods/tx.ts,methods/spendTokens.ts,schema/*}`, `api/server/{controllers/agents,services,
middleware,strategies}`, `api/app/clients/tools/manifest.json`, `client/src/locales/*`, `e2e/`) ve bu
> reponun AI yüzeyinin (`phases/ai-agent/`, `packages/orchestrator|model-gateway|capability-plane|
security-policy|agent-runtime|browser-tools|web-tools|tool-executor|local-inference|model-catalog|
mcp-client|recipe-compiler|macro-engine|notary|credential-vault|human-input|tasks|agent-eval|
persistence|i18n`, `extensions/ext-agent`, `docs/adr/*`) aynı oturumda okunmasından çıkarıldı.
>
> **Tarih.** 2026-09-01.
>
> **Dil notu.** Bu belge, sahibe sunulduğu haliyle Türkçe tutulmuştur (`phases/tracks/README.md`'deki
> "orijinal dilinde tutulur" kaydıyla aynı gerekçe). Proje eserleri İngilizce-öncedir; bu, yazıldığı
> haliyle korunan bir kayıttır.
>
> **İlgili:** [`docs/others/librechat-agent-ui-learnings.md`](librechat-agent-ui-learnings.md) — aynı
> depodan **yalnızca ajan sohbet arayüzü** açısından çıkarılmış, `ext-agent` panelini iyileştirmeye
> yönelik ayrı bir belge; bu karşılaştırma onu tekrar etmez, tamamlar. Ayrıca
> [`phases/tracks/webbrain-agent-parity.md`](../parities/webbrain-agent-parity.md) — sağlayıcı
> kataloğu (P1) gibi bazı bulguların zaten iz sürdüğü track.
>
> **Kategori uyarısı.** Bunlar **farklı ürün kategorileri**. LibreChat bir _tarayıcı ajanı değil_:
> kendi sunucunda barındırdığın, MongoDB + Meilisearch + pgvector + harici bir RAG servisi üstünde
> koşan, **çok-kullanıcılı bir AI sohbet platformu** — OAuth2/LDAP/SAML girişi, roller/gruplar/ACL,
> yönetim paneli, token bakiyesi, paylaşılan konuşmalar; ve bunun üstünde bir **ajan çerçevesi**
> (araçlar, MCP, kod yorumlayıcı, dosya arama, alt-ajanlar). Tepegöz ise _tek kullanıcılı, yerel bir
> tarayıcı_: sayfayı okur, tıklar/yazar, form gönderir, sekme yönetir, model-öncesi deterministik bir
> Policy Kernel'den geçer, tamamlamayı kanıta atıfla imzalar. Web'i **okuma** dışında ortak bir iş
> yüzeyleri yok. Bu belge önce bu asimetriyi söyler, sonra **yalnızca örtüşen eksenlerde**
> (çok-sağlayıcı/model genişliği, **MCP — ikisi de istemci, nadir bir doğrudan eşleşme**, ajan/araç
> çerçevesi ve izin modeli, context yönetimi, RAG/dosya arama, bellek, maliyet şeffaflığı,
> i18n/Türkçe, kendi-kendine barındırma/egemenlik, sır işleme, denetlenebilirlik) iş-iş kıyaslar.
> Kategoriye özgü olanlar `## Örtüşmeyen alanlar` başlığında açıkça ayrılır.

---

## Önce çerçeve: bunlar farklı ürünler

|             | LibreChat                                                                                                                                                                                                   | Tepegöz                                                                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ne          | Kendi sunucunda barındırılan **çok-kullanıcılı AI sohbet platformu** + no-code ajan çerçevesi; web uygulaması                                                                                               | Tam **Electron tarayıcı**; ajan (Agent Console / "Do modu") alt sistemlerden biri                                                                   |
| Olgunluk    | **Yayında** — `v0.8.8-rc1`, MIT, Docker/Helm/Railway/Zeabur/Sealos dağıtımları, ~4.300 TS/JS dosya, 41 dil, Discord + YouTube + ayrı dokümantasyon sitesi, canlı katkıcı topluluğu                          | **1.0 öncesi**; `phases/ai-agent` S0–S12 fazlarının **hepsi 🟠 measurement-owed**, hiçbiri ✅ değil, sahip notu: _"hâlâ istediğim gibi çalışmıyor"_ |
| Kod         | TS + eski JS `api/` katmanı, npm workspaces + Turborepo, 4 paket (`api`, `client`, `data-provider`, `data-schemas`); ajan döngüsü **harici npm paketi** `@librechat/agents ^3.7.11` (LangGraph sarmalayıcı) | Strict TS, pnpm + turbo monorepo, ~71 `@tepegoz/*` paket, ADR güdümlü, zod `safeParse` her güven sınırında; **ajan döngüsü kendi kodu**             |
| Felsefe     | "Tüm sağlayıcıları tek, gizlilik-odaklı arayüzde birleştir; AI altyapını kendin kontrol et"; yapılandırma-önce (`librechat.yaml` + admin paneli), operatör-güdümlü                                          | "Security-by-design, local-first"; model-öncesi deterministik çekirdek + kriptografik hesap verebilirlik + determinism-first                        |
| Birincil iş | İnsanların (ekiplerin) model/ajanlarla **sohbet etmesi**: dosya yükle, kod çalıştır, RAG sorgula, araç çağır, konuşmayı paylaş; kurumsal kimlik + kota + denetim                                            | Web'de **görev yürütmek**: gezinme, form doldurma, çıkarım, çok-adımlı akış; güvenli oturum-açık site otomasyonu                                    |

Yani: **olgun, geniş, gerçekten dağıtılan bir sohbet/ajan platformu** vs. **erken, mimari ağırlıklı,
güvenlik-önce bir tarayıcı ajanı**. Ortak iskelet gerçek — "LLM + araçlar + izin + context + MCP" —
ama LibreChat'in ajanı bir _sohbet penceresi içinde_ araç çağırır; Tepegöz'ünki _senin oturum-açık
tarayıcında_ durum değiştirir. Risk profilleri de bu yüzden farklı, ve bu farkın hangi tarafın
tasarımını haklı çıkardığı aşağıda eksen eksen ayrılıyor.

---

## Derinlemesine: örtüşen eksenlerde iş iş kim ne yapıyor

### Model / sağlayıcı genişliği — LibreChat açık ara

LibreChat: `EModelEndpoint` **9 birinci-sınıf uç** (`azureOpenAI`, `openAI`, `google`, `anthropic`,
`assistants`, `azureAssistants`, `agents`, `custom`, `bedrock`) —
`packages/data-provider/src/schemas.ts`. Bunun üstünde **`custom` uç noktası**: `librechat.yaml`'a bir
blok yazarak **herhangi bir OpenAI-uyumlu API**'yi proxy'siz bağlarsın (`baseURL`, `models.fetch`,
`headers`, `addParams`/`dropParams`, per-model `tokenConfig`), ve `provider: anthropic` tek kaçış
yoluyla native `/v1/messages` istemcisine de düşebilirsin. `KnownEndpoints` ~20 tanınmış sağlayıcı
adı, `ProviderId` 26 marka kimliği, `endpoints/custom/providers.ts`'de **26 hostname → marka** tablosu
tutuyor (openrouter, deepseek, groq, mistral, perplexity, together, x.ai, moonshot, cohere, fireworks,
huggingface, apipie, shuttleai, unify, helicone, vercel, dashscope…). Örnek YAML'da **6 adlandırılmış
örnek** (Claude-uyumlu, groq, Mistral, OpenRouter, Helicone, Portkey), `.env.example`'da **15**
sağlayıcı anahtarı yeri. Pratik sonuç: sağlayıcı listesi **kod değil veri** — kullanıcı yeni sağlayıcı
eklemek için PR açmaz.

Tepegöz: **8 sağlayıcı** (`anthropic`, `openai`, `gemini`, `kimi`, `nova`, `deepseek`, `xai`, `groq`)

- `local`, hepsi `packages/shared-types/src/providers.ts`'de **kodda sabit bir union**; adaptörler
  `anthropic`, `openai`, `gemini`, `kimi`, `nova`, `openai-compat`. Yeni bir sağlayıcı eklemek bir kod
  değişikliği. Buna karşılık `RUNNABLE_AI_PROVIDERS` ayrımı dürüst: "anahtarı saklanabilir" ile
  "bugün sürülebilir" farkı tipte kayıtlı ve Settings UI bunu gösteriyor.

**LibreChat — kıyas kabul etmez.** Tepegöz'ün cevabı yapısal olmalı (katalog = veri), sağlayıcı
sayısını kodda büyütmek değil.

### Sağlayıcı mimarisi / normalizasyon — Tepegöz

LibreChat'te **normalize edilmiş tek bir istek/yanıt şeması yok**. Her uç için bir `initialize*`
fonksiyonu (`providerConfigMap` — toplam **5 farklı initializer**) sağlayıcıya özgü bir config nesnesi
üretir; asıl LLM çağrısı ve akış olayları **harici `@librechat/agents` npm paketinin** içinde. Yani
provider katmanı bir caret aralığıyla (`^3.7.11`) bağlı, bu repoda okunamayan bir tarball. Bunun
karşılığı hız: paket güncellenince yeni model/sağlayıcı davranışı bedava gelir.

Tepegöz: **tek `CanonRequest`/`CanonResponse` şeması**, `ModelGateway.complete()` her çağrıda
`maxTokens` + `timeoutMs` ZORUNLU, `ModelRouter` yeteneği (plan/exec/classify) tier + local/cloud'a
eşliyor, `TokenLedger` provider+model+capability granülaritesinde sayıyor, streaming sınırı ADR-0025
ile tanımlı. Ajan döngüsü kendi kodu — dışarıdan gelen bir sürüm yükseltmesi davranışı sessizce
değiştiremez.

**Tepegöz** — daha temiz, tipli, tek kaynaklı ve sahiplenilmiş; ama bedeli yukarıdaki genişlik farkı.

### MCP — ikisi de **istemci**; asıl fark izin modelinde

Bu, iki proje arasındaki **en doğrudan eşleşen eksen**, o yüzden ayrıntı hak ediyor.

LibreChat, `@modelcontextprotocol/sdk ^1.30.0` ile bir **MCP istemcisi**. Sunucu yüzeyi yok: üretim
kodunda yalnızca `client/*` import'ları var, `server/*` yalnızca testlerde sahte sunucu kurmak için.
Kapsam etkileyici:

- **4 taşıma**: `stdio`, `websocket`, `sse`, `streamable-http` (`mcp/connection.ts`).
- **OAuth**: 21 dosyalık ayrı bir alt sistem (`mcp/oauth/`) — PKCE (S256), dinamik istemci kaydı,
  RFC 9728 `/.well-known/oauth-protected-resource` keşfi, RFC 8707 `resource` parametresi,
  on-behalf-of (OBO) token değişimi, yeniden-bağlanma yöneticisi.
- **Bütçeler ve süpervizyon**: `tools/list` için 50 sayfa / **1000 araç** / 5 MiB / 30 s tavanları;
  devre kesici (7 döngü / 45 s pencere / 300 s max backoff); `notifications/tools/list_changed`
  aboneliğiyle **çalışırken araç listesi tazeleme**; kullanıcı-başı bağlantı havuzu, 15 dk boşta
  zaman aşımı.
- **İsim alanı**: `${tool}_mcp_${server}`, sunucu adı normalize, hem kısaltılmış hem tam ad **alias**
  olarak tutuluyor ki bir yeniden-adlandırma bir `deny` kuralını sessizce açık bırakmasın.
- **İzin**: `PermissionTypes.MCP_SERVERS` → `use`/`create`/`share`/`public`/`configureObo`; MCP
  sunucuları YAML'dan **veya kullanıcı tarafından DB'ye** tanımlanabiliyor, ve kullanıcı-tanımlı bir
  sunucu eklerken gösterilen `trustCheckbox` metni açıkça şunu diyor: _"LibreChat bu MCP sunucusunu
  incelemedi. Saldırganlar verilerinizi çalmaya ya da modeli istenmeyen eylemlere — veri imhası
  dahil — kandırmaya çalışabilir."_

Tepegöz de **MCP istemcisi** (ADR-0018), ama kapsam çok daha dar ve disiplin çok daha sıkı:

- **Taşıma**: yalnızca `stdio` **bağlı**; `http_sse` şemada kabul ediliyor (ileri-uyum) ama transport
  yazılmamış (`packages/mcp-client/src/config.ts`). OAuth yok. Bu, LibreChat'e karşı **gerçek bir
  boşluk**.
- **Tehlike sınıflandırması**: `dangerClassFor` MCP'nin `readOnlyHint`/`destructiveHint`
  annotation'larını okur ve **fail-safe** yorumlar — yalnız `readOnlyHint === true` bir aracı `read`'e
  indirebilir, `destructiveHint` `destructive`'e (ask + biyometrik) yükseltir, **eksik/false hint
  varsayılan olarak `state_changing` → ask**. LibreChat'te bu annotation'lar için depoda **sıfır
  referans** var: okunmuyor.
- **Aynı hat**: dış MCP araçları `CapabilityRegistry`'ye girer ve built-in araçlarla **ayrımsız aynı
  ToolGateway PEP'inden** geçer — zod → PolicyKernel → HITL → audit. LibreChat'te MCP aracı, adı bir
  glob'a uyarsa onay ister; uymazsa doğrudan çalışır.
- **Sunucu yüzeyi**: ikisinde de yok (Tepegöz'de Phase 1b maddesi, yapılmamış).

**Bugün LibreChat** (taşıma çeşitliliği, OAuth, canlı yenileme, ölçek bütçeleri — hiçbiri Tepegöz'de
yok). **Mimaride Tepegöz** (annotation'a dayalı deterministik tehlike sınıfı + tek PEP; bir MCP
sunucusunun aracı ile yerel bir aracın denetimi aynı). İkisi birleşse doğru cevap çıkardı: Tepegöz'ün
kapısı, LibreChat'in taşıma/OAuth kapsamı.

### Ajan döngüsü / orkestrasyon — farklı şekiller, LibreChat daha çok yüzey

LibreChat: tek bir **ReAct tarzı LangGraph döngüsü**, `Run.create()` ile kurulup
`run.processStream()` ile sürülüyor; asıl döngü harici SDK'da. Ana host dosyası
`api/server/controllers/agents/client.js` **5.237 satır**. Sınırlar somut: `DEFAULT_RECURSION_LIMIT =
50` (YAML'da `maxRecursionLimit` ile tavanlanabilir), tek bir akışlanan araç-çağrısı argümanı 64 KiB'ı
aşarsa run iptal (`create_file` için 128 KiB istisnası), per-turn delta olay tavanı opsiyonel.
Planner/executor ayrımı **yok**; delegasyon bir _araç_: `subagents` yeteneği açıkken model
alt-ajan doğurabilir (kendi kendini de), izole context'te, sonucu özet olarak döner. Grafik alt-ajanlar
(`edges`, `entryAgentId`, `resultAgentId`) çok-ajanlı devir-teslim yüzeyini veriyor; sert tavanlar:
derinlik 5, 50 grafik düğümü, 100 genişletilmiş config, ajan-başı 10 (tavan 50) alt-ajan. Ayrıca
**arka planda** çalışan alt-ajanlar/araçlar + `check_background_task` yoklama aracı, ve dayanıklı
`Stop`/`PostToolBatch`/`PreemptBoundary` kancalarıyla **çalışırken steer**.

Tepegöz: **Planner (Intent→DAG) → Executor (PEP üzerinden serileştirilmiş) → Reactor**
(continue/retry/replan/stop, tipli `Decision`). İki-aşamalı HITL (plan önizleme + araç-başı), her ikisi
fail-safe (yanıt yok = deny). `CompletionEvidence`, navigation-grounding, cache-window (lag-2
breakpoint), `quick-decision` TSV yolu. Ama **aynı anda tek çalışma** (ADR-0013); alt-ajan yok, paralel
DAG yok, arka-plan görev yoklama aracı yok, checkpoint-resume yok.

**Bugün LibreChat** — daha çok eşzamanlılık yüzeyi, dayanıklı duraklama/sürdürme, gerçek kullanımda
pişmiş sınırlar. **Tepegöz** yapı olarak daha açık (tipli kararlar, açık DAG) ama serileştirilmiş ve
kanıtsız.

### Araç/izin modeli — Tepegöz'ün asıl kozu

LibreChat: **`toolApproval` politikası** (`endpoints.agents.toolApproval`, `agents/hitl/policy.ts`) —
`enabled` (varsayılan **kapalı**), `mode` (`default` / `dontAsk` / `bypass`) ve **glob listeleri**
`allow` / `deny` / `ask` (`mcp:*:delete_*` gibi). Değerlendirme sırası `deny → ask → allow → bypass →
dontAsk → eşleşmeyen ise ask`; `deny` `bypass`'ı bile yener. Kullanıcıya sunulan kararlar
`approve` / `reject` / `edit`. Duraklatılan run MongoDB checkpointer'a yazılır, onay penceresi
varsayılan 24 saat; `resolve()` yarışan iki tıklamadan yalnız birine `true` döner (çift-faturalama
yok). Politika **operatör tarafından, YAML'da, statik olarak yazılır**; per-agent ve per-skill katmanlar
şemada var ama henüz bağlı değil. Ayrıca Claude-Code tarzı 13 olaylı **kanca** sistemi
(`PreToolUse`/`PostToolUse`/`PermissionDenied`/`Stop`/`PreCompact`…), süreç-başlangıcında bir kez
yüklenen modüllerle.

Tepegöz: **tek Policy Enforcement Point.** `ToolGateway` sabit sırada çalışır — _lookup → idempotency
→ zod doğrulama → PolicyKernel → HITL → execute → audit_ — ve built-in/MCP/eklenti araçları arasında
ayrım yapmaz. `PolicyKernel` **statik bir liste değil, çalışma-zamanı sınıflandırıcısıdır**: girdileri
aracın danger class'ı + argümanların taint durumu + hedef URL + tabın egress durumu + (varsa) kod
çalıştırma sınıfı; çıktısı `allow/deny/ask` + **kapalı bir union'dan makine-okunur `PolicyReason`** +
biyometrik gereksinimi. Her reason kodunun EN + TR metni olduğu bir tamlık testi var: kullanıcıyı
durduran bir kuralı ona açıklamamak **derleme hatası**. `isSensitiveSite` (banka/kripto/sağlık/kamu/
parola yöneticisi) **her otonomi seviyesinde sert deny**; otonomi yalnızca kernel'in sorduğu prompt'u
atlayabilir, deny'ı bozamaz. Hatırlanan izinler `expires_at NOT NULL`, göreve + host'a scope'lu, ve bir
SQL `CHECK` `credential`/`financial`/`destructive` tierlerini tablodan tamamen dışlıyor.

**Tepegöz** — belirgin fark. LibreChat'in modeli "operatör hangi araç adlarının sorulacağını yazar";
Tepegöz'ünki "eylemin ne yaptığı, argümanların nereden geldiği ve neyi hedeflediği kararı verir".
LibreChat'in varsayılanının **kapalı** olması da ayrı bir fark: kutudan çıktığı gibi her araç çağrısı
onaysız çalışır.

### Otonomi ve insan-döngüde — bölünmüş

LibreChat, kullanıcının **soru sormasını** ajana veren tarafta daha iyi: `ask_user_question` gerçek bir
araç, tek formda **4 soruya kadar** (her biri 12 seçeneğe kadar), duraklat-sür, ve fail-closed
tasarlanmış — alt-ajanlarda ve HITL yeteneksiz yollarda araç listeden **çıkarılıyor** ki model
sürdürülemeyecek bir interrupt'ta takılmasın. Model-üretimi tüm dizeler sunucu tarafında sert
uzunluk sınırlarına vuruyor (soru 2000, seçenek etiketi 280 karakter) — yorum aynen şunu diyor:
"bunların hepsi model üretimi ve aynen render ediliyor, o yüzden modele güvenmek yerine burada
sınırla".

Tepegöz: **kademeli otonomi** (`ask`/`act`/`auto`, rezerve `dangerous`) + amber risk banner + plan
önizleme (adım seç) + ticaret çift-onayı + scope-grant UX + **Human Handoff Controller** (CAPTCHA/2FA
= kullanıcıya devret, çözmeye çalışma; ADR-0039). `clarify` tek soru sorar — LibreChat'in çoklu-soru
formu burada net bir üstünlük ve zaten `librechat-agent-ui-learnings.md` B1'de alınacaklar arasına
yazılmış.

**LibreChat** soru-sorma ergonomisinde; **Tepegöz** rıza granülerliğinde ve devretme davranışında.

### Context yönetimi & sıkıştırma — LibreChat daha ayarlanabilir

LibreChat: özetleme ve budama **SDK'nın içinde** çalışır, host yapılandırır. Tetikleyici ayrık bir
union — `token_ratio` | `remaining_tokens` | `messages_to_refine`; `retainRecent { turns: 0..20,
tokens }` klasik özet-tamponu davranışını verir; ayrı bir `contextPruning`
(`keepLastAssistants`, `softTrimRatio`, `hardClearRatio`, `minPrunableToolChars`) şişkin araç
sonuçlarını hedefler; `reserveRatio` 0.05'e indirilmiş (yorumda gerekçesi yazılı: özetleme geldiği
için). Özetleme **farklı bir sağlayıcıya/modele** yönlendirilebiliyor. Ayrıca bir
**compaction semantic index**: sıkıştırma sonrası aktivite/akıl-yürütme etiketleri hayatta kalsın diye
sınırlı, redakte edilebilir bir projeksiyon saklanıyor. UI'da `ON_CONTEXT_USAGE` olayıyla beslenen bir
context-doluluk göstergesi var.

Tepegöz: `cache-window` (lag-2 breakpoint), Reactor working-state collapse
(`COLLAPSED_STATE_PLACEHOLDER`), algı tarafında değişen-only diff + değişmeyen eleman elision +
kompakt TSV serileştirme (S2). Yani sıkıştırma **algı katmanında** ve deterministik; mesaj geçmişini
modele özetletme yolu yok. Kullanıcıya gösterilen şey **maliyet** (token sayacı + %80 kota uyarısı),
**context doluluğu değil**.

**LibreChat** — daha çok ayar, daha çok görünürlük, gerçek uzun sohbetlerde pişmiş. Tepegöz'ün yaklaşımı
daha ucuz ve daha deterministik ama dar ve ölçülmemiş.

### Prompt yapımı & güvenilmez içerik — bölünmüş, ve iki taraf farklı şeyleri çözüyor

LibreChat'in sistem-prompt'u iki parçaya ayrılmış: **kararlı** kısım (`instructions` = araç bağlam
metinleri + ajanın talimatları) ve **dinamik kuyruk** (`additional_instructions` = dinamik araç
bağlamı, artifact prompt'u, skill talimatları, bellek, MCP sunucu talimatları) — ayrımın gerekçesi
kod yorumunda açık: **prompt önbelleği**. Bu iyi bir mühendislik.

Ama **prompt-injection tarafında LibreChat'te bir savunma alt sistemi yok.** Depoda
`prompt injection` / `jailbreak` için **sıfır eşleşme**; `untrusted` geçen tüm yerler ya test verisi ya
da riski _kabul eden_ yorumlar ("araç çıktısındaki injection ile yönlendirilmiş olabilir"). Araç
sonuçları ya da kazınmış web içeriği için nonce'lu sarma, sınır-kaçış temizliği, homoglyph/zero-width
filtresi yok. Bunun yerine başka türden savunmalar var, ve bunlar gerçek:

- **SSRF sertleştirmesi** en gelişmiş kontrol: `isPrivateIP`, `isAddressAllowed`, bağlantı-anında
  çözümlenmiş-IP doğrulaması (DNS rebinding'i yener), `allowedAddresses` yalnız `host:port` biçiminde
  ve yalnız özel IP alanı için muafiyet; MCP, MCP-OAuth, web search, Actions, OCR, model listeleme,
  kod ortamları hepsi bu hattan geçiyor.
- **İçerik filtresi / PII**: `filters.*` altında 13 kaynak (mesajlar, prompt'lar, ajan talimatları,
  skill'ler, bellekler, dosyalar, **araç argümanları ve çıktıları**, action metadata…) için RE2
  sözdizimli, config yüklenirken doğrulanan desenler + `sk_prefix`/`bearer_header`/`api_key_header`
  başlangıç kataloğu. Bir **içerik-kaynağı (provenance)** modeli de var (`user`/`administrator`/
  `model`/`tool`/`retrieval`/`system`/`external_agent`).
- **Sınırlama**: model-üretimi etiketler ve araç I/O'su, modele ulaşmadan önce **anahtarlar da dahil**
  budanarak seri hale getiriliyor; çıktı ilk satır + 200 karaktere kırpılıyor.
- **Spekülatif çalıştırma dışlamaları**: `create_file`, `edit_file`, `execute_code`, `bash_tool`,
  `ask_user_question` mid-stream eager execution'dan çıkarılmış — tur commit olmadan bir yazma/çalıştırma
  inmesin diye.

Tepegöz: `@tepegoz/tool-executor` ayrı bir pakette `sanitizeText` (gizli/zero-width/bidi/homoglyph
enjeksiyon vektörleri), `wrapUntrustedContent`, `finalizeElements`; üstünde **model-öncesi
deterministik Policy Kernel** (bir prompt-injected model kendi yetkisini genişletemez);
**`EgressFirewall`** — `inspectEgress` ile 7 bulgu sınıfı: `secret_token`, `private_key`,
`base64_blob`, **`high_entropy` (Shannon entropisi)**, `pii_email`, `pii_card`, `pii_iban`; bulgu
örnekleri **redakte** (ham sır asla log/audit'e echo'lanmaz). `TaintTracker` provenance seviyeleri.
Credential Broker (sırrın ajana ulaşacağı bir şekil yok — **atıl sevk**).

**Mimaride Tepegöz** (güvenilmez-içerik sarma + taint + çıkış-sızıntı denetimi + entropi analizi;
LibreChat'te hiçbirinin karşılığı yok). **Bugünkü kanıtta ikisi de zayıf**: LibreChat hiç ölçmüyor,
Tepegöz'ün claim-grade ASR bataryası **measurement-owed** (S6). SSRF ve regex-DoS sertleştirmesinde
**LibreChat açık ara** — Tepegöz'ün web-tools tarafında SSRF-güvenli sitemap reader var ama LibreChat
ölçeğinde bir hat yok.

### RAG / dosya arama / çevrimdışı bilgi — LibreChat var, Tepegöz yok

LibreChat: `file_search` yeteneği **harici bir servise** delege ediliyor —
`rag.yml`/`docker-compose.yml`'de `vectordb` = `pgvector/pgvector:0.8.0-pg15-trixie` ve
`rag_api` = ayrı bir Python konteyneri. Gömme (embedding) sağlayıcısı da harici:
`EMBEDDINGS_PROVIDER=openai`, `EMBEDDINGS_MODEL=text-embedding-3-small`. Yani **hiçbir şey
süreç-içi ya da çevrimdışı değil** — `rag_api` + `vectordb` + bir embeddings anahtarı yoksa
`file_search` "yüklü dosya yok" moduna düşer. Buna karşılık süreç-içi ingest zinciri gerçekten geniş:
docx/odt/xlsx/ods/xls (LibreOffice), HTML, metin çıkarımı, görüntü/ses/video kodlama, ve **5 OCR
stratejisi** (`mistral_ocr` varsayılan, `custom_ocr`, `azure_mistral_ocr`, `vertexai_mistral_ocr`,
`document_parser`). Web arama tarafı da bir boru hattı: **4 arama** (serper/searxng/tavily/keenable) ×
**4 kazıyıcı** (firecrawl/serper/tavily/keenable) × **2 yeniden-sıralayıcı** (jina/cohere), Unicode
alıntı-çapası protokolüyle kaynak atıfları.

Tepegöz: **çevrimdışı RAG yok, gömme yok, vektör deposu yok** — `packages/` altında `embedding`/
`vector`/`pgvector`/`faiss` için sıfır eşleşme. Karşılığı olan şeyler daha dar: `@tepegoz/web-tools`
(`web_search`, salt-okunur `web_get_page`, SSRF-güvenli sitemap reader), `@tepegoz/reader` (makale
çıkarımı, HTML'siz tipli bloklar), `browser_get_article`, ve `journal_search_events`. Ajan **PDF
okuyamıyor** (browser-tools/reader'da PDF için sıfır referans), OCR yok. `@tepegoz/local-inference`
bir seam + sha256'lı GGUF kataloğu sunuyor ama S12 indirilmiş ağırlıklara takılı.

**LibreChat** — net. Tepegöz'de bu bir _yokluk_, zayıflık değil sadece kapsam dışı; ama "belgelerimle
konuşayım" isteyen kullanıcı için fark mutlak.

### Bellek — mimaride Tepegöz, kullanımda LibreChat

LibreChat: bellek **modelin yazdığı** bir şey — `set_memory` / `delete_memory` gerçek araçlar. Opsiyonel
bir arka-plan "memory agent"ı sohbetten otomatik bellek çıkarabiliyor (`recursionLimit: 3` ile sert
kısıtlı). Ajan-başı izolasyon var ama **opt-in** (`memory_scope`); yoksa paylaşılan kişisel havuz.
Bütçeler gerçek: `tokenLimit` (örnek 10.000), `charLimit`, `validKeys` allowlist'i, anahtar regex'i,
`maxInputTokens: 12000`. Bellek prompt'a **`# Existing memory about the user:` başlığıyla düz güvenilir
metin olarak** enjekte ediliyor; zehirlenmiş bir belleğin sonraki turu yönlendirmesine karşı tek
savunma **prompt talimatı**. Buna karşılık **okuma-anında yeniden doğrulama** var: `projectStoredMemories`
güncel PII politikasını saklanmış satırlara yeniden uyguluyor ve ihlal eden alanları
`contentFilterBlocked: true` ile boşaltıyor — yani politika değişikliği geriye dönük etki ediyor. Ama bu
bir **sızıntı filtresi**, injection filtresi değil.

Tepegöz (ADR-0027, S9): dört özellik, hepsi _inşa yoluyla_: (1) **yazmada filtre** — `decideWrite`
`detectThreats`'i persist'ten önce çalıştırır ve reddi tehdit türleriyle journallanabilir kılar;
(2) **inşa yoluyla tavsiye niteliğinde** — hatırlanan notlar `role: 'user'` gözlemi olarak, **güvenilir
görev çitinin dışında** enjekte edilir; önerdikleri şey yine ToolGateway PEP'ini geçmek zorundadır,
yani politika tavanı bir sitenin kendisi hakkında hatırladıklarıyla değişmez; (3) **canlı DOM'a karşı
yeniden doğrulama** — ipucu konumsal ref değil dayanıklı bir descriptor (`tag`/`role`/`name`) taşır ve
çözülmezse atılır (bayatlık _ipucu yok_'a düşer, _yanlış tıklama_'ya değil); (4) **karantina satırı
saklar** — bir politika reddine yol açmış ipucu sunulmayı bırakır ama kanıt olarak kalır. Ayrıca store
**kendi satırlarına güvenmez**: her okuma `safeParse` eder ve geçmeyeni düşürür. Kayıt bir kez, site
başına gelir.

**Mimaride Tepegöz** — açık ara; LibreChat'in bellek zehirlenmesine cevabı prompt talimatı, Tepegöz'ünki
veri yapısı. **Bugünkü faydada LibreChat** — modelin yazdığı, kullanıcı ayarlarında görünen, gerçekten
kullanılan bir bellek; Tepegöz'ünki S9 🟠 ve ölçülmemiş.

### Skill / iş akışı / zamanlama — bölünmüş

LibreChat: **Skills** = yeniden kullanılabilir `SKILL.md` talimat paketleri, üç durumda (manuel,
otomatik, her-zaman-açık), dosya ekleriyle, kataloğu model-görünür (`maxCatalogSkills`), ACL'lenebilir
ve paylaşılabilir; ayrıca dağıtım-seviyesi `skill/` klasörü (sunucu açılışında yüklenir, salt-okunur).
**Agent Plugins** (deneysel) skill + MCP sunucusu + opt-in kancaları tek pakette başlangıçta yükleyebilir.
**Schedules** (deneysel) ajanı cron'la çalıştırır — `maxPerUser`, `minIntervalMinutes`,
`autoDisableAfterFailures`, proje-zorunluluğu gibi operatör kontrolleriyle.

Tepegöz: skill = **saklı prompt şablonu** — seçince composer'ı doldurur, **asla çalıştırmaz** (S9'un
bilinçli kararı: "gönder" jesti insanda kalır). Buna karşılık **model-free deterministik şerit** var,
ki LibreChat'te karşılığı yok: `@tepegoz/macro-engine` (iMacros halefi, kontrol akışı + oto-bekleme),
`@tepegoz/recipe-compiler` (imzalı, `evaluateAssertion` başarı oracle'lı, kendini iyileştiren seçicili
tekrar-oynatma) ve `@tepegoz/tasks` (kayıtlı görev, interval/page-change/external tetikleyici,
`task_*` araçları).

**LibreChat** skill'lerin _iş yaptığı_ tarafta; **Tepegöz** modelsiz tekrarlanabilirlikte. Zamanlama
ikisinde de var, LibreChat'inki operatör kontrolleriyle daha olgun.

### Maliyet şeffaflığı — LibreChat somut, Tepegöz henüz token sayıyor

LibreChat: `packages/data-schemas/src/methods/tx.ts` **elle bakımı yapılan bir fiyat tablosu** —
`tokenValues` ~216 satır + 75 Bedrock satırı, `cacheTokenValues` 76 satır (write/read), premium tier
tabloları (`threshold` üstünde farklı fiyat). Birim "1 USD / 1M token". Eşleme **substring, en uzun
anahtar kazanır** — kırılgan olduğu dosyanın kendi başlığında yazıyor; ve tanınmayan bir model
`defaultRate = 6` ile sessizce faturalanıyor. Harcama `Transaction` satırlarına yazılıyor
(`rate`, `rawAmount`, `tokenValue`, input/write/read token'ları ayrı), `Balance` `tokenCredits`
tutuyor (`1000 tokenCredits = 1 mill = $0.001`), otomatik dolum ayarlanabiliyor, ön-uçuş
`checkBalance` var. Kullanıcıya **kredi olarak** gösteriliyor; para birimi cinsinden context maliyeti
`interface.contextCost` ile ve **varsayılan kapalı**. Harcama yazımı hata yutuyor — faturalama
başarısızlığı isteği düşürmüyor.

Tepegöz: `TokenLedger` provider+model+capability granülaritesinde input/output/cache-read/cache-write
sayıyor, `BudgetStatus` kota + %80 uyarısı + ön-uçuş bütçe kapısı veriyor. Ama **fiyat tablosu yok** —
`$/task` kuzey-yıldızı koşulu #4'ün konusu ve S7'de **measurement-owed**. Yani bugün "kaç token" var,
"kaç dolar" yok.

**LibreChat** — bugün somut para birimi muhasebesi ve kotası olan taraf. Tepegöz'ün bahsi daha iddialı
($/task'ı _yayımlamak_) ama henüz yayımlanmadı.

### Sır / kimlik bilgisi işleme — kavramsal olarak Tepegöz, pratikte ikisi de eksik

LibreChat: kullanıcı-sağlanan anahtarlar MongoDB'de şifrelenmiş (`Key` ve `PluginAuth`
koleksiyonları), sentinel `user_provided`. Şifreleme `packages/data-schemas/src/crypto/index.ts`:
üç kuşak bir arada — v1 `AES-CBC` **sabit global IV** ile (`CREDS_IV`), v2 `AES-CBC` rastgele IV ile,
v3 `aes-256-ctr`. **Hiçbiri AEAD değil** (GCM yok, HMAC yok, doğrulama etiketi yok), ve anahtar
kaynağı ortam değişkeni (`CREDS_KEY`/`CREDS_IV`). Eksikse `credentials.ts` bunları **otomatik üretip
`.env.temp`'e yazıyor** (0600). Bilinen sızmış varsayılanların SHA-256 parmak izleri tutuluyor: JWT
sırları için başlatmayı **durduruyor**, `CREDS_KEY`/`CREDS_IV` için yalnız **uyarıyor**. Log
redaksiyonu var ama bir **denylist** (`sk-`, `Bearer `, `api_key=`, bilinen başlık adları). OS
seviyesinde anahtarlık entegrasyonu **hiç yok** (keytar/DPAPI/keychain için sıfır referans). Yönetici
config'indeki sırlar için ayrı bir kayıt (`CONFIG_SECRET_FIELDS`) `encryptV3` ile şifreliyor ve
okumada maskeli önizleme dönüyor. Ve gönderilen `docker-compose.yml`'de MongoDB `--noauth` ile
koşuyor — yani DB yazma erişimi, doğrulanmamış şifre metni üzerinde bir kurcalama primitifi.

Tepegöz: `@tepegoz/credential-vault` **BYO-key**, enjekte edilen `SecretCrypto` üzerinden — masaüstü
uygulaması Electron `safeStorage`/**DPAPI** bağlıyor, yani anahtar **işletim sistemine ve kullanıcı
oturumuna bağlı**, bir env değişkenine değil. Ham anahtar çağıranı terk etmiyor; renderer'a yalnız
`last4` gibi sır-olmayan bir parmak izi gidiyor. Üstüne `EgressFirewall` giden yükte sır/entropi
denetimi yapıyor ve **Credential Broker** ajanın sırra dokunacağı bir şekil bırakmıyor — ama Broker
**atıl sevk ediliyor** (OS-auth kapısı gelene dek her dolgu reddediliyor).

**Kavramsal olarak Tepegöz** (OS-bağlı depolama + giden-sır denetimi + ajanın sırra erişememesi).
**Ama** Tepegöz tek kullanıcılı bir masaüstü — LibreChat'in çözmek zorunda olduğu "N kullanıcının
anahtarı bir sunucuda" problemi onda hiç yok. Dürüst okuma: **eksenler kıyaslanabilir değil**; iki
taraf da kendi tehdit modelinde eksik (LibreChat'te AEAD yok, Tepegöz'de Broker atıl).

### Hesap verebilirlik / denetlenebilirlik — ikisi de yapı kurmuş, ikisi de bağlamamış

LibreChat: **hash-zincirli, ekleme-yalnız bir denetim kaydı** var —
`packages/data-schemas/src/schema/auditLog.ts`. Her satır kanonik (özyinelemeli anahtar-sıralı) JSON
üzerinden SHA-256'lanıyor, `prevHash` ile zincirleniyor, `GENESIS_HASH` var, kiracı-başına ayrı zincir,
`{chainKey, seq}` unique index'i çatallanmayı imkânsız kılıyor, ve ekleme-yalnızlık **yedi katmanda**
zorlanıyor (alan-seviyesi `immutable` + tüm update/delete/replace/bulkWrite kancaları). `verifyAuditChain()`
doğruluyor, CSV dışa aktarımı var, `read:audit_log` yetkisiyle kapılı — `manage:` karşılığı bilerek yok.
**Ama zincir neredeyse boş**: `AUDIT_ACTIONS` yalnız **iki** eylem içeriyor — `grant.assigned` ve
`grant.removed`. Ajan çalışmaları, araç çağrıları, MCP, config değişiklikleri, kimlik doğrulama,
onaylar için kategoriler _tanımlı_ ama eylem yok; ve ekleme varsayılan olarak **fail-open**.
Yanında Langfuse (anahtar verilirse), OpenTelemetry (varsayılan kapalı), yerel `insights`.

Tepegöz: **event-sourced Event Journal** (ADR-0004) — `lsn`, `deviceId`, korelasyon kimliği, **redakte
edilmiş payload**, büyük artefaktlar için `cas://<hash>`, base64 asla gömülmez. Üstüne
**`@tepegoz/notary`**: kanonik JSON + hash zinciri (`chainEvents`, `verifyChain`) + **Ed25519 imzalı
checkpoint** + taşınabilir **Replay Receipt** + bağımsız **`tepegoz-verify` CLI**. **Ama** paketi
`apps/desktop` içinde tüketen kimse yok — Phase 7 🟡, "algoritmik temel indi", ana sürece bağlanmadı.

Bu, belgedeki en simetrik bulgu: **iki taraf da kriptografik olarak sağlam bir denetim zinciri inşa
etmiş ve ikisi de onu henüz gerçek olaylarla beslemiyor.** Mimari üstünlük yine de Tepegöz'de — çünkü
onun tasarımı **satıcıdan bağımsız doğrulanabilir bir makbuz** (üçüncü tarafın kendi CLI'sıyla
doğrulayabileceği), LibreChat'inki ise kendi DB'sinde kendi doğrulama fonksiyonu.

### Kendi-kendine barındırma / egemenlik — bölünmüş, ve fark cinsten

LibreChat: `docker-compose.yml` **altı servis** ayağa kaldırıyor — `api`, `mongodb` (gönderilen
komut `mongod --noauth`), `meilisearch` (analytics kapalı), `vectordb` (pgvector), `rag_api`,
`admin-panel` (**kapalı kaynak imaj**, bu ağaçta yok). Buna karşılık **telemetri hiç yok**: PostHog/
Sentry/Mixpanel/Segment/GA için sıfır referans; OTel `OTEL_TRACING_ENABLED` olmadan kapalı; Langfuse
anahtar olmadan kapalı; `NO_INDEX=true` varsayılan; moderasyon varsayılan kapalı. Yani varsayılan
dışarı-trafik yalnızca senin yapılandırdığın LLM sağlayıcıları. **Gerçekten egemen olabilir** — ama
altı servisi ve Mongo kimlik doğrulamasını sen doğru kurarsan.

Tepegöz: tek bir masaüstü uygulaması, harici servis yok, veritabanı Node'un gömülü `node:sqlite`'ı,
cihazda kalır. Yerel model tarafı bir seam + sha256 doğrulamalı GGUF kataloğu (S12 🟠). Ama "egemenlik"
başlığında LibreChat'in _sağladığı_ şeyin karşılığı yok: çevrimdışı bilgi tabanı, çevrimdışı gömme,
kurumsal barındırma.

**Konuşlanma sadeliğinde Tepegöz** (kurulacak hiçbir şey yok), **kurumsal egemenlikte LibreChat**
(ekibin tamamı senin altyapında). Farklı sorular.

### i18n / Türkçe — gerçek bir kafa kafaya, ve iki taraf iki farklı şeyi kazanıyor

Bu, iki proje arasındaki en ölçülebilir eksen, o yüzden sayılarla:

LibreChat **41 dil** taşıyor (`client/src/locales/`), Türkçe dahil, çeviriler **locize** ile dışarıdan
otomatik yönetiliyor; `CLAUDE.md` kuralı net: "yalnız İngilizce anahtarları güncelle, diğerleri
otomatik". Sayılar (bu checkout'ta ölçüldü):

|                       | anahtar   | durum                                                                                              |
| --------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| `en/translation.json` | **2.532** | kaynak                                                                                             |
| `tr/translation.json` | **1.887** | **656 anahtar eksik (≈ %26)**, 69 anahtar İngilizce ile birebir aynı, 11 anahtar artık `en`'de yok |
| `de`                  | 2.240     | karşılaştırma için                                                                                 |
| `zh-Hans`             | 1.446     | karşılaştırma için                                                                                 |

Yani Türkçe LibreChat'te "birçoktan biri" ve **dörtte biri çevrilmemiş** — çünkü çeviri, kodu yazan
PR'ın sorumluluğu değil.

Tepegöz **iki dil** taşıyor (EN + TR) ama başka bir şey yapıyor: **her paket kendi sözlüğünü sahiplenir**
(ADR-0016), `src/i18n/{en,tr}.ts`, ve **26 paket/eklenti** kendi **parity testini** taşır — yeni bir
İngilizce string, TR karşılığı olmadan aynı PR'da geçemez. Bunun ötesinde `packages/i18n/src/turkish.ts`
Türkçeye _özgü_ şeyleri çözüyor: **noktalı/noktasız i** için locale-doğru büyük/küçük harf çevirisi
(`toLocaleUpperCase('tr-TR')` — JS'in varsayılanı `i→I` yapar ve yanlıştır), altı Türkçe-özel harf,
ve Türkçe **Q/F klavye** regresyon matrisi. Ayrıca `ai-agent` kuzey-yıldızı **≥10 Türkçe-web H2H
görevi** şart koşuyor ve Phase 11 kamu/e-Devlet güven modelini (ADR-0036) taşıyor. Şirket Türk
(roltek.com.tr).

**Genişlikte LibreChat** (41'e 2, kıyas kabul etmez). **Türkçe derinliğinde ve parity garantisinde
Tepegöz** — LibreChat'in Türkçesi %74 dolu ve dolmaya devam edip etmeyeceği depoya değil locize'a
bağlı; Tepegöz'ünki testle zorunlu ve dilin kendi tuhaflıklarını (i/İ, ı/I) hesaba katıyor.

### Ölçüm / dürüstlük kültürü — Tepegöz, ve fark büyük

LibreChat: mühendislik disiplini yüksek — `CLAUDE.md` "yeşil build typecheck değildir" diyor ve hangi
paketin `tsdown` ile tip kontrolsüz derlendiğini tek tek sayıyor; test felsefesi "mock yerine gerçek
mantık, `mongodb-memory-server`, gerçek MCP SDK exports'ları"; `static-checks` CI işini yerelde
koşturabiliyorsun. **Ama ajan yeteneği ölçülmüyor.** `e2e/` altındaki "benchmark" dizinleri
(`benchmarks`, `benchmarks-navigation`, `benchmarks-reasoning`) **gecikme/performans** ölçüyor —
"Enter'a basmaktan ilk token'ın DOM'a düşmesine kaç ms". Görev başarı oranı, injection ASR, uydurma-
başarı gibi bir batarya yok; zaten ürünün sattığı şey bu değil.

Tepegöz: `@tepegoz/agent-eval` — gerçek app, gerçek sayfa, **ground-truth-önce** skorlama (LLM-judge
ikincil, judge↔insan kalibrasyonu kayıtlı), SHA-256'lı donmuş fixture registry'leri, istatistiksel
anayasa (Wilson CI, havuzlanmış aile agregaları, iddia için N≥10), **anti-debt kuralı**, PROSE-LEDGER
(bir prompt steer'ı ancak eşli sweep kanıtlayınca silinir), ön-kayıtlı H2H protokolü, ve reddedilebilir
kuzey-yıldızı iddiası (`bridgeClaim` 25 insan etiketinin altında `publishable:false`).

**Tepegöz** — araştırma-sınıfı disiplin. Madalyonun öbür yüzü aynen webbrain karşılaştırmasındaki gibi:
bu disiplin kısmen **yetenek henüz orada olmadığı için** var — her S-fazı 🟠, hiçbiri ✅ değil.

---

## Örtüşmeyen alanlar

**Yalnızca LibreChat'te var (Tepegöz'de karşılığı yok ve olmayacak / kapsam dışı):**

- **Çok-kullanıcılılık**: kayıt/davet, e-posta doğrulama, oturum yönetimi. Tepegöz tek kullanıcılı bir
  masaüstü; `packages/profiles` bugün **boş**, çok-profil track'i "önerildi, planlanmadı".
- **Kimlik doğrulama yığını**: local (bcrypt), JWT, OpenID/OIDC (+ JWKS bearer), **SAML**, **LDAP**,
  Google/GitHub/Discord/Facebook/Apple; her sosyal sağlayıcı için ayrı bir `*AdminLogin` varyantı;
  **TOTP 2FA** + yedek kodlar.
- **RBAC üç katman**: rol-bazlı özellik izinleri (`PermissionTypes` 17 tür × `Permissions` 12 eylem),
  kaynak-başı **ACL** (bit maskesi VIEW/EDIT/DELETE/SHARE, 7 kaynak tipi, 20 erişim rolü, Entra ID grup
  federasyonu), ve yönetici yetenekleri (`SystemGrant`, ~25 `read:`/`manage:` yeteneği + bölüm-başı
  config delegasyonu).
- **Yönetim paneli** ve **DB'de saklanan config override'ları** (base → rol → grup → kullanıcı katmanlı,
  prototype-pollution korumalı, bazı bölümler bilerek yalnız-base).
- **Token bakiyesi / kota / otomatik dolum / işlem defteri**, kullanıcı-başı harcama sınırı.
- **Kod yorumlayıcı**: uzak, sandbox'lı bir HTTP servisine (varsayılan `api.librechat.ai`) delege;
  Tepegöz'de ADR-0026 izole-dünya sandbox'ı **ölçümle çürüttü**, agent kod-çalıştırma salt-okunur.
- **Artifacts**: `:::artifact` bloklarından sohbet içinde canlı React/HTML (`@codesandbox/sandpack-react`)
  ve Mermaid render'ı, sürümleme, tam ekran, SVG/PNG dışa aktarımı.
- **Görüntü üretimi/düzenleme**: DALL-E 3, Flux (finetune dahil), Stable Diffusion, `image_gen_oai`/
  `image_edit_oai`, `gemini_image_gen`.
- **Konuşma/ses**: STT + TTS (OpenAI/Azure/ElevenLabs), otomatik gönder/oynat.
- **Konuşma yönetimi**: içe/dışa aktarma (ChatGPT/Chatbot UI'dan import), fork, dallanma, Meilisearch
  ile tam-metin arama, paylaşılan bağlantılar (stabil URL, misafir görüntüleme), presetler,
  prompt kütüphanesi, yer imleri, **Agent Marketplace**.
- **Actions (OpenAPI)**: spec içe aktarımı → araç sentezi, `none`/`service_http`(bearer/basic/custom)/
  `oauth` kimlik doğrulama, alan-adı bağlama, SSRF-güvenli ajanlar.
- **Alt-ajanlar / çok-ajanlı grafikler**, arka-plan görevleri, dayanıklı checkpoint-resume, **resumable
  streams** (Redis destekli, çok-sekme/çok-cihaz senkron, sekme kapansa da devam).
- **Langfuse / OpenTelemetry** gözlemlenebilirlik entegrasyonları.

**Yalnızca Tepegöz'de var (LibreChat'te karşılığı yok):**

- **Tarayıcının kendisi**: sekme modeli, pencere fabrikası, gezinme, oturum-açık sitelerde eylem.
  `browser_*` (get_page, get_elements, get_article, click, type, update_location/history/page,
  validate_page/form/condition, analyze_page, get_screenshot), `tab_*` (create/list/get/update/delete/
  spawn/egress_blocked), `clipboard_*`, `download_*`, `upload_*`, `extension_*`.
- **DOM/a11y-önce algı** (ADR-0008): kimlik-kararlı ref'ler, değişen-only diff, değişmeyen elision,
  `aria-labelledby`/`label[for]` çözümü; vision yalnızca eskalasyon (ve **atıl** sevk).
- **Model-öncesi deterministik Policy Kernel** + hassas-site sert kilidi + biyometrik yüksek-risk
  kapıları + `EgressFirewall` + `TaintTracker`.
- **Kanıt-atıflı tamamlama**: `CompletionEvidence` + deterministik düşürme + tuzak fixture'ları +
  UI'da Checked/Unconfirmed/Contradicted rozetleri. LibreChat'in "yalan başarı" diye bir kavramı yok
  (sohbet platformunda olması da gerekmez).
- **Model-free deterministik otomasyon şeridi**: `macro-engine`, `recipe-compiler` (imzalı, oracle'lı),
  `human-input` (Catmull-Rom fare eğrileri + Gaussian jitter, bot-tespiti karşıtı hareket).
- **Notary**: Ed25519 imzalı checkpoint + taşınabilir Replay Receipt + bağımsız `tepegoz-verify` CLI —
  paket yazılmış ve testli ama **`apps/desktop`'a bağlanmamış** (Phase 7 🟡), bugün makbuz üretmiyor.
- **Human Handoff Controller** (CAPTCHA/2FA'yı çözmeye çalışmaz, kullanıcıya devreder; ADR-0039) ve
  **ticaret çift-onay kapısı** (ADR-0033 mandate kernel).
- **Safe Browsing** (ADR-0043), **indirme güven modeli** (ADR-0040), **sayfa çevirisi** (ADR-0042),
  ve tarayıcı eklentileri (`ext-translate` yerel-önce çeviri, `ext-typo`, `ext-macros`, `ext-tasks`,
  `ext-adblock`, `ext-popup-blocker`, `ext-user-agent`, `ext-video-player`).
- **Ground-truth ajan eval harness'i** + istatistiksel anayasa + ön-kayıtlı H2H protokolü.

---

## Ayrıntılı tablo — kim hangi işi daha iyi yapıyor

Yalnızca **örtüşen** eksenler. "Kim daha iyi" hücresi taraf tutar ve gerekçesini tek cümlede verir.

| #   | Boyut                                       | LibreChat                                                                                                                                                                                                  | Tepegöz                                                                                                                                                                                                   | Kim daha iyi + neden                                                                                                             |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Dağıtım / form**                          | Kendi sunucunda web uygulaması; 6 Docker servisi, Helm, tek-tık PaaS şablonları; tarayıcıdan erişilir                                                                                                      | Tek Electron masaüstü, harici servis yok, veri cihazda (`node:sqlite`)                                                                                                                                    | **Amaca göre**: ekip/kurumsal → LibreChat; kurulacak hiçbir şey istemeyen tek kullanıcı → Tepegöz                                |
| 2   | **Sağlayıcı genişliği**                     | 9 birinci-sınıf uç + `custom` ile **her OpenAI-uyumlu API**, 26 marka tanıma tablosu, YAML'dan veri olarak                                                                                                 | 8 sağlayıcı + `local`, kodda sabit union                                                                                                                                                                  | **LibreChat** — katalog veri, Tepegöz'de kod                                                                                     |
| 3   | **Sağlayıcı mimarisi**                      | 5 initializer + sağlayıcıya özgü config; asıl LLM katmanı **harici npm** (`@librechat/agents ^3.7.11`)                                                                                                     | Tek `CanonRequest/CanonResponse`, `ModelRouter`, `TokenLedger`, kendi döngüsü                                                                                                                             | **Tepegöz** — tek şema, tipli, sahiplenilmiş; caret aralığıyla bağlı bir kara kutu yok                                           |
| 4   | **MCP taşıma + OAuth**                      | 4 taşıma (stdio/ws/sse/streamable-http), tam OAuth (PKCE, DCR, RFC 8707/9728, OBO), devre kesici, canlı `tools/list` yenileme, 1000 araç tavanı                                                            | Yalnız `stdio` bağlı (`http_sse` şemada, transport yok), OAuth yok                                                                                                                                        | **LibreChat** — açık ara; Tepegöz'ün en somut MCP boşluğu                                                                        |
| 5   | **MCP tehlike modeli**                      | Annotation'lar (`readOnlyHint`/`destructiveHint`) **hiç okunmuyor**; onay = operatörün yazdığı glob listesi, varsayılan kapalı                                                                             | `dangerClassFor` annotation'ı fail-safe yorumlar (eksik hint → `state_changing` → ask); araç yine tek PEP'ten geçer                                                                                       | **Tepegöz** — bilinmeyen bir MCP aracı varsayılan olarak sorulur, sessizce çalışmaz                                              |
| 6   | **Araç çağırma disiplini**                  | Ad-glob eşleşmesi + 13 olaylı kanca sistemi; MCP/builtin/action ayrı yollardan                                                                                                                             | **Tek PEP**: lookup → idempotency → zod → PolicyKernel → HITL → execute → audit, istisnasız                                                                                                               | **Tepegöz** — her araç aynı denetim hattından, atlanamaz                                                                         |
| 7   | **İzin kararının cinsi**                    | Statik: operatörün YAML'da yazdığı `allow/deny/ask` glob'ları; **varsayılan kapalı**                                                                                                                       | Dinamik: danger class + taint + hedef site + egress durumu → allow/deny/ask + makine-okunur `PolicyReason` + biyometrik                                                                                   | **Tepegöz** — karar eylemin _ne yaptığına_ bakıyor, adına değil                                                                  |
| 8   | **Ajan döngüsü olgunluğu**                  | LangGraph, recursion 50 (tavanlanabilir), alt-ajanlar (derinlik 5 / 50 düğüm), arka-plan görevleri, dayanıklı checkpoint-resume, steer kuyruğu                                                             | Planner→Executor→Reactor, tipli `Decision`, 2-aşama HITL; **tek eşzamanlı run**, checkpoint-resume yok                                                                                                    | **LibreChat** — daha çok eşzamanlılık ve dayanıklılık yüzeyi, gerçek kullanımda pişmiş                                           |
| 9   | **Human-in-the-loop ergonomisi**            | Tek formda 4 soru (`ask_user_question`), approve/reject/**edit**, 24 saatlik dayanıklı onay penceresi, fail-closed araç sıyırma                                                                            | Tek soruluk `clarify`, plan önizleme (adım seç), kademeli otonomi + risk banner, ticaret çift-onayı, Human Handoff                                                                                        | **Bölünmüş**: soru sorma ergonomisinde **LibreChat**, rıza granülerliği ve devretmede **Tepegöz**                                |
| 10  | **Context yönetimi**                        | 3 tetikleyicili özetleme + `retainRecent` + ayrı `contextPruning` + compaction semantic index + UI'da context göstergesi; farklı modele yönlendirilebilir                                                  | Algı katmanında diff/elision + `cache-window` + working-state collapse; mesaj özetleme yok, context göstergesi yok                                                                                        | **LibreChat** — daha çok ayar, daha çok görünürlük, uzun sohbetlerde ölçülmüş                                                    |
| 11  | **Prompt mimarisi**                         | Kararlı `instructions` / dinamik `additional_instructions` ayrımı (prompt-cache gerekçeli)                                                                                                                 | Reactor prompt'u + `wrapUntrustedContent` sınırı + cache-window lag-2 breakpoint                                                                                                                          | **Berabere** — ikisi de önbellek-bilinçli; farklı problemleri çözüyorlar                                                         |
| 12  | **Güvenilmez içerik / injection savunması** | Sarma/temizleme **yok** (`prompt injection` için depoda sıfır eşleşme); yerine PII/gizli-desen filtresi (13 kaynak, RE2) + provenance modeli                                                               | `sanitizeText` (zero-width/bidi/homoglyph) + `wrapUntrustedContent` + model-öncesi kernel + `EgressFirewall` (Shannon entropi dahil 7 bulgu sınıfı)                                                       | **Tepegöz** — mimaride; LibreChat'in bu kavramı hiç yok                                                                          |
| 13  | **SSRF / ağ sertleştirmesi**                | Bağlantı-anında çözümlenmiş-IP doğrulaması (DNS rebinding'e karşı), `host:port` muafiyet listeleri, MCP/OAuth/web-search/Actions/OCR hepsi aynı hattan                                                     | SSRF-güvenli sitemap reader + `egress-proxy`/`egressBlocked` sinyali                                                                                                                                      | **LibreChat** — açık ara; sistematik bir hat kurmuş                                                                              |
| 14  | **Injection kanıtı (bugün)**                | Ölçüm yok, adversaryal korpus yok                                                                                                                                                                          | Redteam + injection korpusu var, **claim-grade ASR measurement-owed** (S6 🟠)                                                                                                                             | **Tepegöz kıl payı** — en azından ölçmeyi taahhüt etmiş ve fixture'ları donmuş; ikisinin de yayımlanmış sayısı yok               |
| 15  | **RAG / dosya arama**                       | `file_search` → harici `rag_api` + pgvector + OpenAI embeddings; 5 OCR stratejisi; docx/xlsx/HTML ingest; 4×4×2 web-arama boru hattı                                                                       | **Yok** — sıfır embedding/vektör kodu; `reader` (makale çıkarımı) + `web_search` + `journal_search_events`; PDF okuma yok                                                                                 | **LibreChat** — mutlak fark                                                                                                      |
| 16  | **Çevrimdışı çalışabilirlik**               | Yerel model yalnız `custom` uç olarak (Ollama için sadece model _keşfi_; süreç-içi çıkarım yok, GGUF yönetimi yok); RAG dış servis + dış embeddings                                                        | `local-inference` (node-llama-cpp, `responseFormat:'json'`'da GBNF gramer zorlaması) + sha256'lı, resumable GGUF kataloğu; S12 🟠 ağırlıklara takılı                                                      | **Tepegöz kıl payı** — süreç-içi çıkarım ve doğrulanmış ağırlık indirme _var_; ama ölçülmemiş ve LibreChat'in RAG'ı yok          |
| 17  | **Bellek**                                  | Model-yazımlı `set_memory`/`delete_memory`, ajan-başı izolasyon (opt-in), token/karakter bütçeleri, okuma-anında PII yeniden doğrulama; ama prompt'a **güvenilir metin** olarak enjekte                    | ADR-0027: yazmada tehdit filtresi, **görev çitinin dışında `role:'user'` tavsiye**, canlı DOM'a karşı yeniden doğrulama, karantina satırı saklar, store kendi satırına güvenmez                           | **Mimaride Tepegöz** (zehirlenme veri yapısında çözülmüş), **bugünkü faydada LibreChat** (gerçekten kullanılıyor)                |
| 18  | **Skill / iş akışı**                        | `SKILL.md` paketleri (manuel/otomatik/her-zaman-açık), dağıtım skill'leri, Agent Plugins, ACL'li paylaşım, model-görünür katalog                                                                           | Skill = **yalnız prompt şablonu**, asla çalıştırmaz (bilinçli); yerine `macro-engine` + imzalı `recipe-compiler` + `tasks`                                                                                | **LibreChat** skill'lerin iş yaptığı tarafta; **Tepegöz** modelsiz tekrarlanabilirlikte                                          |
| 19  | **Zamanlanmış çalışma**                     | `schedules` (deneysel): cron, `maxPerUser`, `minIntervalMinutes`, N hatadan sonra oto-devre-dışı, proje zorunluluğu                                                                                        | `@tepegoz/tasks`: kayıtlı görev, interval / page-change / external tetikleyici, `task_*` araçları                                                                                                         | **LibreChat kıl payı** — operatör kontrolleri daha olgun; Tepegöz'ün tetikleyici çeşitliliği daha zengin                         |
| 20  | **Maliyet şeffaflığı**                      | ~305 satırlık elle bakımlı $/1M fiyat tablosu + `Balance`/`Transaction` + otomatik dolum + ön-uçuş `checkBalance`; ama substring eşleme kırılgan ve tanınmayan model sessizce `$6/1M`                      | `TokenLedger` (provider+model+capability), kota + %80 uyarısı + ön-uçuş bütçe kapısı; **fiyat tablosu yok**, `$/task` S7'de measurement-owed                                                              | **LibreChat** — bugün para birimi cinsinden muhasebesi olan taraf                                                                |
| 21  | **Sır / kimlik bilgisi işleme**             | Mongo'da AES-CBC/CTR (**AEAD yok**), anahtar `CREDS_KEY`/`CREDS_IV` env'den (yoksa `.env.temp`'e otomatik üretilir), denylist log redaksiyonu, OS anahtarlığı yok, gönderilen compose'da `mongod --noauth` | `safeStorage`/**DPAPI** ile OS+oturum-bağlı vault, ham anahtar çağıranı terk etmez, renderer'a yalnız `last4`, `EgressFirewall` giden sır denetimi; Credential Broker **atıl**                            | **Tepegöz** — depolama modeli yapısal olarak daha güçlü; ama tek-kullanıcılı bir problemi çözüyor, LibreChat N-kullanıcılı olanı |
| 22  | **Denetlenebilirlik**                       | Hash-zincirli, 7 katmanda ekleme-yalnız `AuditLog` + `verifyAuditChain()` + CSV; **ama yalnız 2 eylem** (`grant.assigned`/`grant.removed`) kayıtlı ve ekleme fail-open                                     | Event-sourced Journal (redakte payload, `cas://` blob) + **Notary** (Ed25519 checkpoint + taşınabilir Replay Receipt + bağımsız `tepegoz-verify` CLI); **ama Notary ana sürece bağlanmamış** (Phase 7 🟡) | **Tepegöz mimaride** (satıcıdan bağımsız doğrulanabilir makbuz); **pratikte ikisi de bağlamamış** — en simetrik bulgu            |
| 23  | **i18n genişliği**                          | **41 dil**, locize ile dışarıdan otomatik                                                                                                                                                                  | **2 dil** (EN + TR)                                                                                                                                                                                       | **LibreChat** — kıyas kabul etmez                                                                                                |
| 24  | **Türkçe kalitesi / parity**                | `tr` 2.532 anahtardan 1.887'sini taşıyor (**656 eksik ≈ %26**, 69'u İngilizce ile aynı); parity bir PR yükümlülüğü değil                                                                                   | 26 paket/eklenti **parity testi** taşıyor (TR'siz string PR'dan geçmez) + `turkish.ts` (i/İ, ı/I locale-doğru büyük-küçük harf, Q/F klavye matrisi) + ≥10 TR-web H2H şartı + Phase 11 kamu/e-Devlet       | **Tepegöz** — dilin kendi tuhaflıklarını çözüyor ve boşluğu testle imkânsız kılıyor                                              |
| 25  | **Ölçüm kültürü (ajan yeteneği)**           | Güçlü mühendislik disiplini (typecheck/statik kontrol/gerçek-bağımlılık testleri) ama ajan benchmark'ları **gecikme/performans**; yetenek/güvenlik bataryası yok                                           | Ground-truth-önce eval harness, donmuş sha256 fixture'lar, Wilson CI, N≥10, anti-debt, PROSE-LEDGER, reddedilebilir kuzey-yıldızı iddiası                                                                 | **Tepegöz** — araştırma-sınıfı; ama bu, yeteneğin henüz orada olmadığının da işareti                                             |
| 26  | **"Bugün çalışıyor mu"**                    | Evet — `v0.8.8-rc1`, dağıtım şablonları, 41 dil, canlı topluluk, gerçek kurumsal kurulumlar                                                                                                                | Kısmen — iskelet bağlı, S0–S12'nin **hepsi 🟠**, vision/credential-broker atıl, Notary bağlanmamış, tek run, tek profil, MCP yalnız stdio                                                                 | **LibreChat** — kesin                                                                                                            |

---

## Sonuç

**Bugün, genişlik ve "çalışıyor" ekseninde LibreChat kazanıyor** — ama kazandığı yarış Tepegöz'ün
koştuğu yarış değil. Sağlayıcı kataloğu veri (Tepegöz'de kod), MCP'de dört taşıma + tam OAuth
(Tepegöz'de yalnız stdio), RAG/dosya-arama/OCR yığını var (Tepegöz'de hiç yok), 41 dil (Tepegöz'de 2),
para birimi cinsinden maliyet muhasebesi ve kota var, alt-ajan/arka-plan/dayanıklı-resume yüzeyi var,
SSRF sertleştirmesi sistematik, ve hepsinin üstünde **gerçekten dağıtılan, ekiplerin kullandığı bir
ürün**. Tepegöz'ün bu listeden alması gereken üç somut şey var ve üçü de mimariyle çelişmez: sağlayıcı
kataloğunu veriye çevirmek, MCP'ye HTTP/SSE taşıması + OAuth eklemek, ve `$/task`'ı gerçekten
yayımlamak.

**Mimari ve yaptığı spesifik bahislerde Tepegöz kazanıyor** — özellikle ikisinin _aynı_ problemi çözdüğü
yerlerde. MCP'de: LibreChat bir MCP aracının kendi `readOnlyHint`/`destructiveHint` annotation'larını
hiç okumuyor ve onayı operatörün elle yazdığı bir ad-glob listesine bırakıyor (varsayılan **kapalı**);
Tepegöz aynı annotation'ları fail-safe yorumluyor ve MCP aracını yerel araçla **ayrımsız aynı PEP'ten**
geçiriyor. Bellekte: LibreChat zehirlenmeye prompt talimatıyla cevap veriyor, Tepegöz veri yapısıyla
(yazmada filtre, görev çitinin dışında tavsiye, canlı DOM'a karşı yeniden doğrulama, kanıt olarak
karantina). Güvenilmez içerikte: LibreChat'te böyle bir kavram yok — depoda `prompt injection` için tek
bir eşleşme bile yok — Tepegöz'de ayrı bir paket. Denetimde ikisi de kriptografik bir zincir kurmuş ve
**ikisi de onu henüz beslemiyor**; ama Tepegöz'ünki üçüncü tarafın kendi CLI'sıyla doğrulayabileceği
taşınabilir bir makbuz, LibreChat'inki kendi DB'sinde kendi doğrulaması. Türkçede fark en ölçülebilir
hali: LibreChat 41 dil taşıyor ama Türkçesinin **dörtte biri boş** ve i/İ gibi dile özgü tuzakları
görmüyor; Tepegöz iki dil taşıyor ama boşluğu testle imkânsız kılmış.

Dürüst özet: **LibreChat bugün çok daha fazla iş yapıyor; Tepegöz'ün ajanı ise hâlâ kanıtlanmamış bir
iskelet — S0–S12'nin hepsi 🟠, vision ve credential-broker atıl sevk ediliyor, Notary ana sürece
bağlanmamış, aynı anda tek run koşuyor, MCP'si yalnız stdio konuşuyor.** Ve kategorik olarak bunlar
zaten farklı sorulara verilmiş cevaplar: modellerle **konuşmak**, dosyalarınla sohbet etmek, ekibine
kotalı ve rollü bir AI arayüzü açmak istiyorsan → **LibreChat**; tez "oturum-açık banka oturumuna
güvenebileceğin, sayfanın yalanını yakalayan, ne yaptığının taşınabilir kriptografik kanıtını veren,
Türkçe bir tarayıcı ajanı" ise → **o Tepegöz'ün oyunu, hâlâ tezgâhta**.
