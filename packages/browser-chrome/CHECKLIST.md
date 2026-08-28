# browser-chrome — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Sunum amaçlı yaprak: frameless pencerenin tüm chrome çerçevesi — sürüklenebilir başlık satırı (marka + `tab-strip` + `window-controls`) ve navigasyon satırı (`nav-toolbar` → `omnibox`) kompozisyonu; tüm `window.tepegoz` eylemleri prop olarak enjekte edilir, string sahiplenmez.

## Kesinlikle olmalı
- [ ] Frameless pencerenin tüm chrome çerçevesini (başlık satırı + navigasyon satırı) render etmeli
- [ ] Sürüklenebilir başlık satırında marka işareti + `@tepegoz/tab-strip` + `@tepegoz/window-controls`'ü kompoze etmeli
- [ ] Navigasyon satırında `@tepegoz/nav-toolbar`'ı (dolayısıyla `@tepegoz/omnibox`) kompoze etmeli
- [ ] Tüm `window.tepegoz` eylemlerini prop olarak enjekte almalı, kendisi çağırmamalı
- [ ] `isMaximized` bayrağını prop olarak almalı ve maximize/restore görünümünü buna göre vermeli
- [ ] `onMinimize` / `onToggleMaximize` / `onClose`'u `WindowControls`'e bağlamalı
- [ ] Tab seçme / kapatma / yeni tab / tab context menu prop'larını `TabStrip`'e geçirmeli
- [ ] Tab grupları prop'larını `TabStrip`'e geçirmeli
- [ ] Navigasyon prop'larını (`canGoBack` / `canGoForward` / `onBack` / `onForward` / `onReload` / `onHome` / `onNavigate` / `currentUrl`) `NavToolbar`'a geçirmeli
- [ ] String sahiplenmemeli — tek bir kompoze `BrowserChromeStrings` (`common` / `window` / `browser`) nesnesi almalı
- [ ] Toolbar'ın `actions` slot'unu host'un doldurması için açmalı (ör. `ExtensionTray`)
- [ ] Caption butonlarının yanında opsiyonel `captionLeading` slot'u sunmalı (ör. bildirim zili)
- [ ] Bookmark yıldızı prop'larını chrome içinde bağlamalı
- [ ] `BrowserChrome`, `BrowserChromeStrings`, `BrowserChromeProps`'u dışa aktarmalı
- [ ] `BrowserChromeStrings` `common.appName`, `window.{minimize,maximize,restore,close}` ve `browser` slice'ını kapsamalı

## Olsa iyi olur
- [ ] Menü (hamburger) düğmesini `menu` prop'u üzerinden yerleştirebilmeli
- [ ] Başlık satırının sürükleme bölgesini pencere taşıma için doğru işaretlemeli
- [ ] `captionLeading` verilmediğinde caption düzenini bozmadan render etmeli
- [ ] `BrowserChromeProps` tüm slot prop'larını (`toolbarActions`, `menu`, `captionLeading`) tipli taşımalı
- [ ] Kendi i18n sözlüğü tutmadığından host'un `useT(coreDict)` + `browserDict` birleşimini kabul etmeli
- [ ] `pnpm typecheck` · `pnpm lint` · `pnpm test` betiklerini sağlamalı

## Çok niş
- [ ] `toolbarActions` slot'u boş olduğunda navigasyon satırı hizasını korumalı
- [ ] Çok sayıda sekmede başlık satırı taşmadan tab-strip'e kaydırma alanı bırakmalı
- [ ] `isMaximized` iken pencere kenar boşluklarını (maximize snap) doğru ayarlamalı
- [ ] Platforma göre caption butonlarının konumunu (sol/sağ) host kararına bırakmalı
- [ ] Eksik bir `browser` string slice alanında görünür bir fallback göstermeli
