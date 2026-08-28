# nav-toolbar — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Başlık satırının altına oturan sunumsal (presentational) navigasyon çubuğu: geri/ileri/yeniden-yükle/ana-sayfa butonları, omnibox adres çubuğu, opsiyonel yer imi yıldızı, host'un verdiği `actions` slot'u ve trailing kenardaki ana menü kontrolü — her eylem callback ile enjekte, kendi metni yok.

## Kesinlikle olmalı
- [ ] `@tepegoz/browser-chrome` başlık satırının altına oturan navigasyon çubuğu satırını render etmeli (NavToolbar)
- [ ] Geri / ileri / yeniden yükle / ana sayfa butonlarını göstermeli
- [ ] Adres çubuğunu `@tepegoz/omnibox` (Omnibox) ile kompoze etmeli
- [ ] canGoBack / canGoForward'a göre geri/ileri butonlarının etkinliğini yansıtmalı
- [ ] Her eylemi callback ile enjekte almalı (onBack/onForward/onReload/onHome/onNavigate) — köprü-agnostik kalmalı
- [ ] Ana menü kontrolünü host'un verdiği `menu` ReactNode olarak trailing kenarda render etmeli
- [ ] Host tarafından sağlanan `actions` slot'unu (ör. sabitlenmiş eklenti ikonları) render etmeli
- [ ] Opsiyonel yer imi (bookmark) yıldızını yalnızca onToggleBookmark verildiğinde göstermeli
- [ ] Kendi metinlerini içermemeli — tüm aria-label'ları `labels` (NavToolbarLabels) ile enjekte almalı
- [ ] NavToolbarLabels: back / forward / reload / home + opsiyonel bookmarkAdd/bookmarkRemove yerelleştirilmiş etiketlerini kabul etmeli
- [ ] omniboxPlaceholder ve currentUrl prop'larını Omnibox'a geçirmeli
- [ ] Omnibox girdisini onNavigate(input) callback'i ile host'a iletmeli
- [ ] NAV_BTN: 32px araç çubuğu ikon butonu için paylaşılan Tailwind sınıf string'ini dışa vermeli
- [ ] NavToolbarProps ile tam enjekte-props kontratını dışa vermeli
- [ ] Sunumsal leaf olarak desktop app'e geri import yapmamalı

## Olsa iyi olur
- [ ] NAV_BTN'i dışa vererek host'un eşleşen kontrolleri (sabit eklenti ikonları) aynı biçimde stillemesine izin vermeli
- [ ] bookmarkAdd/bookmarkRemove etiketiyle yıldızın durum-bağlı aria-label'ını değiştirebilmeli
- [ ] actions slot'u boşken düzeni bozmamalı
- [ ] menu verilmediğinde de çubuğu render edebilmeli (savunmacı)
- [ ] Home butonu onHome ile yapılandırılmış herhangi bir ana sayfa URL'ine gidebilmeli

## Çok niş
- [ ] Çok sayıda pinned eklenti ikonu `actions` slot'una geldiğinde taşma zarifçe ele alınmalı
- [ ] currentUrl `tepegoz://` iç sayfa iken de Omnibox'ta düzgün gösterilmeli
- [ ] RTL yerelde geri/ileri butonlarının yönü doğru olmalı
- [ ] onToggleBookmark verilmeyen bir host'ta yıldız için hiç DOM üretilmemeli
