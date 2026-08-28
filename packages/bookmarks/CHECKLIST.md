# bookmarks — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Bookmarks özellik modülü (L1): enjekte edilen `Db` üzerinde çalışan `BookmarkStore` (URL'de idempotent CRUD/arama), `isBookmarkable(url)` scheme allow-list'i ve IPC ile paylaşılan `BookmarkEntry` şekli; saf ve app-free.

## Kesinlikle olmalı
- [ ] `BookmarkStore` `bookmarks` tablosu üzerinde CRUD sağlamalı
- [ ] Bookmark arama (search) yeteneği sunmalı
- [ ] Ekleme işlemi URL üzerinde idempotent olmalı (aynı URL iki kez eklenince tekrar oluşturmamalı)
- [ ] Store enjekte edilen bir `Db` üzerinde çalışmalı, kendi bağlantısını açmamalı
- [ ] Tablo şemasını kendi içinde tanımlamamalı (şema `@tepegoz/persistence` migration'larında)
- [ ] `isBookmarkable(url)` saf bir fonksiyon olarak scheme allow-list kararını vermeli
- [ ] `http(s)`, `file://` ve `tepegoz://` iç sayfalarını bookmarklanabilir saymalı
- [ ] `javascript:` / `data:` / `blob:` / `chrome:` / `about:` şemalarını reddetmeli
- [ ] `isBookmarkable` `@tepegoz/navigation`'ın `isWebUrl`'ünden daha geniş olmalı
- [ ] `BookmarkEntry` satır/DTO şeklini IPC sözleşmesiyle paylaşılabilir biçimde dışa aktarmalı
- [ ] Paket saf ve app-free olmalı (native modül çekmemeli)
- [ ] Sandbox'lı renderer'dan güvenle import edilebilmeli
- [ ] `isBookmarkable` hem renderer'da (yıldız gösterimi) hem ana süreç IPC guard'ında aynı kararı vermeli

## Olsa iyi olur
- [ ] CRUD dışında toplu okuma/listeleme sağlamalı
- [ ] `BookmarkEntry` alanları (url, title vb.) IPC ile birebir eşleşmeli
- [ ] Store metodları `Db` dışında hiçbir global duruma dokunmamalı
- [ ] Geçersiz URL ile ekleme denendiğinde `isBookmarkable` ile önden elenebilmeli
- [ ] `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` betiklerini sağlamalı

## Çok niş
- [ ] URL normalizasyonu idempotency'yi bozmadan (ör. fragment / trailing slash) tutarlı olmalı
- [ ] `file://` yolu Windows ve POSIX ayrımında da bookmarklanabilir sayılmalı
- [ ] `tepegoz://` bilinmeyen bir alt sayfa olsa bile şema bazında kabul edilmeli
- [ ] Aynı URL farklı başlıkla tekrar eklenince yeni satır açmadan mevcut kaydı ele almalı
- [ ] Boş / whitespace URL girişinde net biçimde reddetmeli
