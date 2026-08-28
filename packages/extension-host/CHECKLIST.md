# extension-host — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> In-process, agent-kontrollü eklentiler: etkin eklentilerin capability araçlarını CapabilityRegistry'ye senkronlayan supervisor'lar (ADR-0021/0024).

## Kesinlikle olmalı
- [ ] `ExtensionCapabilitySupervisor` etkin bir eklentinin `defineCapabilities` araçlarını tek `CapabilityRegistry`'ye kaydetmeli
- [ ] Eklenti devre dışı bırakıldığında bu araçları registry'den kaldırmalı
- [ ] `reconcile()` idempotent olmalı — başlangıçta ve her prefs/enable değişiminde çağrılabilmeli
- [ ] `provide(set, host)` bir eklentinin `ExtensionCapabilitySet`'ini somut host'una bağlamalı
- [ ] Meta `extension_list`/`get`/`update_item` araçlarını her zaman kaydetmeli (agent eklentileri kendisi yönetebilsin)
- [ ] `agent-runtime`'da değişiklik gerektirmemeli — planner zaten `CapabilityRegistry.list()` sıralıyor
- [ ] Electron-free olmalı; registry adapter ve `ExtensionManagementHost` enjekte edilmeli
- [ ] `CapabilityRegistryPort` minimal seam'i (`register`/`unregister`/`has`) üzerinden çalışmalı
- [ ] `ExtensionInfo` ile bir eklentinin kimlik/durumunu (id, name, version, enabled, permissions, katkı capability id'leri) agent'a sunmalı
- [ ] `ExtensionManagementHost` üzerinden meta araçların `list`/`get`/`setEnabled` çağrılarını yürütmeli
- [ ] Katkı sağlanan tüm eklenti araçları ToolGateway PEP arkasında kalmalı
- [ ] `ActionInterceptorSupervisor` bir eklentinin `ActionInterceptorSet`'ini `provide(set)` ile kaydetmeli
- [ ] `evaluate(actionType, ctx)` ilk etkin ve eşleşen interceptor engelliyorsa `true` döndürmeli
- [ ] `ActionInterceptorSupervisor` kalıcı registry tutmamalı; her çağrıda `isEnabled`'ı canlı kontrol etmeli
- [ ] `EXTENSION_HOST_ID` altında meta araçları kaydetmeli
- [ ] `ExtensionManagementHost` app tarafından `PreferenceStore` + `BUILTIN_MANIFESTS` üzerinden implemente edilebilecek şekilde enjekte edilmeli

## Olsa iyi olur
- [ ] `reconcile()` yalnızca değişen eklentilerin kayıtlarına dokunmalı (gereksiz register/unregister yapmamalı)
- [ ] Bir eklentinin devre dışı → etkin geçişinde araçlarını yeniden kaydedebilmeli
- [ ] `McpSupervisor` ile simetrik bir API yüzeyi sunmalı (in-process analog)
- [ ] Aynı capability id'sini iki eklentinin kaydetmeye çalışması durumunu ele almalı
- [ ] Action interceptor'lar senkron kalmalı (Promise döndürmemeli) — `setWindowOpenHandler`/`will-navigate` uyumu
- [ ] Etkin olmayan eklentinin interceptor'ları `evaluate`'te hiç değerlendirilmemeli
- [ ] `provide` aynı eklenti için tekrar çağrıldığında önceki set'i temiz biçimde değiştirmeli
- [ ] Meta araçlar üzerinden yapılan `setEnabled` çağrısı ardından `reconcile()` etkisini görmeli

## Çok niş
- [ ] Kayıt sırasında host nesnesi `H` enjeksiyonu başarısız olursa eklentiyi atlayıp diğerlerini kaydetmeli
- [ ] Registry'de zaten var olan bir araç id'si için `has` kontrolüyle çakışmayı önlemeli
- [ ] `ActionType` birleşimi genişlediğinde yeni aksiyon tipini kod değişikliği olmadan değerlendirebilmeli
- [ ] Startup'ta hiç etkin eklenti yoksa yalnızca meta araçlarla tutarlı durmalı
- [ ] Kısa sürede çok sayıda prefs değişiminde `reconcile()` sonuç durumu deterministik olmalı
