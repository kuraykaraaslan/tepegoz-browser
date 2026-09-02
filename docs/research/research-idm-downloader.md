# Research — Internet Download Manager (IDM)

> **Ne bu?** Bir **tarayıcı rakibi değil** — tek bir özelliğin (indirme yöneticisi) uzun süredir pazar
> lideri olan kapalı kaynak ürününün kullanıcı şikâyeti derlemesi. Kod okunmadı. Türkiye pazarı
> özellikle temsil edildiği için (Şikayetvar kaynaklı) burada ayrıca değerli.
>
> **Durum:** kapalı kaynak · ücretli lisans · Windows.
> **Tarih.** Derleme 2026-08-21 · bu formata çevirisi 2026-09-02. **Dil notu.** Türkçe.

---

## Ne

IDM'in teknik çekirdeği **segmentli indirme**: dosyayı parçalara bölüp çoklu bağlantıyla paralel çekmek,
kesintide kaldığı yerden devam etmek, ve tarayıcıya eklenti ile bağlanıp indirmeyi devralmak. Tepegöz'ün
`@tepegoz/downloads` katmanı için ilgi çekici olan tam olarak bu çekirdek; ürünün geri kalanı (lisans,
kurulum, destek) buranın konusu değil.

## Şikâyet kategorileri

| Kategori                   | Öz                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Lisans / etkinleştirme** | Türkiye'de Şikayetvar'daki en yoğun küme: ödeme sonrası seri gelmemesi, "ömür boyu lisans" tanımının belirsizliği      |
| **Tarayıcı entegrasyonu**  | En güçlü yönü, aynı zamanda en kırılgan yeri — eklenti mağaza politikalarıyla sürekli çatışıyor, sürüm uyumu bozuluyor |
| Hatalar                    | Windows 11 uyumu, `explorer.exe` çökmesi, belleğe takılma                                                              |
| Arayüz / UX                | "Eski ve karışık" — işlevsellik yüksek, sunum eski                                                                     |
| Performans                 | Hız beklentiyi karşılamıyor; **çoklu bağlantı limitleri sabit**                                                        |
| Güvenlik algısı            | Antivirüs yanlış-pozitifleri; imzalama eksikliği                                                                       |
| Güncelleme / destek        | Yeni sürüm yeni sorun getiriyor; destek yetersiz                                                                       |

## Alınacaklar / Alınmayacaklar

**Alınacak** — hepsi [phase-2c](../../phases/product/phase-2c-classic-browser-essentials.md)'nin
`### L10 — Download acceleration (rival evidence: IDM)` bölümüne indi:

- **Segmentli indirme motoru** — dosyayı parçalara böl, paralel çek, birleştir.
- **Dinamik bağlantı sayısı.** IDM'in performans şikâyetinin kökü sabit limit; bağlantı sayısı sunucu
  davranışına göre **uyarlanmalı**, kullanıcı tarafından elle ayarlanan bir sabit olmamalı.
- **Dayanıklı devam (resume).** Kesinti sonrası kaldığı yerden — bu, indirme yöneticisinin var olma
  sebebi.
- **Hız / kalan süre göstergesi ve transfer aktivitesi** — burada zaten sevk edildi (birleşik
  indirme/yükleme aktivite açılır menüsü).
- **Ders: tarayıcı entegrasyonu bir eklentiyse kırılgandır.** IDM'in en güçlü özelliği, tarayıcı eklenti
  politikaları değiştikçe düzenli olarak bozuluyor. Tepegöz'de indirme **tarayıcının kendi parçası**
  (`will-download` ele geçirme + karantina + `SafeBrowsingService`), yani bu kırılganlık yapısal olarak
  yok. Bu, "neden ayrı bir tarayıcı" sorusunun küçük ama somut bir cevabı.

**Alınmayacak:**

- **Lisans/etkinleştirme modeli.** Şikâyetlerin en yoğun kümesi ve tamamen ticari; Tepegöz'ün karşılığı
  Faz 3'ün yönetilen aboneliği.
- **Ayrı bir masaüstü uygulaması + tarayıcı eklentisi mimarisi.** Kırılganlığın kaynağı bu ayrım.

## Kaynaklar

IDM resmî sitesi, bilgi tabanı ve destek forumları; Reddit ve Windows forumları; Türkiye'den
Şikayetvar kayıtları (son beş yıl).
