# browser-menu — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Sunum amaçlı yaprak: tümüyle generic bir `MenuItem[]` modelinden sürülen, KUIreact stilinde yeniden kullanılabilir menü yüzeyi; aynı bileşen hem ana (hamburger) menüyü hem web sayfası sağ tık menüsünü besler.

## Kesinlikle olmalı
- [ ] Menüyü tümüyle generic bir `MenuItem[]` modelinden render etmeli
- [ ] Aynı bileşen hem ana (hamburger) menüyü hem web sayfası sağ tık menüsünü besleyebilmeli
- [ ] `item` (normal satır) varyantını render etmeli
- [ ] `separator` varyantını render etmeli
- [ ] `label` (bölüm etiketi) varyantını render etmeli
- [ ] `header` blok varyantını render etmeli
- [ ] Satır içi `zoom` kontrol satırını render etmeli
- [ ] Gruplanmış ikon-buton satırlarını (`actions-group`) render etmeli
- [ ] Flyout (submenu) parent satırlarını render etmeli
- [ ] Up / Down / Home / End ile klavye navigasyonu sağlamalı
- [ ] Tüm satır eylemlerini ve içerik kopyasını `items` modelinden almalı (kendi içermemeli)
- [ ] Yalnızca kendi yapısal string'lerini (ör. zoom satırı aria-label'ları) sahiplenmeli
- [ ] `ariaLabel` prop'unu menü yüzeyine uygulamalı
- [ ] Flyout satırlarının açma/kapama davranışını host'a (`flyout` prop) bırakmalı
- [ ] Host penceresini ve top-level Escape / dismissal'ı kendi yönetmemeli
- [ ] `Menu`, `MenuProps`, `MenuFlyout`, `MenuItem`, `MenuAction`'ı dışa aktarmalı
- [ ] `MenuFlyout` `onOpen` / `onClose` host hook'larını sağlamalı

## Olsa iyi olur
- [ ] `autoFocus` verildiğinde menü açılışında ilk öğeye odaklanmalı
- [ ] Opsiyonel `className` ile host'un stil geçişine izin vermeli
- [ ] `flyout.onOpen`'a parent satırın `id`'si ve `rect`'i verilmeli (host popup'ı konumlasın)
- [ ] Devre dışı (disabled) menü öğelerini klavye navigasyonunda atlamalı
- [ ] `MenuAction` içindeki `shortcut` metnini satırda göstermeli
- [ ] KUIreact stiliyle tutarlı görünmeli
- [ ] `pnpm typecheck` · `pnpm lint` · `pnpm test` betiklerini sağlamalı

## Çok niş
- [ ] Bu uygulamada flyout in-window değil, sola açılan ayrı native popup pencere olarak ele alınmalı
- [ ] Boş bir `items` modelinde bile geçerli (boş) bir menü yüzeyi render etmeli
- [ ] Ardışık `separator`'ları görsel olarak tekilleştirebilmeli
- [ ] Zoom satırının aria-label'ları kendi i18n sözlüğünden gelmeli, `items`'tan değil
- [ ] Home / End tuşları görünür ilk / son etkin öğeye gitmeli (header / separator'a değil)
- [ ] Çok uzun menüde odak takip eden kaydırma (scroll-into-view) yapmalı
