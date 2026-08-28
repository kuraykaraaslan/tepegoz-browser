# local-inference — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> `model-gateway` için on-device inference sağlayıcısı: `LocalProvider`, enjekte edilen bir `LlamaEngine` üzerine gateway'in `ModelProvider` sözleşmesini uygular; Electron'suz kalır, JSON modunda çıktıyı GBNF grameriyle tek JSON nesnesine kısıtlar.

## Kesinlikle olmalı
- [ ] `LocalProvider` gateway'in `ModelProvider` sözleşmesini uygulamalı
- [ ] Enjekte edilen bir `LlamaEngine` üzerine kurulmalı; native binary'ye kendisi dokunmamalı
- [ ] Electron'dan bağımsız olmalı
- [ ] Seçili modeli `config.resolveModel()` ile çözmeli
- [ ] Modeli sıcak tutmalı (`engine.load` model id başına idempotent)
- [ ] `responseFormat:'json'` istendiğinde GBNF gramerini uygulamalı
- [ ] `engine.generate` çağrısından önce sampling ayarlarını uygulamalı
- [ ] `LlamaEngine` arayüzünü (`load` / `generate` / `unload` / `isAvailable`) dışa vermeli
- [ ] `LocalProviderConfig` (`engine`, `resolveModel`, opsiyonel `sampling`) tipini dışa vermeli
- [ ] `SelectedLocalModel` / `GenerateOptions` / `GenerateResult` / `LocalModelHandle` şekillerini dışa vermeli
- [ ] `jsonObjectGrammar` tek bir JSON nesnesine kısıtlayan bağımsız GBNF metnini döndürmeli
- [ ] Gramer llama.cpp gramer formatında olmalı
- [ ] `grammarFor` bir `CanonRequest` için doğru grameri seçmeli
- [ ] `toLocalTurns` mesajları engine turn'lerine düzleştirmeli (saf)
- [ ] `fromLocalResult` engine `GenerateResult`'ı canonical `CanonResponse`'a çevirmeli (saf)

## Olsa iyi olur
- [ ] JSON modunda zayıf model fiziksel olarak prose veya markdown fence üretememeli
- [ ] Çıkış şeması yine de downstream'de zod ile doğrulanmalı (gramer tek garanti değil)
- [ ] Somut engine (node-llama-cpp) masaüstü uygulaması tarafından enjekte edilmeli
- [ ] `CredentialVault`'un `SecretCrypto` enjekte etmesiyle aynı deseni izlemeli
- [ ] `map-request` ve `map-response` saf modüller olarak ayrık kalmalı
- [ ] `engine.load` aynı model id için tekrar çağrıldığında yeniden yüklememeli
- [ ] `isAvailable` ile motorun kullanılabilirliği generate'ten önce sorgulanabilmeli

## Çok niş
- [ ] Model değişince eski modeli `unload` edip yenisini yükleyebilmeli
- [ ] `sampling` verilmezse makul varsayılan sampling knob'larına düşmeli
- [ ] GBNF grameri iç içe/keyfi değerlere izin verirken tek kök JSON nesnesini zorlamalı
- [ ] `resolveModel` seçili model yoksa anlamlı bir hata vermeli
- [ ] Paket, injected engine olmadan da tip-kontrol ve test edilebilmeli
