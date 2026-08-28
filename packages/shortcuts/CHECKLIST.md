# shortcuts — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Klavye kısayollarının tanımlandığı tek yer — spec listesi, tam modifier eşleşmesi, çakışma tespiti ve platforma göre biçimlendirme.

## Kesinlikle olmalı

- [ ] `SHORTCUTS` eksiksiz `readonly ShortcutSpec[]` olarak export edilmeli.
- [ ] Bir kısayolun var olması yalnızca `SHORTCUTS`'a girdi eklemekle mümkün olmalı; başka hiçbir yer global tuş bind etmemeli.
- [ ] Her `ShortcutSpec` kararlı bir `id` taşımalı (aynı zamanda açıklamasının i18n anahtarı).
- [ ] Her `ShortcutSpec` bir `scope` taşımalı: `'main'` veya `'renderer'`.
- [ ] `'main'` scope'lu tuşlar, bir web sayfası odaktayken bile yakalanmalı (chrome onları görmez).
- [ ] `'renderer'` scope'lu tuşları chrome ele almalı.
- [ ] `matchesShortcut(spec, press)` modifier'ları TAM eşleştirmeli — var/yok her ikisi de kontrol edilmeli.
- [ ] Alt opt-in olmalı ve yokluğunda kontrol edilmeli; sadece `Ctrl` kısayolu `Ctrl+Alt+<key>` için tetiklenmemeli.
- [ ] `Ctrl+Alt+T` gibi OS/AltGr ile çakışan kombinasyonlar yanlışlıkla tetiklenmemeli.
- [ ] `shortcutFor(press, scope)` bir tuş basışının tetiklediği `ShortcutId`'yi scope'a göre filtreleyerek döndürmeli.
- [ ] `pressFromEvent` bir DOM `KeyboardEvent`'i normalize `KeyPress` şekline indirgemeli.
- [ ] `pressFromInput` bir Electron `Input`'unu aynı normalize `KeyPress` şekline indirgemeli.
- [ ] Her iki taraf (main/renderer) aynı `KeyPress` şeklini paylaşmalı.
- [ ] `formatShortcut(spec, platform)` kısayolu platformun yazdığı biçimde render etmeli (macOS'ta `⌘⇧K`, diğerlerinde `Ctrl+Shift+K`).
- [ ] Paketin hiçbir bağımlılığı olmamalı.
- [ ] Tüm fonksiyonlar saf (pure) olmalı.
- [ ] Modül birim testli olmalı.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` script'leri çalışır olmalı.

## Olsa iyi olur

- [ ] İki `ShortcutSpec`'in aynı tuş kombinasyonu + scope'u paylaştığı çakışmalar tespit edilip raporlanabilmeli.
- [ ] Tüm kısayolların bir yardım yüzeyi için listelenebilmesi (id + açıklama + biçimlendirilmiş tuş).
- [ ] AltGr düzenlerinde `@ # $ € ₺` gibi karakterlerin kısayol olarak yorumlanmadığından emin olunmalı (Türkçe-Q klavye).
- [ ] `formatShortcut` Türkçe dahil yerelleştirilmiş modifier adları üretebilmeli.
- [ ] Kısayollar kategoriye göre gruplanabilmeli (sekme, gezinme, düzenleme…).
- [ ] Bir `ShortcutSpec`'in aktif olup olmadığını (koşullu etkinlik) ifade edebilmeli.
- [ ] `KeyPress` normalizasyonu tuş kodu (`KeyK`) ile üretilen karakteri (`k`) tutarlı biçimde ele almalı.
- [ ] Numpad tuşları ile ana tuş sırası ayırt edilebilmeli.

## Çok niş

- [ ] macOS'ta `Cmd` ile diğer platformlarda `Ctrl` eşlemesi tek spec'ten türetilebilmeli.
- [ ] Dead key / composition sırasında gelen `KeyboardEvent`'ler kısayol tetiklememeli.
- [ ] `Meta` tuşunun Linux/Windows'taki farklı anlamları güvenli biçimde ele alınmalı.
- [ ] Aynı fiziksel tuşun farklı klavye düzenlerinde farklı `key` değeri üretmesi durumunda `code` temelli eşleşme seçeneği.
- [ ] Çok tuşlu (chord) kısayol ihtiyacı için spec modeli genişletilebilir olmalı.
- [ ] `formatShortcut` çıktısı ekran okuyucular için sözel bir alternatif de üretebilmeli.
- [ ] Kısayol listesi kullanıcı override'larıyla birleştirilebilecek şekilde salt-okunur çekirdek + katman modeline uygun olmalı.
