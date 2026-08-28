# omnibox — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Tarayıcının adres çubuğu: yazılan değeri sahiplenen, aktif sekmenin URL'siyle senkron tutan, satır-içi aritmetik değerlendiren ve enjekte edilen `onSuggest` ile deterministik birleşik öneri açılır listesi gösteren sunum katmanı.

## Kesinlikle olmalı
- [ ] `Omnibox` adres çubuğu girişini render edebilmeli
- [ ] Yazılan değeri kendi içinde sahiplenmeli (controlled)
- [ ] Görünen değeri aktif sekmenin `currentUrl`'i ile senkron tutmalı
- [ ] Kullanıcı düzenlerken değeri üzerine yazmamalı (edit sırasında sync durmalı)
- [ ] `evaluateOmniboxCalc` saf satır-içi aritmetik değerlendirici sunmalı
- [ ] Giriş bir aritmetik ifadeyken calc "chip"i göstermeli
- [ ] `onCalcResult` geri çağırmasını `CalcResult` ile tetiklemeli
- [ ] Calc yolu kendi başına arama veya AI thread başlatmamalı
- [ ] Öneri açılır listesi (listbox) deterministik sırayla gösterilmeli
- [ ] Önerileri kendisi getirmemeli; `onSuggest` enjekte edilmeli
- [ ] history / tab / search türlerini tek bir birleşik öneri listesinde sunmalı
- [ ] `buildOmniboxSuggestions` saf yardımcı ile sonuçları derleyebilmeli
- [ ] `parseOmniboxQuery` saf yardımcı ile girişi `OmniboxQuery`'ye ayrıştırabilmeli
- [ ] `looksNavigable` ile bir girişin URL mi arama terimi mi olduğunu ayırt edebilmeli
- [ ] `MAX_OMNIBOX_SUGGESTIONS` üst sınırını uygulamalı
- [ ] Gönderimde `onNavigate(input)` geri çağırmasını tetiklemeli
- [ ] Sekme önerisi seçildiğinde `onActivateTab(tabId)` tetiklemeli
- [ ] Elektron köprüsüne bağımlı olmamalı; navigasyon/sekme/pano callback ile enjekte edilmeli
- [ ] Pano (clipboard) erişimi doğrudan değil enjekte edilerek yapılmalı
- [ ] `OmniboxProps` sözleşmesini (`currentUrl`, `placeholder`, `onNavigate`, `onCalcResult`, `onSuggest`, `onActivateTab`) dışa vermeli
- [ ] Yer tutucu (placeholder) metni yerelleştirilmiş olarak dışarıdan alınmalı
- [ ] Öneri veri tiplerini (`OmniboxSuggestion`, `OmniboxSuggestionKind`, `OmniboxAction`, `OmniboxScope`, `OmniboxQuery`, aday tipleri) dışa vermeli
- [ ] Önerilerde klavye gezinmesini (ok tuşları, Enter) desteklemeli

## Olsa iyi olur
- [ ] İlk öneriyi varsayılan olarak vurgulayabilmeli
- [ ] Escape ile girişi mevcut sekme URL'sine geri döndürebilmeli
- [ ] Öneri türlerini görsel olarak (türe özgü ikon) ayırt edebilmeli
- [ ] `OmniboxScope` ile kapsam-sınırlı arama (yalnızca geçmişte/sekmelerde) sunabilmeli
- [ ] Mevcut URL'yi kopyalama eylemi sunabilmeli
- [ ] Düz bir sorgu için arama motoru ipucu gösterebilmeli
- [ ] `OmniboxBookmarkCandidate` yer imi adaylarını önerilere katabilmeli
- [ ] Öneriler yenilendiğinde kullanıcının seçimini koruyabilmeli
- [ ] Yazılan alt dizeyi önerilerde vurgulayabilmeli (match highlighting)
- [ ] Calc sonucunda Enter ile sonucu panoya kopyalayabilmeli

## Çok niş
- [ ] Calc işlem önceliği, parantez ve sıfıra bölmeyi doğru ele almalı
- [ ] `looksNavigable`'da IDN / punycode gösterimini ele almalı
- [ ] Çok uzun URL'yi ortadan kısaltarak (ellipsis) gösterebilmeli
- [ ] Yapıştır-ve-git (paste-and-go) ile yapıştırmada navigasyon tetikleyebilmeli
- [ ] Hem geçmiş hem açık sekme olarak görünen bir URL'yi tekilleştirebilmeli
- [ ] Karışık URL + metin girişinde RTL / bidi davranışını doğru ele almalı
- [ ] Adres çubuğuna bir URL sürükleyip bırakınca navigasyon yapabilmeli
