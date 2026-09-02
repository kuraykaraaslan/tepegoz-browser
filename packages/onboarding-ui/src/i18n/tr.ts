import type { OnboardingStrings } from './en';

export const tr: OnboardingStrings = {
  heroEyebrow: 'Tepegöz’e hoş geldin',
  heroHint: 'Yerel öncelikli tarayıcı kurulumu',
  heroTitle: 'Daha keskin bir tarayıcı, birkaç küçük adımda hazır.',
  heroBody:
    'Tanıdık yer imlerini ve şifrelerini getir, yerel başla, Tepegöz Account senkronizasyonu geldiğinde alan hazır olsun.',
  featureCards: [
    {
      title: 'Tarayıcı gibi tanıdık',
      body: 'Sekmeler, yer imleri, indirilenler ve ayarlar bildiğin akışa yakın kalır.',
    },
    {
      title: 'Varsayılan yerel',
      body: 'Kurulum bu cihazda başlar. Hesap senkronizasyonu ileride isteğe bağlı olacak.',
    },
    {
      title: 'Ajana hazır',
      body: 'Temeller hazır olunca otomasyon ve asistan özelliklerini etkinleştirebilirsin.',
    },
  ],
  stepLabel: 'Kurulum',
  stepCount: '{current} / {total}',
  steps: {
    welcome: { title: 'Hoş geldin' },
    account: { title: 'Oturum' },
    import: { title: 'İçe aktar' },
    finish: { title: 'Hazır' },
  },
  welcomeTitle: 'Bu tarayıcıyı sana ait hissettirelim.',
  welcomeBody:
    'Tepegöz temiz başlayabilir veya başka bir tarayıcıdan temel verileri getirebilir. Bu akış atlanabilir ve Ayarlar’dan yeniden yönetilebilir.',
  welcomeTiles: [
    {
      title: 'Oturumunu seç',
      body: 'Bugün yerel oturum kullan; Tepegöz Account sonrası için hazır.',
    },
    {
      title: 'Temelleri getir',
      body: 'İstersen dışa aktarılmış yer imlerini ve şifre CSV dosyalarını içe aktar.',
    },
    {
      title: 'Gezinmeye başla',
      body: 'Kurulumu bitirince Tepegöz normal tarayıcı arayüzünü açar.',
    },
  ],
  accountTitle: 'Tepegöz Account',
  accountBody:
    'Hesap girişi ileride senkronizasyon ve profil sürekliliği sağlayacak. Şimdilik desteklenen yol yerel oturum.',
  soon: 'Yakında',
  signIn: 'Tepegöz Account ile giriş yap',
  localSessionTitle: 'Yerel oturumla devam et',
  localSessionBody:
    'Yer imleri, şifreler, tercihler ve tarayıcı verileri bu yerel profilde kalır. Bu sürümde varsayılan budur.',
  importSource: 'İçe aktarılacak tarayıcı',
  importSourceHint:
    'Dosyanın hangi tarayıcıdan geldiğini seç. {browser} dışa aktarımları, hangi profilden gelirse gelsin aynı şekilde okunur.',
  sources: {
    chrome: 'Google Chrome',
    edge: 'Microsoft Edge',
    firefox: 'Mozilla Firefox',
    brave: 'Brave',
    other: 'Diğer tarayıcı',
  },
  // Bu bilgisayarda bulunan profiller. Yalnızca en az bir tane varsa gösterilir; başka tarayıcı
  // kurulu olmayan bir makine, cevaplayamayacağı bir soruyla karşılaşmaz.
  detectedTitle: 'Bu bilgisayarda bulundu',
  detectedBody:
    'Doğrudan bu cihazdaki bir tarayıcı profilinden içe aktar — dışa aktarma dosyası gerekmez. Sen birini seçene kadar hiçbir şey okunmaz.',
  detectedImport: 'İçe aktar',
  // Her satırdaki görünen etiket aynı kelime; erişilebilir ad profili taşır. Aynı adlı düğmelerden
  // oluşan bir liste, ekran okuyucuyu işe yaramaz hale getirmenin en eski yollarından biridir.
  detectedImportAria: '{browser} — {profile} profilinden içe aktar',
  detectedGone: 'Bu profil artık kullanılabilir değil.',
  bookmarksTitle: 'Yer imleri',
  bookmarksBody:
    'Tarayıcıdan dışa aktarılmış yer imi HTML dosyasını bırak. Aktarılanlar Diğer yer imleri altına eklenir.',
  bookmarksAccept: '.html veya .htm',
  chooseBookmarks: 'Yer imi dosyası seç',
  bookmarksImported: '{imported} yer imi içe aktarıldı. {skipped} atlandı.',
  // Dosya bir seferde okunabilecekten büyükse eklenir. Açıkça söyleniyor: tamamlanmış gibi görünen
  // kısmi bir aktarım, başarısız olandan kötüdür — kullanıcı aramayı bırakır.
  bookmarksTruncated: 'Dosya bir içe aktarımda okunabilecekten büyüktü, tamamı alınmadı.',
  importBookmarksFailed:
    'Yer imleri içe aktarılamadı. Dosyanın tarayıcı yer imi HTML dışa aktarımı olduğundan emin ol.',
  passwordsTitle: 'Şifreler',
  passwordsBody:
    'Şifre CSV dışa aktarımını bırak. Şifreler içe aktarılır aktarılmaz yerel kasada şifrelenir.',
  passwordsAccept: '.csv',
  choosePasswords: 'Şifre CSV’si seç',
  passwordsImported: '{imported} şifre içe aktarıldı. {skipped} atlandı.',
  importPasswordsFailed:
    'Şifreler içe aktarılamadı. CSV kolonlarını ve işletim sistemi şifrelemesinin kullanılabilirliğini kontrol et.',
  importing: 'İçe aktarılıyor…',
  finishTitle: 'Hazırsın.',
  finishBody:
    'Tepegöz şimdi normal tarayıcıyı açacak. İçe aktarma ve hesap seçeneklerine daha sonra Ayarlar’dan dönebilirsin.',
  summaryAccount: 'Oturum',
  summaryLocal: 'Yerel',
  summaryBookmarks: 'Yer imleri',
  summaryPasswords: 'Şifreler',
  summarySkipped: 'Atlandı',
  begin: 'Başla',
  continue: 'Devam et',
  back: 'Geri',
  skipImport: 'İçe aktarmayı atla',
  startBrowsing: 'Gezinmeye başla',
};
