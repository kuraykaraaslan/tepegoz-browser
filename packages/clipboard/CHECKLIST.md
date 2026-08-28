# clipboard — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Clipboard işlem metadata'sını ve onay varsayılanlarını merkezileştiren, clipboard içeriğini kalıcı state / log / Event Journal payload'larından uzak tutan headless policy/tip paketi.

## Kesinlikle olmalı
- [ ] Paket headless olmalı — yalnızca clipboard policy ve tipleri sağlamalı
- [ ] Clipboard işlem metadata'sını tek yerde merkezileştirmeli
- [ ] İşlem başına onay (approval) varsayılanlarını tanımlamalı
- [ ] Clipboard içeriği kalıcı state'e asla yazılmamalı
- [ ] Clipboard içeriği loglara asla girmemeli
- [ ] Clipboard içeriği Event Journal payload'larına asla girmemeli
- [ ] Her clipboard işlem türü için tanımlı metadata bulunmalı
- [ ] Onay varsayılanları policy katmanınca okunabilir biçimde açığa çıkmalı
- [ ] Tipler diğer paketlerce içe aktarılabilir olmalı (tek şema kaynağı)
- [ ] Agent kaynaklı clipboard işlemleri onay akışından geçmeli
- [ ] Gerçek clipboard okuma/yazma bu pakette değil host'ta kalmalı

## Olsa iyi olur
- [ ] Bilinmeyen / yeni bir clipboard işlemi için güvenli (kısıtlayıcı) varsayılan onay uygulanmalı
- [ ] İşlem metadata'sı kullanıcıya gösterilecek açıklama/etiket içermeli
- [ ] Policy kararı "izin ver / sor / reddet" ayrımını desteklemeli
- [ ] Okuma ve yazma işlemleri farklı risk seviyelerinde ele alınmalı
- [ ] İşlem metadata'sı yerelleştirilebilir string anahtarlarıyla eşleşmeli
- [ ] Metadata seti genişletilebilir olmalı (yeni işlem türü eklemek tek nokta)

## Çok niş
- [ ] Payload'a yanlışlıkla içerik koyan bir çağrı tip düzeyinde engellenebilmeli (içerik alanı hiç bulunmamalı)
- [ ] Büyük clipboard verisi metadata'da yalnızca boyut olarak temsil edilse bile ham içerik tutulmamalı
- [ ] Host bir işlem için varsayılan onayı override edebilmeli
- [ ] İkili (resim) clipboard içeriği de aynı gizlilik garantisine tabi olmalı
- [ ] Test ortamında policy varsayılanları deterministik olmalı
