# newtab-ui — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Sunumsal `tepegoz://newtab` başlangıç sayfası — AI / Favoriler / Boş şeklinde 3 seçenekli chooser (Phase 1a L9); kendi i18n sözlüğüne sahip leaf paket, tüm veri ve yan etkiler props ile enjekte.

## Kesinlikle olmalı
- [ ] `tepegoz://newtab` başlangıç sayfasını render etmeli
- [ ] AI / Favoriler / Boş şeklinde 3 seçenekli bir chooser sunmalı
- [ ] Üç seçeneği segmented (bölümlü) bir seçici olarak göstermeli
- [ ] Favoriler'i varsayılan görünüm olarak açmalı
- [ ] Favoriler görünümünde kayıtlı sayfaların bir ızgarasını (grid) göstermeli
- [ ] Favori listesini listFavorites() prop'u ile enjekte almalı (kendi veri erişimi yok)
- [ ] Bir favoriye tıklandığında onOpenFavorite(url) ile mevcut sekmeyi yönlendirmeli
- [ ] "AI" seçeneğinde onOpenAgent() ile Agent Console'u açmalı
- [ ] "Boş" seçeneğinde temiz bir başlangıç göstermeli
- [ ] Kendi i18n sözlüğüne sahip olmalı (./i18n), en kaynak + tr paritesi
- [ ] Desktop app'e geri import yapmamalı (leaf paket)
- [ ] Tüm veri ve yan etkileri yalnızca props üzerinden almalı

## Olsa iyi olur
- [ ] Favori yokken Favoriler görünümünde anlamlı bir boş durum göstermeli
- [ ] Aktif sekme `tepegoz://newtab` adreslediğinde apps/desktop App.tsx tarafından render edilebilir olmalı
- [ ] Ctrl+T / yeni-sekme butonu / açılışta gelen boş sekme buraya inmeli
- [ ] Seçili chooser seçeneğini görsel olarak belirgin göstermeli
- [ ] tr çevirilerinin en anahtar kümesiyle tam parite içinde olması

## Çok niş
- [ ] Çok sayıda favori olduğunda grid'in düzeni kayması olmadan taşması
- [ ] listFavorites() gecikmeli/boş döndüğünde arayüz çökmeden beklemeli
- [ ] onOpenAgent chrome'un agent sidebar'ını toggle etmesiyle uyumlu çalışmalı
- [ ] RTL yerelde segmented chooser'ın sırası doğru olmalı
