# Research — Fellou

> **Ne bu?** Kapalı kaynak bir rakibin (Fellou, "Deep Action" agentic tarayıcı) dış
> kaynaklardan derlenmiş incelemesi. **Kod okunmadı.** Tepegöz için değeri tek bir
> özellikte yoğunlaşıyor: **çalıştırmadan önce planı görsel inceleme ve düzenleme.**
>
> **Durum:** kapalı kaynak. **Tarih.** 2026-09-01. **Dil notu.** Türkçe.

---

## Ne

Kendini "dünyanın ilk agentic tarayıcısı" diye pazarlayan, çok-adımlı iş akışlarını
(Gmail, Notion, LinkedIn, Airtable, Slack ve iddiaya göre 50+ platform) tek komuta
indirgeyen tarayıcı. Ana özelliği **Deep Action**: niyeti alıp planlıyor, sonra
otomatikleştiriyor.

## Tepegöz'ü ilgilendiren tek şey: plan-onay UX'i

Fellou'nun ayrıştığı yer, ürün incelemelerinin ortak vurgusu:

> Fellou önce hedefi analiz edip **ayrıntılı, adım-adım bir eylem planı** üretir. Bu planı
> çalıştırmadan **inceleyebilir, onaylayabilir ve düzenleyebilirsin.** Diğer agentic
> tarayıcılar kara kutu gibi çalışırken Fellou planlanan iş akışını görsel olarak
> incelemene ve değiştirmene izin verir. Herhangi bir adımda müdahale edebilirsin.

**Bu tam olarak Tepegöz'ün zaten yaptığı şey** — ve bunu bilmek önemli, çünkü Fellou bunu
_farklılaştırıcı_ olarak pazarlıyor:

|                        | Fellou                         | Tepegöz (`ext-agent`, ADR-0013)                                                                                                                                                  |
| ---------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan önizleme          | Var, çalıştırmadan önce        | Var — `planTitle: 'Review the plan'`, `planBody: 'Uncheck any step you do not want, then run. Nothing executes until you approve.'`                                              |
| Plan düzenleme         | "review, approve and **edit**" | **Adım seçimi** (`skipStepIds`) — adım çıkarabilirsin, ama adım metnini serbestçe düzenleyemezsin                                                                                |
| Çalışma-içi müdahale   | "intervene at any step"        | `steer` (çalışırken talimat), pause/resume, stop                                                                                                                                 |
| Onayın ne satın aldığı | Belirtilmemiş                  | Açıkça yazılı: `planGrant` — _"Approving covers the routine steps of this plan on the sites it names, for this task only. Money, passwords and deletions still ask every time."_ |

**Tepegöz'ün üstün olduğu yer:** onayın **kapsamı yazılı ve kernel-zorlamalı**. Fellou'da
plan onayı bir kullanıcı-arayüzü jesti; Tepegöz'de plan onayı bir **grant** (plan-scoped,
eTLD+1 bazlı, `plan-grant-scope.ts`) ve `financial`/`credential`/`destructive` sınıfları
onaydan **bağımsız olarak** yine sorar. Yani "planı onayladım" ≠ "her şeye izin verdim".

**Fellou'nun üstün olabileceği yer:** plan metninin **serbest düzenlenmesi**. Tepegöz
bugün adım _çıkarmaya_ izin veriyor, adım _değiştirmeye_ değil. Bu bilinçli olabilir
(düzenlenmiş plan metni modele geri beslenirse, kullanıcı-yazımı bir talimat kanalı açar —
ki bu güvenilir bir kanal, sorun değil) ama **eksik**: kullanıcı "3. adımı şu siteye değil
bu siteye yap" diyemiyor, ya adımı atıyor ya da baştan yazıyor.

## Somut öneri

`ext-agent` plan-review kartında **adım-düzeyi düzenleme** (metin) eklenebilir; teknik
olarak zaten güvenilir bir kanal (kullanıcı girdisi), ve `plan-grant-scope`'un host
çıkarımı düzenlenmiş metinden **yeniden hesaplanmalı** (yoksa kullanıcı planı düzenleyip
grant'ı genişletmiş olur — bu, WebBrain'in "edited plans with stale hidden metadata
cannot authorize a send" uyarısının aynısı, oradan doğrulanmış bir tuzak).

Bu, `phases/tracks/webbrain-agent-parity.md`'ye bir satır olarak değil, S8 (assistant-ux)
altında küçük bir iyileştirme olarak gider.

## Alınacaklar / Alınmayacaklar

**Alınacak:** plan adımının metnini düzenleyebilme + düzenleme sonrası grant kapsamının
yeniden türetilmesi (güvenlik şartı).

**Alınmayacak:** "50+ platform" entegrasyon vaadi — Tepegöz'ün karşılığı Phase 2'nin
resmî-API-önce adaptörleri (frozen) ve `webbrain-agent-parity.md` P4'ün site-rehberliği
adaptörleri; ikisi de daha dar ve daha dürüst bir söz.

## Kaynaklar

- [Agentic AI Browser for Deep Search & Automation — fellou.ai](https://fellou.ai/)
- [Fellou AI Review 2026: Agentic Browser & Workflows — BuildFastWithAI](https://www.buildfastwithai.com/ai-tools/fellou)
- [Meet Fellou AI: An Agentic AI Browser That Can Think, Plan, and Execute Tasks on Your Behalf — AI Tools Club](https://aitoolsclub.com/meet-fellou-ai-an-agentic-ai-browser-that-can-think-plan-and-execute-tasks-on-your-behalf/)
- [The Agentic Browser Landscape in 2026 — No Hacks](https://nohacks.co/blog/agentic-browser-landscape-2026)
