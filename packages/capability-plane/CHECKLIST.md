# capability-plane — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Agent'ın alabileceği her eylemi tek bir normalize `ToolDescriptor` olarak kaydeden registry ile tüm çağrıları sabit sırayla (lookup → idempotency → zod → policy → HITL → execute → audit) geçiren tek gateway PEP'i (ADR-0007).

## Kesinlikle olmalı
- [ ] `CapabilityRegistry` tüm kayıtlı araçların tek haritası olmalı (`register`/`unregister`/`get`/`list`)
- [ ] Registry kayıt anında `{domain}_{verb}_{noun}` isimlendirme kuralını (`ToolNameSchema`) zorlamalı
- [ ] `ToolGateway.invoke(toolName, rawArgs, ctx)` tam pipeline'ı çalıştırmalı
- [ ] Invocation sırası sabit olmalı: lookup → idempotency check → zod input validation → `PolicyKernel` → HITL confirm → execute → audit
- [ ] Agent hangi araç kaynağını çağırırsa çağırsın policy'yi bypass edememeli
- [ ] Untrusted args execute'tan önce zod ile doğrulanmalı
- [ ] `@tepegoz/security-policy`'nin `PolicyKernel`'ine her invocation'da danışılmalı
- [ ] Policy kararı "ask" ise HITL confirm handler çağrılmalı
- [ ] `setConfirmHandler` ile UI confirm sink'i çalışma zamanında bağlanabilmeli
- [ ] `setAuditHandler` ile audit sink'i çalışma zamanında bağlanabilmeli
- [ ] Atanmamış confirm handler "ask" kararlarını fail-safe olarak denied'a düşürmeli
- [ ] `ToolGateway` boundary boyunca asla throw etmemeli; sonuç veya standart `ToolError` envelope dönmeli
- [ ] Idempotency check tekrarlı çağrıları yakalamalı
- [ ] Her invocation (başarılı/başarısız) audit edilmeli (`AuditEntry`)
- [ ] Built-in, MCP, extension ve adapter araçları aynı normalize `ToolDescriptor` şeklinde temsil edilmeli
- [ ] Paket Electron'dan bağımsız olmalı
- [ ] HITL confirm handler ve audit sink runtime'da app tarafından bağlanmalı
- [ ] `register` bilinen bir isimle ikinci kaydı reddetmeli / çakışmayı tanımlı biçimde ele almalı
- [ ] Bilinmeyen araç `get`/lookup aşamasında `ToolError` ile sonuçlanmalı
- [ ] `InvokeContext` bir invocation'ı sürmek için gereken bağlamı taşımalı
- [ ] `InputValidator` sözleşmesi araç başına zod şeması bağlamalı

## Olsa iyi olur
- [ ] `list` kayıtlı araçları keşif/UI için döndürebilmeli
- [ ] `unregister` ile bir araç çalışma zamanında kaldırılabilmeli (extension unload)
- [ ] `ToolError` envelope'u makine-okunur kod + insan-okunur mesaj içermeli
- [ ] `ConfirmRequest` kullanıcıya yeterli bağlam sunmalı (araç adı, args özeti)
- [ ] `AuditEntry` zaman damgası, policy kararı ve sonuç durumu içermeli
- [ ] `RegisteredTool` tipi kaynak bilgisini (builtin/mcp/extension) taşımalı
- [ ] Gateway policy'nin "allow" / "deny" / "ask" üç kararını da ele almalı
- [ ] Aynı registry farklı araç kaynaklarınca paylaşılabilmeli

## Çok niş
- [ ] Idempotency anahtarı çakışması eşzamanlı çağrılarda güvenli çözülmeli
- [ ] Audit handler hata fırlatırsa invocation sonucu yine de dönmeli
- [ ] Confirm handler timeout / iptal durumunda karar denied olmalı
- [ ] Çok sayıda kayıtlı araçla `list` performansı makul kalmalı
- [ ] `ToolNameSchema` Unicode / edge-case isimleri reddetmeli
- [ ] İleride eklenecek adapter kaynağı pipeline değişmeden çalışmalı
