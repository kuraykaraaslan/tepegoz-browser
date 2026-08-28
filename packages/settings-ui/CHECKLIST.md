# settings-ui — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Sunumsal yaprak: genel ayarlar kabuğu — opsiyonel grup başlıklı bir bölüm sidebar'ı, her bölümün `searchText`'i üzerinde filtreleyen bir arama kutusu, opsiyonel `banner` slotlu kaydırılabilir içerik alanı; kendi aktif-bölüm/arama durumunu ve i18n sözlüğünü sahiplenir, bölüm içeriği host tarafından sağlanır.

## Kesinlikle olmalı
- [ ] `SettingsLayout` — sidebar + arama + içerik kabuğunu sunmalı
- [ ] Sidebar bölümleri listelemeli, opsiyonel Chrome/Edge tarzı grup başlıklarıyla
- [ ] Arama kutusu her bölümün `searchText`'i üzerinde filtrelemeli
- [ ] Kaydırılabilir içerik alanı sunmalı, üstünde opsiyonel `banner` slotu ile
- [ ] Kendi aktif-bölüm (active-section) durumunu sahiplenmeli
- [ ] Kendi arama durumunu sahiplenmeli
- [ ] Kendi i18n sözlüğünü sahiplenmeli (`useT(settingsDict)` — ör. arama placeholder, "sonuç yok" metni)
- [ ] Sayfa başlığı için paylaşılan çekirdek sözlüğün `common.settings` değerini yeniden kullanmalı
- [ ] `SettingsSection` — `id`, `label`, `icon`, `searchText`, `content` (host-supplied `ReactNode`) ve opsiyonel `group` alanlarını tanımlamalı
- [ ] Bölüm içeriğinin tamamen host tarafından sağlandığını kabul etmeli — ayar kontrollerini kendisi içermemeli
- [ ] Yalnızca layout kabuğu olmalı, ayar sayfalarının kendisi olmamalı
- [ ] `ComingSoonCard` — henüz bağlanmamış bölümler için tip-güvenli placeholder kart sunmalı (title/description/preview items)
- [ ] `ComingSoonCard` hiçbir şey kalıcılaştırmamalı, hiçbir IPC çağırmamalı ve sıfır şema alanı eklemeli
- [ ] `settingsDict` / `SettingsStrings` — paketin kendi i18n sözlüğünü dışa aktarmalı

## Olsa iyi olur
- [ ] `group` verilen bölümleri sidebar'da başlık altında gruplamalı
- [ ] Arama sonucu boşsa "sonuç yok" kopyasını göstermeli
- [ ] Aktif bölüm seçildiğinde içerik alanını en üste kaydırmalı
- [ ] `titleIcon` prop'u ile başlık ikonu alabilmeli
- [ ] Her bölüm için `icon` göstermeli
- [ ] Arama büyük/küçük harf duyarsız ve kısmi eşleşmeli olmalı
- [ ] `banner` slotu verilmediğinde içerik alanı ekstra boşluk bırakmamalı

## Çok niş
- [ ] Hiç bölüm verilmediğinde makul bir boş durum göstermeli
- [ ] Aktif bölüm arama filtresiyle gizlendiğinde seçim tutarlı biçimde ilk görünür bölüme düşmeli
- [ ] Locale değişiminde sidebar etiketleri ve arama placeholder'ı anında güncellemeli
- [ ] Çok sayıda bölümde sidebar kaydırılabilir kalıp içerik alanından bağımsız scroll etmeli
- [ ] `searchText` ile `label` farklı dillerde olsa bile arama her ikisini de kapsayabilmeli
