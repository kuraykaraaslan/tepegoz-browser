# native-rs — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Tepegöz için Rust hot-path crate'i (napi-rs) — henüz kurulmadı; Phase 1b için belgelenmiş bir placeholder (plan §7, ADR-0001).

## Kesinlikle olmalı
- [ ] Şu an için kasıtlı olarak `package.json` içermemeli — pnpm workspace paketi olmamalı
- [ ] Mevcut aşamada CI'ın Rust toolchain gerektirmemesini sağlamalı
- [ ] Phase 1b için belgelenmiş bir placeholder olarak durmalı (plan §7, ADR-0001'e atıfla)
- [ ] Aktive edildiğinde napi-rs (@napi-rs/cli) ile derlenen bir crate olmalı
- [ ] Aktive edildiğinde Turborepo'ya bağlanmalı
- [ ] Aktive edildiğinde CI'a bir Rust toolchain adımı eklenmeli
- [ ] Egress anomali / Base64-exfiltration tarayıcısını barındırmalı (MVP TypeScript sürümünden port)
- [ ] Screenshot eviction (ekran görüntüsü tahliyesi) mantığını sağlamalı
- [ ] WebP kodlamasını (encoding) hot-path olarak sağlamalı
- [ ] Checkpoint (de)serialization hot-path'ini sağlamalı
- [ ] Local-SLM bridge'i sağlamalı

## Olsa iyi olur
- [ ] Base64-exfiltration tarayıcısının davranışı port edildiği TypeScript MVP sürümüyle eşdeğer kalmalı
- [ ] Hot-path işleri (WebP, checkpoint) TypeScript eşdeğerlerinden ölçülebilir hızlanma sağlamalı
- [ ] napi-rs kullandığı için prebuild'leri ABI'den bağımsız olmalı (Electron ABI'ye bağlanmamalı)
- [ ] Aktive olana dek repoda hiçbir derleme/test yükü getirmemeli
- [ ] Planlanan dört sorumluluğu (scanner, screenshot/WebP, checkpoint, SLM bridge) ayrı modüllere bölebilmeli

## Çok niş
- [ ] Rust toolchain'i olmayan bir makinede repo klonlandığında hiçbir kurulum adımını bozmamalı
- [ ] Aktivasyon sırasında var olan TypeScript egress tarayıcısıyla yan yana çalışıp kademeli geçişe izin vermeli
- [ ] Screenshot eviction bellek baskısı altında en eski görüntüleri önce atmalı
- [ ] Checkpoint (de)serialization büyük oturum durumlarında bile ana thread'i bloklamamalı
- [ ] Local-SLM bridge model-gateway'in local transport'una bağlanabilecek bir yüzey sunmalı
