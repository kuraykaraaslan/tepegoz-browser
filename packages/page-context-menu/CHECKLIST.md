# page-context-menu — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Chrome tarzı web sayfası sağ-tık bağlam menüsünün *modeli*: kendisi hiçbir şey render etmez; `buildPageContextMenuModel`, sağ-tık bağlamına (düzenlenebilir alan, bağlantı, görsel, video/ses, metin seçimi veya genel sayfa) dallanarak jenerik bir `MenuItem[]` üretir.

## Kesinlikle olmalı
- [ ] `buildPageContextMenuModel` saf `(t, ctx, actions) => MenuItem[]` imzasıyla çalışmalı
- [ ] Döndürdüğü model, `@tepegoz/browser-menu`'nün `<Menu>`'sünün tükettiği `MenuItem[]` tipiyle aynı olmalı
- [ ] Kendisi hiçbir şey render etmemeli (yalnızca model)
- [ ] Menüyü düzenlenebilir-alan bağlamına göre dallandırabilmeli
- [ ] `linkUrl` varken bağlantı bağlamına göre dallandırabilmeli
- [ ] Görsel (image) bağlamına göre dallandırabilmeli
- [ ] `mediaType` ile video/ses bağlamına göre dallandırabilmeli
- [ ] `selectionText` varken metin-seçimi bağlamına göre dallandırabilmeli
- [ ] Özel bir bağlam yokken genel sayfa menüsünü üretebilmeli
- [ ] "Geri" öğesini `ctx.canGoBack`'e göre etkin/pasif yapabilmeli
- [ ] "İleri" öğesini `ctx.canGoForward`'a göre etkin/pasif yapabilmeli
- [ ] "Yenile" öğesini sunabilmeli
- [ ] Kaydet / yazdır / kaynağı görüntüle / incele öğelerini sunabilmeli
- [ ] Kopyala / kes / yapıştır / tümünü seç öğelerini `canCopy`/`canCut`/`canPaste`/`canSelectAll` bayraklarına göre kapılamalı
- [ ] `linkUrl` varken bağlantı eylemlerini (aç, bağlantıyı kopyala) sunabilmeli
- [ ] Medya eylemlerini `srcUrl` / `mediaType`'a göre üretebilmeli
- [ ] Eşleşen eylemi olmayan satırları pasif (disabled) yer tutucu olarak render etmeli
- [ ] Pasif yer tutucu satırlar klavye ile atlanmalı (keyboard-skipped)
- [ ] `PageContextMenuContext` tipi sağ-tık anında yakalanan her şeyi (`canGoBack`, `canGoForward`, `selectionText`, `linkUrl`, `srcUrl`, `mediaType`, `isEditable`, edit bayrakları) taşımalı
- [ ] `PageContextMenuActions` bağlı callback'leri tanımlamalı; verilmeyen eylemler pasif satıra dönüşmeli
- [ ] `PageContextMenuMediaType` Electron `context-menu` olayının `params.mediaType`'ını yansıtmalı
- [ ] İçerik dizelerini kendi `./i18n`'inde sahiplenmeli
- [ ] Hiçbir menü etiketini sabit kodlamamalı

## Olsa iyi olur
- [ ] Henüz yapılmamış özellikler için yer tutucu satırlar sunmalı (Cast, Lens, okuma modu)
- [ ] Mantıksal gruplar arasında ayraç (separator) koyabilmeli
- [ ] "Görseli kopyala" ile "Görsel adresini kopyala"yı ayırt edebilmeli
- [ ] "Bağlantıyı farklı kaydet" ile "Görseli farklı kaydet"i ayırt edebilmeli
- [ ] "Bağlantıyı yeni sekmede / yeni pencerede aç" öğelerini sunabilmeli
- [ ] `selectionText` varken "web'de ara" öğesini sunabilmeli
- [ ] "Görseli yeni sekmede aç" öğesini sunabilmeli
- [ ] Düzenlenebilir bağlam için yazım denetimi / emoji alt-menü bölgesi sunabilmeli
- [ ] Öğe sıralamasını Chrome'un menüsüyle tutarlı tutmalı

## Çok niş
- [ ] Düzenlenebilir bağlamda "Geri Al / Yinele" sunabilmeli
- [ ] Düzenlenebilir alanlar için yazım yönü (writing-direction) alt menüsü sunabilmeli
- [ ] `data:` / `blob:` URL bağlantılarını zarifçe ele almalı
- [ ] `mailto:` / `tel:` bağlantılarını özel durum olarak ele almalı
- [ ] Video için döngü / kontrolleri göster / picture-in-picture öğeleri sunabilmeli
- [ ] Çok uzun `selectionText`'i "… için ara" etiketinde kırpabilmeli
- [ ] Çerçeveye özgü öğeler (çerçeveyi yenile, çerçeve kaynağını görüntüle) sunabilmeli
