# ui — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Paylaşılan tasarım-sistemi paketi: forklanmış KUIreact atom'larının ince bir barrel'ı + first-party parçalar (brand mark, FontAwesome ikon yüzeyi, error boundary), tasarım token'ları stylesheet'i ve `cn` / `PolymorphicProps` yardımcıları. Salt sunum, state barındırmaz, fork-on-demand.

## Kesinlikle olmalı
- [ ] Forklanmış KUIreact atom'larını (`Button`, `Toggle`, `Card`, `Modal`, `Input`, `Badge`, `AlertBanner`) tek bir ince barrel'dan dışa vermeli
- [ ] `AlertBanner` ile birlikte `AlertAction` tipini sunmalı
- [ ] `BrandMark` marka/logo işaretini sunmalı (`@tepegoz/browser-chrome` kullanır)
- [ ] `Icon` paylaşılan FontAwesome ikon bileşenini sunmalı
- [ ] `Icon` ile birlikte `IconName` ve `IconProps` tiplerini sunmalı
- [ ] `ErrorBoundary` first-party React error boundary'sini sunmalı
- [ ] `cn` (clsx + tailwind-merge) sınıf-adı birleştirme yardımcısını sunmalı
- [ ] `PolymorphicProps` `as`-prop tarzı bileşenler için paylaşılan tipi sunmalı
- [ ] Tasarım token'ları stylesheet'ini `@tepegoz/ui/styles/tokens.css` yolundan dışa vermeli
- [ ] Tüm bileşenleri salt sunum (presentational) tutmalı — uygulama state'i barındırmamalı
- [ ] Bileşenleri talep üzerine eklemeli (fork-on-demand) — tam kit olarak önceden kurmamalı
- [ ] Fork edilen atom'lar için fork politikasını `_FORK.md`'de belgeli tutmalı
- [ ] Forklanmış (KUIreact) parçalar ile first-party parçaları ayırt edilebilir tutmalı

## Olsa iyi olur
- [ ] `cn`'in Tailwind sınıf çakışmalarını (tailwind-merge) doğru çözmesini sağlamalı
- [ ] Diğer chrome leaf paketlerinin tek tutarlı token kaynağı olarak `tokens.css`'i kullanabilmesini sağlamalı
- [ ] `Icon` yüzeyini FontAwesome ikon setine tek geçiş noktası yapmalı
- [ ] `Button` / `Toggle` / `Input` bileşenlerini erişilebilir (aria, focus) varsayılanlarla sunmalı
- [ ] `Modal`'ı odak tuzağı ve escape ile kapatma gibi temel davranışlarla sunmalı
- [ ] Bileşenlerin görünümünü tema token'larından türetmeli (sabit renk gömülü olmamalı)
- [ ] `as`-prop ile polimorfik kullanımını tip güvenli biçimde desteklemeli
- [ ] Barrel'ı tree-shake edilebilir tutmalı (kullanılmayan atom bundle'a girmemeli)

## Çok niş
- [ ] Light/dark tema geçişinde token'ların tüm atom'larda tutarlı uygulanmasını sağlamalı
- [ ] Aynı bileşenin hem forklanmış hem first-party sürümünün yanlışlıkla birlikte export edilmesini önlemeli
- [ ] `IconName` tipini mevcut FontAwesome ikon kümesiyle senkron tutmalı
- [ ] `ErrorBoundary`'nin yakaladığı hatayı yutmadan host'a raporlayabilmesini sağlamalı
- [ ] RTL yerleşimde ikon/hizalama yönünü token veya utility üzerinden çevirebilmeli
- [ ] `_FORK.md` politikasıyla upstream KUIreact değişikliklerini yeniden fork ederken sapmayı sınırlı tutmalı
