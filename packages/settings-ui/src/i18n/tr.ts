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
  themeColorNames: {
    slate: 'Arduvaz',
    steel: 'Çelik',
    graphite: 'Grafit',
    turquoise: 'Turkuaz',
    violet: 'Mor',
    maroon: 'Bordo',
    amber: 'Kehribar',
    forest: 'Orman',
  },

  // --- Dil ve bölge ---
  languageRegionTitle: 'Dil ve bölge',
  languageLabel: 'Dil',
  langSystem: 'Sistem',
  regionLabel: 'Bölge',
  regionSystem: 'Sistem varsayılanı',
  languageSearchPlaceholder: 'Dil ara…',
  regionSearchPlaceholder: 'Ülke ara…',
  searchNoResults: 'Sonuç yok',
  dateFormatLabel: 'Tarih biçimi',
  dateShort: 'Kısa',
  dateMedium: 'Orta',
  dateLong: 'Uzun',
  dateFull: 'Tam',
  dateIso: 'ISO 8601',
  dateDmySlash: 'Gün/Ay/Yıl',
  dateMdySlash: 'Ay/Gün/Yıl',
  dateDmyDot: 'Gün.Ay.Yıl',
  dateShortMonth: 'Kısa ay',
  previewLabel: 'Önizleme',

  // --- Tercihler (başlangıç + arama motoru) ---
  preferencesTitle: 'Tercihler',
  searchEngineLabel: 'Arama motoru',
  searchEngineDesc: 'Adres çubuğundan arama yaptığınızda kullanılan motor.',
  searchEngineCustom: 'Özel motor ekle',
  searchEngineCustomName: 'Ad',
  searchEngineCustomUrl: 'Arama URL’si',
  searchEngineCustomUrlPlaceholder: 'https://ornek.com/ara?q={q}',
  searchEngineCustomUrlHint: 'Sorgunun geleceği yere {q} koyun.',
  searchEngineCustomAdd: 'Ekle',
  searchEngineCustomInvalid: 'Arama URL’si {q} içermeli.',
  searchEngineRemove: 'Kaldır',
  homepageLabel: 'Ana sayfa',
  homepageDesc: 'Yeni sekmeler, Ana Sayfa düğmesi ve boş adres çubuğu gönderiminde açılır.',
  homepagePlaceholder: 'https://ornek.com',

  // --- İndirilenler ---
  downloadsTitle: 'İndirilenler',
  downloadsSubtitle: 'Tarayıcı indirmelerinin karantinadan çıktıktan sonra bırakılacağı yer.',
  downloadLocationLabel: 'İndirme konumu',
  downloadLocationDesc: 'İşletim sisteminin İndirilenler klasörünü kullanmak için boş bırakın.',
  downloadLocationPlaceholder: 'Sistem İndirilenler klasörü',
  downloadAskEachTime: 'Her dosya için nereye kaydedileceğini sor',
  downloadAskEachTimeDesc: 'Karantinadaki dosya serbest bırakılırken son kayıt yolunu seç.',
  clearDownloadsLabel: 'İndirme geçmişi',
  clearDownloadsDesc: 'Tamamlanan, engellenen, iptal edilen ve başarısız indirmeleri listeden kaldırır.',
  clearDownloadsButton: 'İndirme geçmişini temizle',

  // --- Bildirimler ---
  notificationsTitle: 'Bildirimler',
  notifications: 'Bildirimleri etkinleştir',
  notificationsDesc:
    'Ajan devri, siteler ve sistem olayları için bildirim merkezini, toast’ları ve işletim sistemi bildirimlerini gösterir. Kapalıyken yalnızca merkez geçmişi tutar.',

  // --- Dosya işlemleri ---
  fileOps: {
    title: 'Dosya işlemleri',
    subtitle:
      'Yapay zekâ asistanının okuyup değiştirebileceği klasörler. Diskinizdeki diğer her şey erişime kapalı kalır. Varsayılan klasör home/tepegoz.',
    enable: 'Dosya işlemlerine izin ver',
    enableDesc:
      'Ana anahtar. Kapalıyken asistan, aşağıdaki klasörler ne derse desin hiçbir dosyaya dokunamaz.',
    addFolder: 'Klasör ekle',
    noFolders: 'Henüz klasör yok — asistanın dosyalarla çalışması için bir tane ekleyin.',
    recursive: 'Alt klasörleri dâhil et',
    modeLabel: 'Erişim',
    modes: {
      read: 'Yalnızca okuma',
      'read-write': 'Okuma ve yazma',
      full: 'Tam (silme dâhil)',
    },
    modeHint:
      'Bir klasörün erişim düzeyi içinde asistan sormadan çalışır; bunun ötesindeki her şey — ve her yeni klasör — onayınızı gerektirir.',
    remove: 'Kaldır',
    duplicate: 'Bu klasör zaten listede.',
  },

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
    local: 'Yerel (cihazda)',
  },

  // --- Maliyet ve performans ---
  costTitle: 'Maliyet ve performans',
  localModel: 'Basit işler için yerel model kullan',
  localModelDesc:
    'Basit AI adımlarını (sayfayı okuyup anlama, özetleme, sınıflandırma) cihazında çalıştırarak maliyeti düşürür, gerektiğinde buluta döner. Yerel modeli Sağlayıcılar → Yerel altından ekle.',
  localActionsHint:
    'Ajanın hangi AI adımlarının cihazında çalışabileceğini seç. Mekanik tarayıcı işlemleri (tıkla, gezin, sekme aç) her zaman yerel/native çalışır — AI adımları yoktur.',
  runLocallyLabel: 'Cihazda',
  nativeNoAiLabel: 'Native · AI yok',
  toolSchemaLabel: 'şema',
  toolIdempotencyLabel: 'idempotency',
  noActionsYet: 'Henüz aksiyon yok.',
  localModels: {
    title: 'Cihaz-içi modeller',
    hint: 'Ajanı yerelde çalıştırmak için bir model indir. Profilinde saklanır — uygulamayla paketlenmez.',
    recommended: 'Önerilen',
    selected: 'Kullanımda',
    use: 'Kullan',
    download: 'İndir',
    delete: 'Sil',
    empty: 'Model yok.',
    paramsUnit: 'B',
    ctxUnit: 'ctx',
  },
  dangerLabels: {
    read: 'okur',
    state_changing: 'sayfayı değiştirir',
    destructive: 'yıkıcı',
    financial: 'finansal',
  },
  // AIAdaptor grupları: sistem adaptör başlıkları (adaptör id'sine göre) + grup türü rozet etiketleri.
  adaptors: {
    browser: 'Tarayıcı',
    file: 'Dosya işlemleri',
    journal: 'Günlük ve denetim',
    extensions: 'Eklentiler',
  },
  adaptorKinds: {
    system: 'Sistem',
    extension: 'Eklenti',
    mcp: 'MCP',
  },

  // --- Bağlantılar / MCP ---
  connectionsTitle: 'Bağlantılar',
  connectionsSubtitle:
    'Model Context Protocol (MCP) sunucuları. Araçları, güvenlik politikası üzerinden ajana sunulur. Sunucuları tercihlerden ekleyin; buradan düzenleme ileri bir sürümde gelecek.',
  adaptorInventoryTitle: 'Adaptörler',
  adaptorInventorySubtitle:
    'Ajan politikasının gördüğü MCP, REST, GraphQL, OAuth servis ve yerel/native adaptörler.',
  adaptorInventoryEmpty: 'Henüz adaptör yok.',
  adaptorAuditRequired: 'Denetim',
  adaptorToolsLabel: 'araç',
  adaptorKindLabels: {
    mcp: 'MCP',
    rest: 'REST',
    graphql: 'GraphQL',
    oauth_service: 'OAuth servis',
    local: 'Yerel',
  },
  adaptorStateLabels: {
    not_configured: 'Yapılandırılmadı',
    connected: 'Bağlı',
    revoked: 'İptal edildi',
    error: 'Hata',
  },
  adaptorAuthLabels: {
    oauth: 'OAuth',
    api_key: 'API anahtarı',
    local: 'Yerel',
    none: 'Hesap yok',
  },
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
  sitePermissionClipboardRead: 'Pano okuma',
  sitePermissionClipboardWrite: 'Panoya yazma',
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
      items: ['Yeni sekme aç', 'Kaldığın yerden devam et', 'Belirli sayfaları aç'],
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
