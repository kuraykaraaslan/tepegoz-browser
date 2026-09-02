# Research — Grammarly ve yazım-asistanı kategorisi

> **Ne bu?** Tepegöz'ün `ext-typo`'su için yapılan **kategori araştırması**: Grammarly'nin kullanıcı
> şikâyetleri, gizlilik ve etik krizleri. Kod okunmadı.
>
> **Durum:** kapalı kaynak · SaaS + uzantı · abonelik.
> **Tarih.** Derleme 2026-08-21 · bu formata çevirisi 2026-09-02. **Dil notu.** Türkçe.
> **Sonuç:** karşılığı **sevk edildi** — `extensions/ext-typo`, sözlükleri profilde tutan **yerel-önce**
> analiz; raporun "metniniz nereye gidiyor" endişesinin yapısal cevabı.

---

## Şikâyet kümeleri

**Gizlilik ve kurumsal yasaklar.** Kategorinin tanımlayıcı sorunu: asistan çalışmak için **kullanıcının
yazdığı her şeyi sunucuya gönderiyor**. Sonuç, birçok kurumda doğrudan yasaklanması. Bu, bir özellik
şikâyeti değil, mimarinin kendisine yönelik bir itiraz.

**Finansal sürtünme ve karanlık desenler.** Abonelik iptalinin zorlaştırılması, belirsiz fiyatlandırma.

**AI etiği ve "Expert Review" krizi.** İnsan incelemesi olarak pazarlanan hizmetin gerçekte ne olduğuna
dair hukuki tartışma; ayrıca **akademik dürüstlük** tarafında intihal denetiminin ve AI-üretimi metin
tespitinin güvenilmezliği.

**Yaratıcı sesin kaybı.** Aracın önerilerinin metni tektipleştirmesi, kurgusal/yaratıcı metinlerde
kısıtlayıcı olması — kullanıcıların "artık benim gibi yazmıyor" şikâyeti.

**Teknik.** Çökmeler, editör entegrasyonu uyumsuzlukları, performans.

## Alınacaklar / Alınmayacaklar

**Alınacak:**

- **Yerel-önce analiz — kategorinin tek yapısal cevabı.** `ext-typo` sözlükleri profilde tutuyor ve
  metni ağa göndermeden çalışıyor. Raporun en ağır şikâyeti (gizlilik + kurumsal yasak) burada bir
  mimari kararla düşüyor. **Sevk edildi.**
- **Öneri, dayatma değil.** "Yaratıcı sesin kaybı" şikâyeti, otomatik uygulayan bir asistanın maliyeti.
  Buradaki karşılık: düzeltme önerilir, uygulanmaz — aynı disiplin ajan tarafında `clarify` ve plan
  onayında da geçerli.
- **Metnin nereye gittiği görünür olmalı.** Yerel çalışan bir yol varsa, bulut yolunun **ne zaman**
  devreye girdiği kullanıcıya söylenmeli. Faz 8'in Sovereign/Air-Gapped modu ve Trust Mesh'i bu ayrımın
  sahibi.
- **Türkçe birinci sınıf.** Kategorinin İngilizce-merkezliliği, TR kullanıcıları için kalite düşüşü
  demek; burada `ext-typo`'nun sözlük modeli buna göre kuruldu.

**Alınmayacak:**

- **Abonelik karanlık desenleri** — iptal sürtünmesi, belirsiz fiyat. Faz 3'ün abonelik tasarımına
  **karşı örnek** olarak kaydedilsin.
- **"AI tespit" / intihal skoru.** Rapor bu skorların güvenilmezliğini ve yarattığı akademik mağduriyeti
  belgeliyor; ürün kapsamı dışı ve doğruluğu savunulamaz.
- **Sunucuya-gönder mimarisi.**

## Kaynaklar

Grammarly resmî sayfaları ve destek forumları, Reddit, Trustpilot/uygulama mağazası değerlendirmeleri,
"Expert Review" tartışmasına ilişkin basın ve hukuki kaynaklar, akademik dürüstlük tartışmaları.
