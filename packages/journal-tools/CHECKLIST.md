# journal-tools — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Ajanın `journal_search_events` builtin yeteneğinin Electron'suz evi: append-only Event Journal'dan güncel audit olaylarını okur; `CapabilityRegistry`'ye kayıtlı, yalnızca ToolGateway PEP üzerinden erişilir.

## Kesinlikle olmalı
- [ ] `registerJournalTools({ host })` ile `journal_search_events` yeteneğini kaydetmeli
- [ ] Yeteneği `@tepegoz/capability-plane` `CapabilityRegistry`'sine eklemeli
- [ ] Aracı enjekte edilen bir `JournalReader`'a bağlamalı
- [ ] Araç her zaman açık (always-on) ve `source: 'builtin'` olmalı
- [ ] Yalnızca ToolGateway PEP üzerinden erişilebilir olmalı
- [ ] Append-only Event Journal'dan güncel audit olaylarını okuyabilmeli
- [ ] Electron'dan bağımsız olmalı
- [ ] Persistence'tan bağımsız olmalı; somut okuma `JournalReader` seam'i ile enjekte edilmeli
- [ ] `JournalReader` ve `JournalEntry` tiplerini dışa vermeli
- [ ] `JournalEntry` kompakt ve önceden redakte edilmiş bir projeksiyon olmalı
- [ ] Uygulama `registerJournalTools`'u başlangıçta bir kez çağırmalı
- [ ] `@tepegoz/file-operations` builtin desenini izlemeli

## Olsa iyi olur
- [ ] `journal_search_events` olayları filtreleyip/arayabilmeli (sorgu parametreleri)
- [ ] Yalnızca okuma sunmalı; journal'a yazma yolu olmamalı
- [ ] Host `main/agent/journal-host.electron.ts` içinde `EventJournal` + SQLite üzerinden uygulanmalı
- [ ] `browser_*` ve `tab_*` builtin'leriyle yan yana çalışabilmeli
- [ ] Sonuç kümesi makul bir üst sınırla döndürülmeli (recent)
- [ ] Araç şeması `CapabilityRegistry` sözleşmesine uygun olmalı
- [ ] `JournalReader` dönüşü zaten redakte olduğundan tüketicide ek redaksiyon gerektirmemeli

## Çok niş
- [ ] ADR-0021/0024 alan bölünmesine uymalı (artık `com.tepegoz.agent` uzantısında değil)
- [ ] `com.tepegoz.agent` uzantısından taşınan eski davranışla geriye dönük tutarlı olmalı
- [ ] Enjekte edilen `JournalReader` yoksa kayıt anlamlı bir hata vermeli
- [ ] Zaman aralığı / olay türü gibi ölçütlerle daraltmaya izin verebilmeli
- [ ] Boş journal'da hata değil boş sonuç döndürmeli
