# auth-prompt-ui — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> 401 (site) veya 407 (proxy) challenge'ı için HTTP basic/digest kimlik doğrulama dialog'u; sunum amaçlı yaprak, Electron'suz, hiçbir şey saklamaz, kimlik bilgileri yalnızca `onSubmit` ile dışarı çıkar.

## Kesinlikle olmalı
- [ ] 401 (site) ve 407 (proxy) kimlik doğrulama challenge'ları için bir dialog sunmalı
- [ ] Kullanıcı adı ve maskelenmiş parola alanları sunmalı
- [ ] Submit ve cancel eylemleri sağlamalı
- [ ] Girilen kimlik bilgilerini yalnızca `onSubmit` üzerinden dışarı vermeli
- [ ] Hiçbir şey saklamamalı (kimlik bilgisi, geçmiş vb. tutmamalı)
- [ ] Challenge detaylarını enjekte edilen prop'lardan almalı (kendi başına ağ isteği yapmamalı)
- [ ] Electron bridge'ine bağımlı olmamalı (Electron-free)
- [ ] Origin'i kendi ayrı satırında göstermeli, çevrilmiş bir cümlenin içine gömmemeli
- [ ] Proxy challenge'ı ile site challenge'ını sözcüklerle açıkça ayırt etmeli
- [ ] Sunucu kaynaklı `realm`'i göstermeli ama etiketli ve görsel olarak ikincil biçimde
- [ ] `realm` metni uygulama kopyası gibi okunmamalı (saldırgan kontrollü olarak ele alınmalı)
- [ ] Kendi `en`/`tr` sözlüğünden self-localize olmalı, dışarıdan `labels` almamalı (ADR-0016)
- [ ] `AuthPrompt`, `AuthPromptProps` ve `authPromptDict`'i dışa aktarmalı

## Olsa iyi olur
- [ ] Parola alanı varsayılan olarak maskeli kalmalı
- [ ] Uzun hostname'in dialog'u taşırmamasını / origin'i görünürde tutmasını sağlamalı
- [ ] Cancel edildiğinde challenge'ı kimlik bilgisi olmadan iptal ettiğini iletmeli
- [ ] `AuthPromptProps` sözleşmesi challenge tipini (site/proxy) açıkça taşımalı
- [ ] Turkish first-class olacak şekilde `tr` sözlüğü tam olmalı
- [ ] `pnpm typecheck` · `pnpm lint` · `pnpm test` betiklerini sağlamalı

## Çok niş
- [ ] `realm` boş geldiğinde dialog yine anlamlı bir başlık göstermeli
- [ ] Çok uzun `realm` metnini kırpmalı/sarmalı, layout'u bozmamalı
- [ ] Digest ve basic şemaları için UI farkı gerektirmeden aynı dialog'u kullanabilmeli
- [ ] Phase 5 SOCKS tünel senaryosunda 407'nin "VPN'iniz parolanızı istiyor" olarak okunmasını sağlamalı
- [ ] Klavyeyle (Enter = submit, Esc = cancel) tam kullanılabilir olmalı
