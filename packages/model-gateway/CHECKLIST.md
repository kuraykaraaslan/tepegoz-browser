# model-gateway — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Her model çağrısı için tek, sağlayıcıdan bağımsız giriş noktası (L7): maxTokens/timeoutMs zorunluluğunu dayatan ModelGateway, capability'yi tier+effort+transport'a eşleyen ModelRouter, kullanım muhasebesi tutan TokenLedger ve vendor formatını canonical CanonRequest/CanonResponse'a normalize eden sağlayıcı adaptörleri.

## Kesinlikle olmalı
- [ ] ModelGateway.complete() her model çağrısı için tek, sağlayıcıdan bağımsız giriş noktası olmalı
- [ ] maxTokens'sız (sınırsız) hiçbir model çağrısına izin vermemeli
- [ ] timeoutMs'siz (zamansız) hiçbir model çağrısına izin vermemeli
- [ ] Guard'ı, kayıtlı sağlayıcıya dağıtmadan ÖNCE uygulamalı
- [ ] register(provider) ile sağlayıcı adaptörlerini kaydedebilmeli
- [ ] Her çağrının kullanımını (token) TokenLedger'a kaydetmeli
- [ ] TokenLedger per-sağlayıcı/model/capability kullanım + bütçe muhasebesi tutmalı
- [ ] ModelRouter saf route(input) ile capability'yi `{ tier, transport, provider, model, effort }`'a eşlemeli
- [ ] Router cost-saver (maliyet tasarrufu) anahtarına göre local-vs-cloud transport kararı vermeli
- [ ] plan / exec / classify gibi capability'leri bir model tier + effort seviyesine haritalamalı
- [ ] Her sağlayıcı adaptörü vendor tel formatını canonical CanonRequest/CanonResponse'a normalize etmeli
- [ ] Stack'in geri kalanı asla vendor'a özgü format görmemeli
- [ ] AnthropicProvider'ı @anthropic-ai/sdk üzerinden Claude adaptörü olarak sağlamalı
- [ ] AnthropicProvider max_tokens'ı her zaman göndermeli, budget_tokens'ı asla göndermemeli
- [ ] AnthropicProvider adaptive-thinking + effort desteklemeli
- [ ] OpenAIProvider Chat Completions REST uç noktasına doğrudan @tepegoz/http axios seam üzerinden konuşmalı — vendor SDK kullanmamalı
- [ ] MockProvider testler/çevrimdışı geliştirme ve golden-LLM agent-eval replay için deterministik olmalı
- [ ] CanonRequest/CanonResponse/CanonMessage/CanonToolDef/CanonToolCall/ModelProvider kontratını dışa vermeli
- [ ] ANTHROPIC_MODEL / OPENAI_MODEL / LOCAL_MODEL / EffortLevel ile model-id ve effort tier'larını merkezileştirmeli — çağıranlar model string'i hardcode etmemeli

## Olsa iyi olur
- [ ] TokenLedger bütçe aşımını çağırana görünür kılmalı (cost transparency)
- [ ] Router local-SLM offload'u Phase 1a'da no-op placeholder olarak ele almalı (cloud'a düşmeli)
- [ ] ONNX/DirectML gelene kadar local transport isteği sessizce cloud'a yönlenmeli
- [ ] Anthropic ve OpenAI için kasıtlı olarak farklı transport'lara izin vermeli (resmi SDK vs @tepegoz/http seam)
- [ ] effort seviyesini canonical istekte taşıyıp adaptöre iletebilmeli
- [ ] Kayıtlı olmayan bir provider'a route edildiğinde anlaşılır hata vermeli
- [ ] Aynı capability için tekrar tekrar çağrıda tutarlı route kararı vermeli (saf router)
- [ ] TokenLedger'ı bellek-içi tutup süreç ömrüyle sınırlı bırakmalı

## Çok niş
- [ ] complete() maxTokens=0 gibi sınır değerlerde de guard'ı devreye sokmalı
- [ ] Router transport=local ama yerel model yoksa cloud fallback'i şeffaf yapmalı
- [ ] MockProvider aynı girdi için her zaman aynı çıktıyı vermeli (golden replay determinizmi)
- [ ] AnthropicProvider thinking bütçesini effort'tan türetip yine de budget_tokens sızdırmamalı
- [ ] OpenAIProvider hiçbir koşulda vendor SDK'ya düşmemeli
- [ ] Bir sağlayıcı vendor-özgü hata formatı döndürdüğünde bu da canonical hataya normalize edilmeli
- [ ] TokenLedger capability kırılımı olmadan gelen kullanımı da bir kovaya yazabilmeli
