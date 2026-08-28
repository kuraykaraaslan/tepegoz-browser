# orchestrator — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Ajanın Planner + Executor + Reactor döngüsü (L3): kullanıcı istemini bir DAG planına çevirir, planı tek `@tepegoz/capability-plane` ToolGateway PEP üzerinden adım adım çalıştırır ve her adımın sonucuna göre bir sonraki hamleye karar verir.

## Kesinlikle olmalı
- [ ] `Planner` bir `PlanRequest` alıp adım DAG'i üretebilmeli
- [ ] Üretilen plan bir DAG olmalı (adımlar arası bağımlılıkları desteklemeli, düz liste değil)
- [ ] `Executor` bir planın adımlarını sırayla çalıştırabilmeli
- [ ] Her adım tek `@tepegoz/capability-plane` ToolGateway PEP üzerinden yürütülmeli
- [ ] Bir araç çağrısı için ToolGateway PEP asla atlanmamalı
- [ ] `Executor` `RunOptions` alıp `RunResult` döndürmeli
- [ ] `Executor` her adım için `StepOutcome` üretmeli
- [ ] `Executor` durduğunda bir `StopReason` bildirmeli
- [ ] `Reactor` bir adımın sonucuna göre sonraki eylemi belirleyebilmeli
- [ ] `Reactor` kararları continue / retry / replan / stop olabilmeli
- [ ] `parseDecision` ile bir karar yükünü yorumlayabilmeli
- [ ] `react()` bir `ReactResult` / `Decision` döndürmeli
- [ ] Tüm model çağrıları `@tepegoz/model-gateway` üzerinden yönlendirilmeli
- [ ] Hiçbir vendor LLM API'sine doğrudan çağrı yapmamalı
- [ ] retry yolu başarısız bir adımı yeniden çalıştırabilmeli
- [ ] replan yolu `Planner`'dan revize bir DAG isteyebilmeli
- [ ] stop yolu koşuyu bir nedenle sonlandırmalı
- [ ] Tipli sözleşmeleri (`PlanRequest`, `RunOptions`, `RunResult`, `StepOutcome`, `StopReason`, `ReactRequest`, `ReactOptions`, `ReactResult`, `Decision`) dışa vermeli
- [ ] Yürütmede adım sırasına / bağımlılık kenarlarına uymalı
- [ ] Electron/uygulama seam'lerini kendisi sağlamamalı (bunları `@tepegoz/agent-runtime`'a bırakmalı)

## Olsa iyi olur
- [ ] Adım başına sınırlı retry sayısı uygulayabilmeli
- [ ] Koşu başına sınırlı replan sayısı uygulayabilmeli
- [ ] Her `StepOutcome` çözüldükçe ilerlemeyi dışarı bildirebilmeli
- [ ] Deterministik bir `PlanRequest` için deterministik plan üretebilmeli (test edilebilir)
- [ ] Bir adımın çıktısını bağımlı adımlara girdi olarak taşıyabilmeli
- [ ] Kurtarılamayan bir ToolGateway reddinde temiz şekilde durmalı
- [ ] `Reactor` geçici ile kalıcı adım hatasını ayırt edebilmeli
- [ ] Model karar çıktısını eyleme geçmeden önce `safeParse` ile doğrulamalı
- [ ] Çalışan bir koşuyu iptal edebilmeli (abort/cancel)

## Çok niş
- [ ] DAG'in bağımsız dallarını paralel çalıştırabilmeli
- [ ] Kısmi plan yürütmesi / belirli bir adımdan devam edebilmeli
- [ ] Bir koşunun tamamı için bütçe/adım-sayısı tavanı uygulayabilmeli
- [ ] replan zaten tamamlanmış adım sonuçlarını koruyabilmeli
- [ ] Sıfır adımlı bir planı sorunsuz ele alabilmeli
- [ ] Üretilen DAG'de döngü tespit edip reddedebilmeli
- [ ] Güven düşükken `Reactor` HITL'e yükseltebilmeli
