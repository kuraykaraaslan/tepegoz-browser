# bookmarks-bar — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Sunum amaçlı yaprak: nav toolbar'ın altında oturan Chrome tarzı bookmarks bar şeridi; yatay, kaydırılabilir bir bookmark chip satırı render eder ve chip'e tıklanınca enjekte edilen `onOpen(url)`'ü çağırır.

## Kesinlikle olmalı
- [ ] Nav toolbar'ın altında yatay bir bookmark şerit çubuğu render etmeli
- [ ] Bookmark'ları chip olarak yatay, kaydırılabilir bir satırda göstermeli
- [ ] Bir chip'e tıklandığında enjekte edilen `onOpen(url)`'ü çağırmalı
- [ ] Bookmark listesini prop olarak host'tan almalı (kendi veri kaynağı olmamalı)
- [ ] Hiç string sahiplenmemeli — `labels` prop'undan almalı
- [ ] Electron bridge bağımlılığı olmamalı
- [ ] Liste boşken `labels.empty` metnini göstermeli
- [ ] `bookmarks` öğelerinden `url` ve `title`'ı kullanmalı
- [ ] Çubuğun gösterilip gösterilmeyeceği kararını host'a bırakmalı, istendiğinde render etmeli
- [ ] Chip tıklaması dışında navigasyon kararı vermemeli (yalnızca `onOpen`'ı çağırmalı)

## Olsa iyi olur
- [ ] Çubuk taşarsa yatay kaydırma ile tüm chip'lere erişilebilmeli
- [ ] `labels.bar` metnini erişilebilirlik (aria-label) için kullanmalı
- [ ] Diğer chrome yaprakları (tab-strip, nav-toolbar) ile tutarlı stilde olmalı
- [ ] Uzun başlıklı chip'leri kırpmalı, satırı tek sıra tutmalı
- [ ] Aynı URL'e sahip birden çok bookmark'ı ayrı chip olarak gösterebilmeli
- [ ] `pnpm typecheck` · `pnpm lint` · `pnpm test` betiklerini sağlamalı

## Çok niş
- [ ] `title`'ı olmayan bir bookmark için `url`'e düşerek chip etiketi göstermeli
- [ ] Çok sayıda (yüzlerce) bookmark'ta bile kaydırma performansını korumalı
- [ ] Favicon verisi verilmese bile chip düzgün render olmalı
- [ ] Boş `bookmarks` dizisi ile `undefined` arasında aynı boş-durumu göstermeli
- [ ] Klavye ile chip'ler arasında gezinilebilmeli
- [ ] Pencere çok darken şerit yine tek satır kalmalı, nav toolbar'ı itmemeli
