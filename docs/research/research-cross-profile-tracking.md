# Research — çapraz-profil izleme: engel neden gizli sekmede de sürüyor

> **Ne bu?** Somut bir vakadan yürüyen alan araştırması: bir platform engelinin **gizli sekmede ve
> farklı profilde bile** neden devam ettiği. Değeri, teorik parmak izi tartışmasını **gözlemlenmiş bir
> tespit zincirine** bağlaması.
>
> **Tarih.** Derleme 2026-08-21 · bu formata çevirisi 2026-09-02. **Dil notu.** Türkçe.
> **Sahibi fazlar:** [phase-2](../../phases/product/phase-2-adapters-safe-browsing.md) ·
> [phase-2c](../../phases/product/phase-2c-classic-browser-essentials.md) (özel/tek-kullanımlık mod) ·
> [phase-5](../../phases/product/phase-5-vpn-network-privacy.md) (tünelin vaadinin sınırı).

---

## Ne söylüyor

Platformun **açıkça belgelediği** sinyaller (hesap bağları, cihaz tanımlayıcıları) ile **muhtemel tespit
zinciri** ayrı ayrı ele alınıyor; ardından kontrollü bir deney tasarımı ve meşru azaltımlar + ödünleşimler
veriliyor. Çekirdek bulgu: profil/gizli-sekme ayrımı **çerezleri** ayırır, ama IP, cihaz sınıfı, parmak
izi ve davranışsal sinyaller ayrılmaz — dolayısıyla bağ kurulabilir.

## Alınacaklar / Alınmayacaklar

**Alınacak:**

- **Kendi kendine yaptığımız parmak izi — bu belgenin en özgün katkısı.** Tepegöz'ün **kendi enjekte
  ettiği dokuz eklenti** ölçülebilir entropi üretiyor; yani ürün, korumaya çalıştığı şeyi kendi eliyle
  zayıflatabilir. Faz 2'de bir blok olarak duruyor ve **ölçülmesi** gereken bir iddia.
- **"Profil ayırmak izlenmemeyi sağlamaz" dürüstlüğü.** Faz 2c'nin özel/tek-kullanımlık mod metni ve
  [multi-profile-isolation](../tracks/multi-profile-isolation.md) track'i bu sınırı yazmak zorunda —
  aksi hâlde ürün, veremeyeceği bir söz vermiş olur.
- **Taşıma katmanı kendi kimliğini taşır.** Çıkış IP'sini değiştirmek **TLS parmak izini** (JA3/JA4
  sınıfı), başlık sırasını ve istek ritmini değiştirmiyor — üçü de anti-bot sistemlerinin standart
  girdisi ve bu fazın kurduğu her tünelden **sağ çıkıyor**. Faz 5 L10'da bir satır olarak duruyor.
- **Kontrollü deney tasarımı** — iddiayı ölçmenin yolu; Faz 2'nin ölçüm kapısıyla aynı disiplin.

**Alınmayacak:**

- Platformun tespit zincirini **atlatmayı** hedefleyen teknikler. Bu belge bir savunma analizi; amaç
  kullanıcıya ne sözü verebileceğimizi bilmek, kaçınma aracı yazmak değil.

## Kaynaklar

Platformun kendi yardım/şeffaflık dokümantasyonu, bağımsız güvenlik araştırmaları, ve deney kayıtları.
