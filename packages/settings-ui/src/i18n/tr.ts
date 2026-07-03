import type { SettingsStrings } from './en';

/** Turkish — first-class; must match the English (source) shape exactly. */
export const tr: SettingsStrings = {
  search: 'Ayarlarda ara',
  noResults: 'Eşleşen ayar yok',

  // --- Kenar çubuğu grup başlıkları ---
  groupGeneral: 'Genel',
  groupAiAgent: 'Yapay Zekâ ve Ajan',
  groupPrivacy: 'Gizlilik ve güvenlik',
  groupAdvanced: 'Gelişmiş',
  groupAbout: 'Hakkında',
  comingSoon: 'Yakında',

  // --- Görünüm ---
  appearanceTitle: 'Görünüm',
  theme: 'Tema',
  themeSystem: 'Sistem',
  themeLight: 'Açık',
  themeDark: 'Koyu',
  themePreviewHint: 'Bir tema seçin — önizleme nasıl göründüğünü gösterir.',
  colorTheme: 'Renk teması',
  colorThemeHint: 'Tek bir renk seçin — metin kontrastı otomatik belirlenir.',
  customColor: 'Özel',

  // --- Dil ve bölge ---
  languageRegionTitle: 'Dil ve bölge',
  languageLabel: 'Dil',
  langSystem: 'Sistem',
  regionLabel: 'Bölge',
  regionSystem: 'Sistem varsayılanı',
  dateFormatLabel: 'Tarih biçimi',
  dateShort: 'Kısa',
  dateMedium: 'Orta',
  dateLong: 'Uzun',
  dateFull: 'Tam',
  previewLabel: 'Önizleme',

  // --- Tercihler (başlangıç + arama motoru) ---
  preferencesTitle: 'Tercihler',
  searchEngineLabel: 'Arama motoru',
  searchEngineDesc: 'Adres çubuğundan arama yaptığınızda kullanılan motor.',
  searchEngineCustom: 'Özel motor ekle',

  // --- Bildirimler ---
  notificationsTitle: 'Bildirimler',
  notifications: 'Bildirimleri etkinleştir',
  notificationsDesc:
    'Ajan devri, siteler ve sistem olayları için bildirim merkezini, toast’ları ve işletim sistemi bildirimlerini gösterir. Kapalıyken yalnızca merkez geçmişi tutar.',

  // --- Sağlayıcılar ve API anahtarları ---
  providersTitle: 'Sağlayıcılar ve API anahtarları',
  providersSubtitle:
    'Anahtarlar bu cihazda şifrelenir (işletim sistemi anahtarlığı) ve sizin işleminiz olmadan cihazdan çıkmaz.',
  providerSelectLabel: 'Sağlayıcı',
  apiKey: 'API anahtarı',
  apiKeyPlaceholder: 'Anahtarınızı yapıştırın…',
  keyLabel: 'Etiket',
  keyLabelPlaceholder: 'örn. İş, Kişisel',
  addKey: 'Anahtar ekle',
  rename: 'Yeniden adlandır',
  cancel: 'İptal',
  remove: 'Kaldır',
  noKeysYet: 'Henüz anahtar eklenmedi.',
  defaultBadge: 'Varsayılan',
  reorderHint: 'Sıralamak için sürükleyin — en üstteki anahtar varsayılandır.',
  providerNotUsableYet: 'Kaydedildi — bu sağlayıcıyla çalıştırma ileri bir sürümde gelecek.',
  encryptionUnavailable:
    'İşletim sistemi şifrelemesi kullanılamıyor — anahtarlar bu cihazda güvenli saklanamaz.',
  keyAdded: 'Anahtar eklendi.',
  keyRemoved: 'Anahtar kaldırıldı.',
  keyRenamed: 'Anahtar yeniden adlandırıldı.',
  keysReordered: 'Sıra güncellendi.',
  providerNames: {
    anthropic: 'Claude (Anthropic)',
    openai: 'OpenAI',
    gemini: 'Gemini (Google)',
  },

  // --- Maliyet ve performans ---
  costTitle: 'Maliyet ve performans',
  localModel: 'Basit işler için yerel model kullan',
  localModelDesc:
    'Basit adımları (sınıflandırma, özetleme) cihazda çalıştırarak AI maliyetini düşürür, gerektiğinde buluta döner. Yerel model ileri bir sürümde devreye girer.',

  // --- Bağlantılar / MCP ---
  connectionsTitle: 'Bağlantılar',
  connectionsSubtitle:
    'Model Context Protocol (MCP) sunucuları. Araçları, güvenlik politikası üzerinden ajana sunulur. Sunucuları tercihlerden ekleyin; buradan düzenleme ileri bir sürümde gelecek.',
  mcpNoServers: 'Yapılandırılmış MCP sunucusu yok.',
  mcpStateIdle: 'Boşta',
  mcpStateConnecting: 'Bağlanıyor…',
  mcpStateReady: 'Hazır',
  mcpStateError: 'Hata',
  mcpToolCount: 'araç',

  // --- Gizlilik ve telemetri ---
  privacyTitle: 'Gizlilik ve telemetri',
  telemetry: 'Anonim kullanım telemetrisini paylaş',
  telemetryDesc: 'Varsayılan kapalı. Sayfa içeriği veya anahtarlar asla gönderilmez.',
  clearHistoryLabel: 'Tarama geçmişi',
  clearHistoryDesc: 'Bu cihazda ziyaret ettiğiniz sayfaların listesini kaldırır.',
  clearHistoryButton: 'Geçmişi temizle',
  historyCleared: 'Tarama geçmişi temizlendi.',

  // --- Site izinleri ---
  sitePermissionsTitle: 'Site izinleri',
  sitePermissionsSubtitle: 'Site bazında yetki verileri (örn. bildirimler).',
  sitePermissionsEmpty: 'Site bazında izin ayarlanmadı.',
  sitePermissionNotifications: 'Bildirimler',
  permissionReset: 'Sıfırla',

  // --- Parolalar ---
  passwordsTitle: 'Parolalar',

  // --- Sıfırla ---
  resetTitle: 'Ayarları sıfırla',
  resetDesc:
    'Tüm tercihleri varsayılanlara geri yükler. Kayıtlı API anahtarları ve parolalar etkilenmez.',
  resetButton: 'Varsayılanlara sıfırla',
  resetConfirm: 'Tüm ayarlar varsayılanlara sıfırlansın mı? Kayıtlı anahtarlar ve parolalar korunur.',
  resetDone: 'Ayarlar varsayılanlara sıfırlandı.',

  // --- Hakkında ---
  aboutTitle: 'Hakkında',
  aboutName: 'Ad',
  aboutVersion: 'Sürüm',
  aboutPlatform: 'Platform',
  aboutProjectTitle: 'Tepegöz hakkında',
  aboutProjectDesc:
    'Tepegöz; Electron ve TypeScript ile geliştirilen, ajan tabanlı, tasarımı gereği güvenli ve yerel öncelikli bir web tarayıcısıdır.',
  aboutAuthorTitle: 'Geliştirici',
  authorName: 'Kuray Karaaslan',
  aboutWebsite: 'Web sitesi',
  aboutGithub: 'GitHub',
  aboutLinkedin: 'LinkedIn',
  aboutInstagram: 'Instagram',

  // --- Yer tutucu ("yakında") bölümleri — salt arayüz, hiçbir şey kaydetmez ---
  coming: {
    onStartup: {
      title: 'Başlangıçta',
      description: 'Tarayıcı açıldığında ne açılır.',
      items: ['Yeni sekme aç', 'Kaldığın yerden devam et', 'Belirli sayfaları aç', 'Ana sayfa'],
    },
    downloads: {
      title: 'İndirilenler',
      description: 'Dosyaların nereye kaydedileceği.',
      items: ['İndirme konumu', 'Her dosya için nereye kaydedileceğini sor', 'İndirme geçmişini temizle'],
    },
    accessibility: {
      title: 'Erişilebilirlik',
      description: 'Tarayıcıyı kullanımı kolaylaştıran seçenekler yakında geliyor.',
    },
    agentControls: {
      title: 'Ajan denetimleri',
      description: 'Yapay zekâ ajanı üzerinde ince ayar denetimi.',
      items: ['Özerklik / onay düzeyi', 'Token bütçe sınırı', 'Model yönlendirme', 'Araç bazında izinler'],
    },
    autofill: {
      title: 'Otomatik doldurma',
      description: 'Kayıtlı ödeme yöntemleri ve adresler.',
      items: ['Ödeme yöntemleri', 'Adresler', 'Parola sızıntısı denetimi'],
    },
    system: {
      title: 'Sistem',
      description: 'Sistem düzeyi davranış.',
      items: ['Başlangıçta çalıştır', 'Donanım hızlandırma', 'Proxy ayarları'],
    },
  },
};
