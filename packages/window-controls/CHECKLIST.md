# window-controls — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Salt sunum leaf'i: frameless pencere için native tarzı caption düğmeleri (minimize / maximize·restore / close), chrome başlık satırının sonunda render edilir. Kendi state'i yoktur; maximized bayrağı ve tüm eylemler enjekte edilir; React ve FontAwesome dışında bağımlılığı yoktur.

## Kesinlikle olmalı
- [ ] Üç caption düğmesini (minimize / maximize·restore / close) render edebilmeli
- [ ] `WindowControls`'u frameless pencere için chrome başlık satırının sonunda render etmeli
- [ ] `isMaximized` değerine göre maximize/restore ikonunu değiştirmeli
- [ ] `isMaximized` değerine göre maximize/restore aria-label'ını değiştirmeli
- [ ] Minimize, toggle-maximize ve close eylemlerini enjekte edilen callback'lerle bağlamalı
- [ ] Kendi state'ini tutmamalı — maximized bayrağı ve tüm eylemler dışarıdan enjekte edilmeli
- [ ] `WindowControlsLabels` ile `minimize`, `maximize`, `restore`, `close` aria-label'larını almalı
- [ ] `WindowControlsProps` ile tam enjekte-prop kontratını dışa vermeli
- [ ] Electron bridge'e bağımlılığı olmamalı
- [ ] React ve FontAwesome dışında bağımlılık taşımamalı

## Olsa iyi olur
- [ ] Caption düğmelerini native pencere kontrollerine benzer görünümde sunmalı
- [ ] Her düğme için erişilebilir bir aria-label sağlamalı (etiketler `WindowControlsLabels`'tan)
- [ ] Klavye ile odaklanılabilir ve tetiklenebilir düğmeler sunmalı
- [ ] Close düğmesini hover/focus'ta görsel olarak vurgulayabilmeli
- [ ] Pencerenin maksimize durumundaki aboneliği host'un kendi `useWindowMaximized` hook'una bırakmalı
- [ ] Düğme boyutlarını başlık satırı yüksekliğine uyumlu tutmalı

## Çok niş
- [ ] Platforma göre düğme sırası/hizası farkını (ör. sol/sağ) prop üzerinden karşılayabilmeli
- [ ] RTL yerleşimde düğme grubunun başlık satırındaki konumunu doğru yerleştirmeli
- [ ] `isMaximized` prop'u güncellenmeden gelen hızlı toggle'larda ikon/label tutarsızlığına düşmemeli
- [ ] Yüksek kontrast / tema modunda ikonların görünür kalmasını sağlamalı
- [ ] FontAwesome ikonu yüklenemezse düğme yine de tıklanabilir ve etiketli kalmalı
