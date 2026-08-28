# tab-strip — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Chrome başlık satırındaki yatay sekme şeridi: favicon'lu tab chip'leri, wheel→yatay kaydırma, container-query ile daralma, renkli grup blokları, dnd-kit sürükle-sırala; tüm mutasyonlar callback ile enjekte edilir ve paketin kendi string'i yoktur.

## Kesinlikle olmalı
- [ ] Yatay tab strip'ini chrome başlık satırında render edebilmeli
- [ ] `tabs` dizisini favicon'lu tab chip'leri olarak render edebilmeli
- [ ] Favicon yüklenemediğinde fallback göstermeli (favicon-with-fallback)
- [ ] Fare tekerleği (wheel) delta'larını yatay kaydırmaya çevirmeli
- [ ] Başlık ve kapat afordanslarını container query ile daralan alanda toplayabilmeli
- [ ] Tab gruplarını renkli, bitişik bloklar (contiguous runs) olarak render edebilmeli
- [ ] `TabGroupDescriptor` grubunu üyelerini saran renkli bir konteyner olarak çizmeli
- [ ] dnd-kit ile tekil sekme sürükle-bırak yeniden sıralamayı desteklemeli
- [ ] dnd-kit ile bütün grubu sürükle-bırak yeniden sıralamayı desteklemeli
- [ ] Sürükleme sırasında bir drag overlay göstermeli
- [ ] Seçim (select), kapatma (close), context-menu ve yeni sekme (new) eylemlerini enjekte edilen callback'lerle bağlamalı
- [ ] Taşıma/gruplama mutasyonlarını (`onMove` vb.) yalnızca niyet olarak raporlamalı, kendi state'inde uygulamamalı
- [ ] Grup çökmesi (collapse), yeniden adlandırma ve atama (assign) eylemlerini işleyebilmeli
- [ ] Grup adı için satır içi (inline) düzenlemeyi desteklemeli
- [ ] `activeId` ile aktif sekmeyi görsel olarak işaretlemeli
- [ ] `TabDescriptor` minimal şeklini render edebilmeli (`id`, `title`, `faviconUrl`, `isLoading`, opsiyonel `pinned`/`groupId`)
- [ ] `isLoading` sekmeleri için yükleniyor göstergesi sunmalı
- [ ] `pinned` sekmeleri görsel olarak ayırt edebilmeli
- [ ] Tüm kullanıcıya görünür metinleri `TabStripLabels` üzerinden dışarıdan almalı (kendi string'i olmamalı)
- [ ] `TabStripLabels` ile `tablist`, `untitled`, `closeTab`, `newTab` etiketlerini kullanmalı
- [ ] Başlıksız sekme için `untitled` fallback string'ini kullanmalı
- [ ] Electron bridge'e bağımlılığı olmamalı (yalnızca enjekte edilen prop'lar)
- [ ] `TabStripProps` ile tam enjekte-prop kontratını dışa vermeli
- [ ] Host'ların kendi zengin tab nesnelerini geçebilmesine yapısal olarak izin vermeli

## Olsa iyi olur
- [ ] `unnamedGroup` / `toggleGroup` opsiyonel etiketlerini varsa kullanmalı
- [ ] Grup üye blokundan bir sekmeyi dışarı sürüklemeyi niyet olarak raporlamalı
- [ ] Sekmeyi bir gruba sürükleyip bırakmayı `assign` niyeti olarak raporlamalı
- [ ] `tablist` rolü ve aria-label ile erişilebilir bir sekme listesi sunmalı
- [ ] Aktif sekmeyi görünür alana kaydırmayı (scroll into view) destekleyebilmeli
- [ ] Çökmüş grubu tek bir özet chip olarak gösterebilmeli
- [ ] Sürükleme iptal edildiğinde sıralamayı görsel olarak eski haline döndürmeli
- [ ] Grup rengini `TabGroupDescriptor.color` alanından almalı
- [ ] Çok dar alanda yeni-sekme düğmesini görünür tutmalı
- [ ] Klavye ile sekme seçimi/kapatması için erişilebilir etkileşim sunabilmeli
- [ ] Orta tık ile sekme kapatmayı `onClose` niyetine bağlayabilmeli

## Çok niş
- [ ] Yüzlerce sekmede yatay kaydırma ve chip render'ını akıcı tutabilmeli
- [ ] RTL yerleşimde wheel→yatay kaydırma yönünü doğru çevirmeli
- [ ] Sürükleme sırasında grup sınırlarını geçerken overlay'i doğru konumlamalı
- [ ] Satır içi grup adı düzenlemesi sırasında sürükleme/kısayolları bastırabilmeli
- [ ] `groupId` işaret ettiği grup `groups` içinde yoksa sekmeyi gruplanmamış render etmeli
- [ ] Container query desteklenmeyen ortamda makul bir daralma fallback'i sunmalı
- [ ] Trackpad'in yatay eksen delta'sını çift kaydırmaya yol açmadan ele almalı
