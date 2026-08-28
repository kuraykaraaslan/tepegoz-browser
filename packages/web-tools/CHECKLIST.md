# web-tools — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Ajanın salt-okunur web araçları (`web_search`, `web_fetch`) — şemalar, capability kaydı ve içerik guard'ı; ağ çağrıları enjekte edilen `WebToolsHost` seam'inde.

## Kesinlikle olmalı

- [ ] `web_search` ve `web_fetch` araçları `browser_*` sekme araçlarından ayrı tutulmalı.
- [ ] Gerçek ağ çağrıları enjekte edilen `WebToolsHost` seam'i üzerinden yapılmalı; paket saf kalmalı.
- [ ] Paket ağ erişimi olmadan birim test edilebilir olmalı.
- [ ] `@tepegoz/web-tools` girişi wire tiplerini export etmeli (`WebSearchInput`, `WebFetchResult`, `WebToolsHost`, …).
- [ ] `@tepegoz/web-tools` `createSitemapReader` factory'sini export etmeli.
- [ ] `@tepegoz/web-tools` `web-perception` guard yardımcılarını export etmeli.
- [ ] Limit sabitleri export edilmeli: `DEFAULT_WEB_SEARCH_RESULTS` = 5, `MAX` = 10.
- [ ] Limit sabitleri export edilmeli: `DEFAULT_WEB_FETCH_BYTES` = 200k, `MAX` = 1M.
- [ ] `@tepegoz/web-tools/schemas` zod input şemalarını export etmeli (`WebSearchInputSchema`, `WebFetchInputSchema`).
- [ ] Girdiler araç sınırında `safeParse` ile doğrulanmalı.
- [ ] `@tepegoz/web-tools/tools` `registerWebTools({ host })` sağlamalı.
- [ ] `registerWebTools` `web_search_items` ve `web_fetch_*` araçlarını Capability Plane'e kaydetmeli.
- [ ] Kaydedilen araçlar `dangerClass: 'read'` ve `category: 'web'` olmalı.
- [ ] Getirilen sayfalar ve arama snippet'leri üründeki en az güvenilir girdi kabul edilmeli.
- [ ] Araçlar guarded string yaymalı: NFKC-folded, injection-redacted, anti-injection footer'lı.
- [ ] Guarded string şekli `browser_get_page`'in döndürdüğü şekille aynı olmalı.
- [ ] Model'e fence'siz ulaşacak ve TaintTracker'ı atlayacak yapılandırılmış obje döndürülmemeli.
- [ ] Verbatim URL'ler `artifacts`/`pageRefs` envelope slot'larında tutulmalı; navigasyon çalışmaya devam etmeli.
- [ ] `createSitemapReader` `robots.txt` → `Sitemap:` → `sitemap.xml` `<loc>` zincirini keşfetmeli.
- [ ] Sitemap reader yalnızca origin fiilen yayımladığında konvansiyonel yola (`/blog`) gitmeli.
- [ ] Sitemap reader SSRF'e karşı inşa gereği güvenli olmalı: yalnızca Policy plane üzerinden zaten yüklenmiş sayfayla *aynı origin*'deki URL'leri getirmeli.
- [ ] Keşif private-IP veya cloud-metadata host'una pivot yapamamalı.
- [ ] Sitemap keşfi sınırlı (bounded) ve origin başına cache'li olmalı.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` script'leri çalışır olmalı.

## Olsa iyi olur

- [ ] `web_search` sonuç sayısı `DEFAULT` ile `MAX` arasında istemci tarafından ayarlanabilmeli.
- [ ] `web_fetch` byte limiti `DEFAULT` ile `MAX` arasında ayarlanabilmeli ve aşımda net biçimde kesilmeli.
- [ ] Kesme (truncation) olduğunda sonuç bunu açıkça işaretlemeli.
- [ ] `WebFetchResult` içerik türünü (HTML/metin/PDF vb.) belirtmeli.
- [ ] HTML olmayan içerikler (PDF, düz metin) için makul bir metin çıkarımı yapılmalı.
- [ ] Arama sonuçları başlık + URL + snippet olarak yapılandırılmış slot'larda dönmeli (guarded metin ayrı).
- [ ] `WebToolsHost` seam'i timeout ve iptal (AbortSignal) desteklemeli.
- [ ] Sitemap reader'ın keşfettiği yol sayısı da sınırlanmalı.
- [ ] Aynı origin için tekrarlı `web_fetch` çağrıları cache'ten faydalanabilmeli.
- [ ] Ağ hatası ile "içerik yok" durumu ajana ayırt edilebilir biçimde raporlanmalı.

## Çok niş

- [ ] `robots.txt` birden fazla `Sitemap:` satırı veya sitemap index (nested sitemap) içerdiğinde hepsi sınır dahilinde çözülmeli.
- [ ] Sıkıştırılmış (`sitemap.xml.gz`) sitemap'ler ele alınmalı.
- [ ] Aynı origin kontrolü scheme (http↔https) ve port farklarını doğru değerlendirmeli.
- [ ] IDN/punycode host'larda origin karşılaştırması normalize edilmeli.
- [ ] Yönlendirme (redirect) zinciri başka bir origin'e giderse fetch reddedilmeli.
- [ ] Anti-injection footer'ın kendisi sayfa içeriğinde geçse bile guard tekrarlı/iç içe uygulanmamalı.
- [ ] `data:` veya `file:` şemalı URL'ler `web_fetch` tarafından reddedilmeli.
- [ ] Çok büyük sitemap `<loc>` listelerinde streaming/parça parça ayrıştırma ile bellek sınırlı kalmalı.
