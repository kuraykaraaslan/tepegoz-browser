# markdown — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Ajan/asistan çıktısı için Markdown renderer'ı, bağımlı olduğu remark plugin'i ve URL sanitizer'ı: yalnızca React elemanına render eder (asla `dangerouslySetInnerHTML`), XSS- ve CSP-güvenlidir.

## Kesinlikle olmalı
- [ ] `Markdown` bileşeni yalnızca React elemanlarına render etmeli
- [ ] `dangerouslySetInnerHTML` asla kullanmamalı
- [ ] XSS- ve CSP-güvenli olmalı (ham HTML yok, `eval` yok)
- [ ] GitHub-flavored markdown'ı `remark-gfm` ile desteklemeli
- [ ] Fenced kod bloklarını `rehype-highlight` (saf JS) ile vurgulamalı
- [ ] Kod bloklarında dil etiketi göstermeli
- [ ] Kod bloklarında bir kopyala butonu sunmalı
- [ ] `copyLabel` prop'u (varsayılan `"Copy"`) hardcoded olmamalı, dışarıdan verilmeli
- [ ] `source` prop'u ile markdown metnini almalı
- [ ] `onOpenLink` `http(s)` link tıklamasında çağrılmalı; linkler renderer'ı asla navigate etmemeli
- [ ] `onOpenFile` linkified dosya yolu tıklamasında çağrılmalı; host tarafından izinli klasörlere gate'lenmeli
- [ ] `className` prop'unu desteklemeli
- [ ] `remarkFileLinks` prose içindeki mutlak dosya yollarını tıklanabilir linke çevirmeli
- [ ] Kod / inline-code içindeki metni ve mevcut linkleri değiştirmeden bırakmalı
- [ ] `linkifyText(value)` saf metin→metin/link-düğümü ayırıcısı olmalı; yol yoksa `null` döndürmeli
- [ ] `FILE_LINK_SCHEME` `tepegoz-file:` şemasını dışa vermeli

## Olsa iyi olur
- [ ] Link renderer `FILE_LINK_SCHEME`'i tanıyıp DOM'a navigable `href` olarak koymamalı (`#` render edip yolu click closure'ında taşımalı)
- [ ] `fileUrlTransform(url)` `ReactMarkdown`'a `urlTransform` olarak verilmeli ve yalnızca `tepegoz-file:` şemasını korumalı
- [ ] `fileUrlTransform` diğer her şeyi react-markdown'ın varsayılan transform'una devretmeli
- [ ] `javascript:` / `data:` ve diğer güvensiz şemalar yine strip edilmeli
- [ ] Kopyala butonu kod bloğunun içeriğini panoya kopyalamalı
- [ ] Ajanın çıktısı, dosya yolları linklenerek eyleme dönüştürülebilir olmalı
- [ ] Paket string-free bir leaf olmalı (tek lokalize parça `copyLabel` prop'u)

## Çok niş
- [ ] Windows tarzı yollar (`C:\Users\…\notes.txt`) prose içinde tanınmalı
- [ ] React `^18 || ^19` peer dependency olmalı; başka framework bağı olmamalı
- [ ] `remarkFileLinks` bir mdast (remark) plugin factory olarak yapılandırılabilmeli
- [ ] Aynı prose içinde birden fazla dosya yolu ayrı ayrı linklenebilmeli
- [ ] `linkifyText` yol çevresindeki noktalama/parantezleri yola dahil etmemeli
