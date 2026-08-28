# extensions-ui — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Presentational leaf: `tepegoz://extensions` yöneticisi — enable/disable toggle'lı, aranabilir bir eklenti kartı ızgarası.

## Kesinlikle olmalı
- [ ] `ExtensionsGrid` eklenti kartlarından oluşan aranabilir bir ızgara render etmeli
- [ ] Her kartta bir enable/disable toggle bulunmalı
- [ ] `onToggle(id, enabled)` ile toggle değişimini host'a iletmeli
- [ ] Kendi arama (search) state'ini yönetmeli
- [ ] Arama sorgusuna göre kartları filtrelemeli
- [ ] Eklenti listesi, manifest label'ları, ikonlar ve enabled durumu `items` prop'undan gelmeli
- [ ] App'e özgü hiçbir eklenti/registry mantığı taşımamalı
- [ ] `ExtensionCardItem` şeklini (`id`, `icon`, `name`, `description`, `meta`, `enabled`) dışa aktarmalı ki host'lar kendi objelerini eşlesin
- [ ] Kendi i18n sözlüğünü (`extensionsDict`) `useT` ile kullanmalı
- [ ] `extensionsDict`/`ExtensionsStrings`'i dışa aktarmalı
- [ ] Chrome tarzı bir eklenti yöneticisi kabuğu görünümü sunmalı

## Olsa iyi olur
- [ ] Arama sonucu boşken anlamlı bir "sonuç yok" durumu göstermeli
- [ ] `icon` alanını rastgele bir React node olarak kabul edebilmeli
- [ ] `meta` satırında sürüm/kaynak gibi serbest metni gösterebilmeli
- [ ] Kart ızgarası dar/geniş pencerelerde responsive akmalı
- [ ] Toggle durumu `items`'tan controlled olarak yansımalı (kendi kopyasını tutmamalı)
- [ ] en/tr sözlüklerinin anahtar kümesi birebir eşleşmeli
- [ ] Arama alanı klavyeyle erişilebilir/odaklanabilir olmalı

## Çok niş
- [ ] Çok sayıda eklenti kartında ızgara akıcı kalmalı
- [ ] `description` çok uzun olduğunda kart düzenini bozmadan kırpmalı/sarmalı
- [ ] Aynı `id`'ye sahip iki item verilirse öngörülebilir davranmalı
- [ ] Sözlükte olmayan bir dil için çekirdek dile düşmeli
