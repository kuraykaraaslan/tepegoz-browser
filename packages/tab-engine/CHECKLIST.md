# tab-engine — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Pure, Electron-free tab-state modeli: eklenme sıralı sekme kümesi, tab grupları, pinleme, aktif sekme, id tahsisi, renderer-facing `TabsState` projeksiyonu ve agent'ın built-in `tab_*` yeteneği.

## Kesinlikle olmalı
- [ ] Sekmeleri eklenme sırasına göre koruyan bir küme olarak tutabilmeli (Map insertion order; ayrı index alanı yok)
- [ ] `add`/`get`/`has`/`delete` ile sekme kaydı yaşam döngüsünü yönetebilmeli
- [ ] Her sekmeye benzersiz bir id tahsis edebilmeli
- [ ] Aktif sekmeyi izleyebilmeli ve silme sonrası tutarlı bir aktif sekme bırakabilmeli
- [ ] Sabitlenmiş (pinned) sekmeleri tüm sabitlenmemişlerin önünde bitişik bir blok olarak tutabilmeli
- [ ] Tab gruplarını (renk + ad) oluşturma/atama/kaldırma mutasyonlarıyla yönetebilmeli
- [ ] Her grubun üyelerini, grubun ilk üyesine sabitlenmiş bitişik bir blok halinde tutabilmeli
- [ ] Sabitlenmiş sekmenin gruba ait olmasını engellemeli (pinleme grup üyeliğini temizler ve tersi de geçerli)
- [ ] Boş grupları otomatik budayabilmeli (prune)
- [ ] Her yapısal mutasyondan sonra `normalize()` ile sıralama/gruplama değişmezlerini merkezî olarak uygulamalı
- [ ] Sıralama/gruplama değişmezlerini metot metot elle değil tek bir geçişte garanti etmeli
- [ ] `toState(nav)` ile modeli renderer-facing `TabsState` projeksiyonuna dönüştürebilmeli
- [ ] `TabsState` projeksiyonuna geri/ileri gezinme uygunluğunu (nav) dahil edebilmeli
- [ ] Electron runtime olmadan birim testi yapılabilir kalmalı (WebContentsView / Electron I/O içermemeli)
- [ ] `TabKind` ile `'web'` (uygulamada WebContentsView'lı) ve `'internal'` (`tepegoz://`, view'sız) sekmeleri ayırt edebilmeli
- [ ] `TabRecord` olarak wire `TabInfo` şekli + engine-only `kind` ayrıştırıcısını sunabilmeli
- [ ] `TAB_GROUP_COLORS` sabit Chrome-tarzı palet ve `DEFAULT_GROUP_COLOR` varsayılanını sağlamalı
- [ ] Yeni oluşturulan gruba `DEFAULT_GROUP_COLOR` atayabilmeli
- [ ] `registerTabTools({ host })` ile `tab_*` araçlarını `CapabilityRegistry`'ye kaydedebilmeli
- [ ] `tab_list_items`, `tab_get_item`, `tab_create_item`, `tab_update_item`, `tab_delete_item` araçlarını sunmalı
- [ ] `tab_*` araçlarını her zaman açık `source: 'builtin'` olarak ToolGateway PEP arkasında kaydetmeli
- [ ] `TabHost` seam'ini enjekte edilebilir tutmalı: `listTabs()`, `createTab(url?, groupName?, background?)`, `activateTab(id)`, `closeTab(id)`
- [ ] `registerTabTools`'un uygulama tarafından başlangıçta bir kez çağrılmasını desteklemeli
- [ ] Grup/pin/sıralama bilgisini yalnızca organizasyonel meta veri olarak ele almalı (yetenek/izin/politika semantiği taşımamalı)
- [ ] `TabGroup` engine-local tipini wire `TabGroupInfo`'dan ayrı tutmalı (engine-only grup alanları ileride eklenebilsin)

## Olsa iyi olur
- [ ] Grup adını yeniden adlandırma mutasyonunu desteklemeli
- [ ] Bir grubu bütün olarak taşımayı (üye blokunun bütünlüğü korunarak) desteklemeli
- [ ] Sekme başka bir gruba taşındığında bitişiklik değişmezini yeniden kurabilmeli
- [ ] `createTab` çağrısında arka planda açma (background) seçeneğini onurlandırmalı
- [ ] `createTab` çağrısında hedef grup adını (groupName) çözüp yoksa oluşturabilmeli
- [ ] Bilinmeyen id ile `get`/`delete`/`activate` çağrılarında öngörülebilir / no-op davranış göstermeli
- [ ] Tüm web sekmelerinin tek `persist:tepegoz-web` oturumunu paylaştığı varsayımını bozmamalı
- [ ] `TabGroupColor` değerlerini `TAB_GROUP_COLORS` paletiyle sınırlamalı
- [ ] Grup çökmüş (collapsed) durumu gibi görünüm meta verisini projeksiyonda taşıyabilmeli
- [ ] `tab_update_item` ile başlık / url / grup / pin gibi alanların güncellenmesini kapsamalı
- [ ] Aynı grup adının tekrar kullanımında yeni grup mu mevcut grup mu kararını netleştirmeli

## Çok niş
- [ ] Çok sayıda sekme altında `normalize()` maliyetini yapısal mutasyon başına sınırlı tutabilmeli
- [ ] Pinli sekme sayısı toplam sekme sayısına eşitken sıralama değişmezini koruyabilmeli
- [ ] Tek üyeli grup son üyesi kaldırıldığında grubu anında budayabilmeli
- [ ] Grup içindeki bir sekmeyi pinlerken hem grup blokunu hem pin blokunu aynı geçişte onarabilmeli
- [ ] `internal` sekmelerin `tab_create_item` üzerinden oluşturulmasında `tepegoz://` url'lerini kabul edebilmeli
- [ ] Wire `TabGroupInfo` şekli değişse bile `TabStore` grup mantığının etkilenmemesini sağlamalı
- [ ] Silinmiş id'lerin yeniden kullanımından doğacak karışıklığı önlemeli
- [ ] `TabHost` uygulaması bağlanmadan `registerTabTools` çağrılırsa net bir hata verebilmeli
