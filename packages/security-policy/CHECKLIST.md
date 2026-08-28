# security-policy — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Deterministik Policy Kernel (L8, ADR-0006): güvenlik modelden önce düz kodda uygulanır. Bir tool çağrısının danger class'ı, taint'i ve hedef sitesine bakıp allow/deny/ask + kararlı reason code + biyometrik gereksinimi döndürür; hassas-site listesi, human-handoff dedektörü, taint tracker ve Egress Firewall'ı da sahiplenir.

## Kesinlikle olmalı
- [ ] `PolicyKernel.evaluate(ctx)` — `PolicyContext` alıp `PolicyResult` (`decision` / `reason` / `biometric`) döndürmeli
- [ ] Kararı model çalışmadan önce, düz kodda (deterministik) vermeli — model guardrail'lerine devretmemeli
- [ ] Aynı girdi için her zaman aynı kararı üretmeli (deterministik)
- [ ] Hassas siteleri (bank / crypto / health / password-manager) kilitlemeli (deny)
- [ ] Tainted (web-türevli) state-changing çağrılarda HITL'i zorlamalı
- [ ] Danger class'a göre geçit uygulamalı: `read` / `state_changing` / `destructive` / `financial`
- [ ] Her karar için kararlı, makine-okunur bir reason code (Permission Debug) döndürmeli
- [ ] HIGH-RISK eylemlerin biyometrik (Windows Hello) onayı gerektirip gerektirmediğini belirtmeli
- [ ] `isSensitiveSite` — banka/kripto/sağlık/parola-yöneticisi kategori listesine karşı URL allow/deny kontrolü yapmalı
- [ ] ADR-0039 gereği `isSensitiveSite` şu an koşulsuz deny olmalı (grant girişi henüz uygulanmadı)
- [ ] `detectHandoff` / `HANDOFF_KINDS` — bir sayfanın captcha/2FA gerektirdiğini tespit etmeli
- [ ] `TaintTracker` — web içeriğinden türeyen veriyi işaretlemeli ve sorgulamalı
- [ ] `argsAreTainted` — tool-call argümanlarının tainted olup olmadığını söylemeli
- [ ] `findTaintedValues` — argümanlar içindeki tainted değerleri bulmalı
- [ ] `isUntrustedProvenance` / `PROVENANCE_LEVELS` — provenance seviyesini sınıflandırmalı
- [ ] Taint sorgusu Policy Kernel'in forced-HITL kuralını sürmeli
- [ ] `EgressFirewall` / `inspectEgress` — giden veriyi exfiltrasyon riski için incelemeli
- [ ] `shannonEntropy` — yüksek-entropili blob tespiti için entropi hesaplamalı
- [ ] `inspectEgress` bir `EgressVerdict` ve `EGRESS_FINDING_KINDS`'tan bulgu türleri döndürmeli
- [ ] Egress incelemesi sır (secret) ve yüksek-entropili blob'ları yakalamalı
- [ ] Saf TypeScript olmalı — Electron yok, I/O yok, tam birim-test edilebilir
- [ ] `@tepegoz/capability-plane` için ToolGateway PEP'in arkasındaki tek karar noktası olmalı
- [ ] Otonomi bir hassas-site deny'ini asla kaldıramamalı (yalnızca out-of-band user grant kaldırabilir)
- [ ] Hiçbir agent tool'u bir grant oluşturamamalı

## Olsa iyi olur
- [ ] ADR-0039 uygulandığında `isSensitiveSite` "pre-grant" kontrolüne dönüşmeli: eşleşme, kategoriyi kapsayan aktif user grant yoksa deny
- [ ] Bir user grant yalnızca tek kategori için deny'i kaldırabilmeli
- [ ] 2FA otomatik çözülmeli (Credential Broker üzerinden); handoff yalnızca tarayıcının çözemediği challenge için fallback olmalı
- [ ] `PolicyResult` reason code'ları kullanıcıya gösterilebilir Permission Debug metnine eşlenebilmeli
- [ ] Danger class arttıkça karar sıkılığı monoton olmalı (destructive/financial en katı)
- [ ] Taint yayılımı türev değerlere de bulaşmalı (bir tainted alandan üretilen alan da tainted)
- [ ] Egress firewall bilinen sır formatlarını (API anahtarı, token) desen tabanlı tanımalı
- [ ] `PolicyContext` şeması trust-boundary'de doğrulanabilir olmalı

## Çok niş
- [ ] Bilinmeyen bir danger class geldiğinde en katı (deny/ask) tarafa düşmeli (fail-closed)
- [ ] IDN / punycode ile yazılmış hassas-site alan adları da kategoriyle eşleşmeli
- [ ] Entropi eşiği kısa ama yüksek-entropili dizelerde yanlış pozitif üretmeyecek şekilde ayarlanabilir olmalı
- [ ] Aynı anda hem tainted hem hassas-site olan çağrıda en kısıtlayıcı sonuç kazanmalı
- [ ] Grant süresi dolduğunda deny otomatik geri gelmeli
- [ ] Handoff tespiti sayfanın captcha/2FA sağlayıcısını (ör. reCAPTCHA/hCaptcha) ayırt edebilmeli
- [ ] `EgressVerdict` veri parçasının hangi bölümünün riskli olduğunu işaretleyebilmeli
