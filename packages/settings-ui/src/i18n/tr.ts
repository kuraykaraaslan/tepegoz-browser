import type { SettingsStrings } from './en';

/** Turkish — first-class; must match the English (source) shape exactly. */
export const tr: SettingsStrings = {
  search: 'Ayarlarda ara',
  noResults: 'Eşleşen ayar yok',

  // Sayfa kabuğunun yükleme / yazma durumları.
  loading: 'Ayarlar yükleniyor…',
  loadFailedTitle: 'Ayarlar yüklenemedi',
  loadFailedBody:
    'Tarayıcı süreci yanıt vermedi. Hiçbir şey değişmedi, geri alınacak bir şey yok — yeniden deneyin.',
  retry: 'Yeniden dene',
  savedIndicator: 'Kaydedildi',

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
  glassTitle: 'Cam efekti',
  glassHint:
    'Sekme çubuğunu ve araç çubuğunu saydamlaştırarak arkasındaki masaüstünü gösterir (Windows 11).',

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
  downloadRetention: 'Biten indirmeleri listeden kaldır',
  downloadRetentionDesc:
    'Dosyaların kendisine asla dokunulmaz — yalnızca indirme listesindeki kayıtlar silinir.',
  downloadRetentionOptions: {
    manual: 'Yalnızca ben temizleyince',
    'after-day': 'Bir gün sonra',
    'on-completion': 'Biter bitmez',
  },
  showDownloadsWhenDone: 'Bir indirme bittiğinde indirmeler panelini göster',
  showDownloadsWhenDoneDesc: 'Bir aktarım sona erdiğinde aktarımlar panelini bir kez açar.',
  downloadAskEachTime: 'Her dosya için nereye kaydedileceğini sor',
  downloadAskEachTimeDesc: 'Karantinadaki dosya serbest bırakılırken son kayıt yolunu seç.',
  clearDownloadsLabel: 'İndirme geçmişi',
  clearDownloadsDesc:
    'Tamamlanan, engellenen, iptal edilen ve başarısız indirmeleri listeden kaldırır.',
  clearDownloadsButton: 'İndirme geçmişini temizle',

  // --- Bildirimler ---
  notificationsTitle: 'Bildirimler',
  notifications: 'Bildirimleri etkinleştir',
  notificationsDesc:
    'Ajan devri, siteler ve sistem olayları için bildirim merkezini, toast’ları ve işletim sistemi bildirimlerini gösterir. Kapalıyken yalnızca merkez geçmişi tutar.',

  // --- Sistem tepsisi ve güç ---
  tray: {
    title: 'Sistem tepsisi ve güç',
    closeToTray: 'Kapatınca tepsiye',
    closeToTrayDesc:
      'Pencereyi kapatmak Tepegöz’ü sistem tepsisinde çalışır durumda tutar; arka plan sekmeleri ve ajan çalışmaya devam eder. Çıkış için tepsi simgesi menüsünü kullanın.',
    keepAwake: 'Tepsideyken etkin tut',
    keepAwakeDesc:
      'Tepsideyken sistemin Tepegöz’ü askıya almasını engeller. Arka plan işleri için daha güvenilir, batarya maliyeti daha yüksek.',
    pauseOnSleep: 'Uykuda duraklat',
    pauseOnSleepDesc:
      'Sistem uykuya veya batarya/güç tasarrufuna geçtiğinde arka plan ajan işini duraklatır, sistem uyandığında devam ettirir.',
    startupMode: 'Başlangıç modu',
    startupModeDesc:
      'Tepegöz her açılışta — ve sistem açılışında otomatik başlarken — nasıl açılsın. Tüm modlarda sekmeler render eder.',
    modeWindow: 'Pencere',
    modeBackground: 'Arka plan (sistem tepsisi)',
    modeKiosk: 'Kiosk (tam ekran, arayüz yok)',
    kioskUrl: 'Kiosk URL',
    kioskUrlPlaceholder: 'https://ornek.com',
    launchAtLogin: 'Sistem açılışında başlat',
    launchAtLoginDesc:
      'Bilgisayarınıza giriş yaptığınızda Tepegöz’ü otomatik başlatır (Windows / macOS / Linux). Otomatik başlatma arka planda çalışır; ajan açılıştan itibaren hazır olur.',
    tabDiscard: 'Etkin olmayan sekmeleri uyut',
    tabDiscardDesc:
      'Bir süredir bakmadığınız arka plan sekmelerinin belleğini boşaltır — sekme çubukta kalır ve ona tıkladığınız anda yeniden yüklenir. Üzerinde olduğunuz sekmeye, ses çalan bir sekmeye veya bir ajanın arka planda canlı tuttuğu bir sekmeye asla uygulanmaz.',
    tabDiscardIdleMinutes: 'Şu kadar dakika sonra uyut',
  },

  // --- Varsayılan tarayıcı ---
  defaultBrowser: {
    recheck: 'Yeniden denetle',
    title: 'Varsayılan tarayıcı',
    isDefault: 'Tepegöz varsayılan tarayıcınız.',
    isDefaultDesc: 'Diğer uygulamalardan ve e-postalardan gelen bağlantılar burada açılır.',
    notDefault: 'Tepegöz varsayılan tarayıcınız değil.',
    notDefaultDesc: 'Diğer uygulamalardan ve e-postalardan gelen bağlantılar şu anda başka bir yerde açılıyor.',
    makeDefault: "Tepegöz'ü varsayılan tarayıcım yap",
    checking: 'Kontrol ediliyor…',
    failed: 'Tepegöz kaydedilemedi — bunun yerine sistem ayarlarınızdan deneyin.',
  },

  // --- Dosya işlemleri ---
  fileOps: {
    removeTitle: 'Klasör erişimini kaldır',
    removeBody: 'Asistanın {path} erişimi kalkar. Diskteki hiçbir şeye dokunulmaz, dilediğinde yeniden verebilirsin.',
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
  regionSelectLabel: 'Bölge',
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
    kimi: 'Kimi (Moonshot)',
    nova: 'Amazon Nova',
    deepseek: 'DeepSeek',
    xai: 'xAI (Grok)',
    groq: 'Groq',
    local: 'Yerel (cihazda)',
  },
  keyModel: {
    label: 'Model',
    auto: 'Otomatik (önerilen)',
    autoShort: 'Otomatik',
    hint: 'Bir anahtarın çalışacağı modeli seçmek için satırındaki dişliyi kullanın — anahtarın modeli, o sağlayıcının en üstteki anahtarı olduğu sürece geçerlidir.',
    menuHint: 'Bu anahtarın modeli',
    saved: 'Model güncellendi.',
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
  tokenBudget: {
    unlimitedHint: '0 = sınırsız.',
    title: 'Token bütçesi',
    desc: "Tüm ajan çalışmalarındaki toplam token harcamasını sınırlayın. Ajan Konsolu canlı bir gösterge sunar ve %80'de uyarır; sınıra ulaşılınca yeni çalışma engellenir. Sizin kontrolünüz dışındaki nedenlerle (sistem hataları, CAPTCHA/2FA, döngüler) başarısız olan çalışmalar otomatik iade edilir.",
    label: 'Toplam token kotası (0 = sınırsız)',
    used: 'Şu ana dek kullanılan',
  },
  localModels: {
    sizeUnknown: 'boyut bilinmiyor',
    deleteTitle: 'Modeli sil',
    deleteBody: '{name} ({size}) bu bilgisayardan silinir. Yeniden kullanmak istersen baştan indirmen gerekir.',
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
  adaptorScopesMore: 'Tüm izinleri göster',
  adaptorScopesLess: 'Daha az göster',
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
  clearData: {
    title: 'Tarama verilerini temizle',
    desc: 'Geçmiş, indirmeler, çerezler ve önbellek — tek işlemde, zaman aralığına göre.',
    open: 'Tarama verilerini temizle…',
    rangeLabel: 'Zaman aralığı',
    ranges: {
      'last-hour': 'Son 1 saat',
      'last-day': 'Son 24 saat',
      'last-week': 'Son 7 gün',
      'last-4-weeks': 'Son 4 hafta',
      'all-time': 'Tüm zamanlar',
    },
    categoriesLabel: 'Neler temizlensin',
    categories: {
      history: 'Tarama geçmişi',
      downloads: 'İndirme geçmişi (liste, dosyalar değil)',
      cookies: 'Çerezler ve site verileri (sitelerdeki oturumun kapanır)',
      cache: 'Önbellekteki dosyalar ve görseller',
      agentHistory: 'Ajan konuşmaları',
    },
    allTimeOnly: 'Tamamen temizlenir — zaman aralığı buna uygulanmaz.',
    onExitTitle: 'Tepegöz kapanınca temizle',
    onExitDesc:
      'Seçilen kategoriler tarayıcı her kapandığında temizlenir. Varsayılan olarak hiçbiri seçili değildir.',
    // Diğer tarayıcılardan farkı burada: süreç öldürülmüşse çıkış kancası çalışamaz; bu yüzden bu
    // temizlik bir sonraki açılışta da tamamlanır.
    onExitNote: 'Tarayıcı beklenmedik şekilde kapanırsa temizlik bir sonraki açılışta tamamlanır.',
    confirm: 'Verileri temizle',
    clearing: 'Temizleniyor…',
    cleared: '{history} geçmiş kaydı, {downloads} indirme, {agent} ajan konuşması temizlendi.',
    failed: 'Temizlenemedi: {categories}.',
    error: 'Temizleme başarısız oldu. Hiçbir şeyin silindiği bildirilmedi.',
  },
  clearHistoryLabel: 'Tarama geçmişi',
  forgetSite: {
    title: 'Bir siteyi unut',
    desc: 'Bir sitenin çerezlerini, depolamasını, önbelleğini ve service worker’larını tek adımda siler.',
    placeholder: 'ornek.com',
    review: 'İncele',
    confirmFor: '{site} sitesinin bu cihazda sakladığı her şey silinecek.',
    confirm: 'Unut',
    cleared: '{site} sitesinin sakladığı her şey silindi.',
    vaultUntouched: 'Kayıtlı parolalar silinmez — parola yöneticinde kalır.',
    warning: {
      signs_you_out: 'Bu sitedeki oturumun kapanacak.',
      holds_saved_credentials: 'Parola yöneticinde bu site için kayıtlı bir giriş var.',
      has_offline_data:
        'Bu sitenin çevrimdışı özellikleri, sayfayı yeniden yükleyene kadar çalışmayacak.',
    },
  },
  // ── İzin Merkezi ───────────────────────────────────────────────────────────────────────────────
  // Karıştırılmaması gereken iki yarı: site izinleri kullanıcının kararlarıdır ve düzenlenebilir;
  // ajan matrisi Policy Kernel üzerine bir GÖRÜNÜMdür ve değildir. `agentReadOnly` nedenini söylüyor,
  // çünkü açıklamasız salt-okunur bir tablo, bozuk bir tablo gibi okunur.
  permissionsCenter: {
    forgetSiteBody: '{origin} için saklanan tüm kararlar unutulur. Site bir sonraki ihtiyacında yeniden sorar.',
    addSite: 'Bir site için önceden karar ver',
    addSiteHint: 'Siteyi ekler; o daha sormadan yanıtlarını belirleyebilirsin.',
    addSitePlaceholder: 'example.com',
    addSiteButton: 'Site ekle',
    filter: 'Süz',
    filterPlaceholder: 'Siteye göre süz',
    agentFilterPlaceholder: 'Araç adına göre süz',
    sitesTitle: 'Site izinleri',
    sitesSubtitle: 'Her sitenin neyi kullanabileceği. Sen izin vermeden hiçbir şey verilmez.',
    sitesEmpty: 'Henüz hiçbir site bir şey istemedi. Bu liste sen gezdikçe kendi kendine dolar.',
    forgetSite: 'Bu siteyi unut',
    // Bilerek yapılmayan şey, açıkça yazılıyor. Ürünün bilerek reddettiği bir izin, listeden sessizce
    // eksik olmak yerine bunu söylemeli.
    screenNote:
      'Ekran paylaşımı sunulmuyor. Kameradan farklı olarak, yanlışlıkla verilecek tek bir “izin ver” ekranındaki diğer tüm pencereleri devreder — bu tarayıcıya ait olmayanlar dahil.',
    state: { prompt: 'Her seferinde sor', allowed: 'İzin ver', denied: 'Engelle' },
    capability: {
      camera: 'Kamera',
      microphone: 'Mikrofon',
      geolocation: 'Konum',
      notifications: 'Bildirimler',
      clipboardRead: 'Panoyu okuma',
      clipboardWrite: 'Panoya yazma',
    },
    agentTitle: 'Ajanın yapabilecekleri',
    agentSubtitle:
      'Her araç için en iyi durum — kirli bir argüman veya hassas bir site bunu yalnızca daraltabilir.',
    agentReadOnly:
      'Salt okunur. Bu kararlar, onları veren tek şey olan Policy Kernel’den geliyor; buradan değiştirmek, gerçeğinden ayırt edilemeyecek ikinci bir görüş olurdu.',
    agentLoading: 'Politika okunuyor…',
    agentEmpty: 'Kayıtlı ajan aracı yok.',
    decision: { allow: 'Çalışır', ask: 'Önce sorar', deny: 'Reddedilir' },
  },
  clientCerts: {
    unavailable: 'Saklanan kararlar okunamadı; bu liste eksik olabilir.',
    title: 'Kimliğini doğruladığın siteler',
    // "İstemci sertifikası" terimini hiç duymamış birinin anlayacağı şekilde yazıldı: onun için önemli
    // olan, kim olduğunun imzalı kanıtının verilmiş olması ve kime verildiği.
    desc: 'İstemci sertifikası bir siteye kim olduğunu kanıtlar. Bu oturum, her bağlantıda sorulmaman için siteye verdiğin yanıtı hatırlıyor.',
    empty: 'Bu oturumda hiçbir site senden sertifika istemedi.',
    sent: 'Sertifika gönderildi',
    refused: 'Reddedildi — hatırlanıyor, tekrar sorulmayacak',
    forget: 'Bu yanıtları unut',
    // Dürüst sınır, yalnızca yorumda değil yüzeyin kendisinde: unutmak BUNDAN SONRASINI değiştirir,
    // gönderilmiş bir şeyi geri alamaz.
    forgetNote:
      'Unutmak yalnızca tekrar sorulacağın anlamına gelir. Gönderilmiş bir sertifika geri alınamaz.',
    forgotten: 'Unutuldu. Sonraki istekte sana tekrar sorulacak.',
    sessionNote: 'Bu yanıtlar hiçbir zaman diske yazılmaz — uygulamadan çıkınca unutulur.',
  },
  clearHistoryDesc: 'Bu cihazda ziyaret ettiğiniz sayfaların listesini kaldırır.',
  telemetryNothingSent: 'Bu derlemede hiçbir şey toplanmıyor ve gönderilmiyor — bu ayarı okuyan bir kod henüz yok. Bir gün olduğunda seçim baştan senin olsun diye burada duruyor.',
  safeBrowsing: {
    title: 'Güvenli Tarama koruması',
    desc: 'Tehlikeli siteleri ziyaret etmeden önce uyar ve tehlikeli indirmeleri engelle. Sayfa ve indirme adreslerini Google Güvenli Tarama ile karşılaştırır; sayfa adresinin kendisi asla gönderilmez.',
    inactiveNote:
      'Bu derlemede henüz etkin değil — tehdit listesi ve anahtarı bağlanmadı. Anahtar geldiğinde seçim baştan senin olsun diye bu düğme burada.',
  },
  clearHistoryConfirm: 'Bu cihazdaki tüm gezinme geçmişini siler. Yer imleri, parolalar ve site izinleri etkilenmez.',
  clearHistoryButton: 'Geçmişi temizle',
  historyCleared: 'Tarama geçmişi temizlendi.',

  // --- Site güven profilleri ---
  siteTrust: {
    storedAs: '{domain} olarak kaydedilir.',
    update: 'Güncelle',
    removeTitle: 'Güven profilini kaldır',
    removeBody: '{domain} varsayılan duruşa döner: ajan orada kapılı her işlemden önce sorar.',
    title: 'Site güveni',
    subtitle:
      'Yapay zekâ ajanının bir sitede kullandığı kalıcı tutum. Bir profil yalnızca daha katı hâle getirebilir — hiçbir şeyin kilidini açmaz.',
    empty: 'Hiçbir sitenin güven ayarı yok. Her site varsayılanı kullanıyor.',
    addPlaceholder: 'ornek.com',
    addLabel: 'Site',
    addHint: 'Yalnızca alan adı — https:// ve yol yazmayın. Alt alan adları devralır.',
    add: 'Ekle',
    remove: 'Kaldır',
    levelLabel: 'Düzey',
    levels: {
      trusted: 'Güvenilir',
      default: 'Varsayılan',
      restricted: 'Kısıtlı',
    },
    levelHelp: {
      trusted: 'Sıradan değişiklikler sorulmadan yapılır.',
      default: 'Standart kurallar geçerlidir.',
      restricted: 'Burada okumalar dahil her şeyi bana sor.',
    },
    ceiling:
      'Güvenilir bir sitede bile: silme, para harcama, sayfanın kendi içeriğinden gelen her şey ve tüm bankacılık, kripto, parola veya sağlık siteleri yine sorulur — ya da engelli kalır.',
    invalidDomain: 'ornek.com gibi bir alan adı girin — şema ve yol olmadan.',
  },

  // --- Klavye kısayolları ---
  shortcuts: {
    filterLabel: 'Süz',
    filterPlaceholder: 'Komut ya da tuş ara',
    notRebindable: 'Bu derlemede sabittirler — yeniden atama henüz yok, yani burada bir ayarın arkasına saklanmış bir şey de yok.',
    title: 'Klavye kısayolları',
    subtitle: 'Uygulamanın kısayolları bağladığı tek kayıttan gelen tüm genel kısayollar.',
    /**
     * Keyed by shortcut id. A nested group, not siblings of the strings above: the two used
     * to share one object, so a shortcut whose id happened to be `title` would have rendered
     * this section's own heading as its description, and the parity test that guards against
     * stale rows had to carry a hand-kept list of which keys to ignore.
     */
    descriptions: {
      newTab: 'Yeni sekme',
      reopenClosedTab: 'Son kapatılan sekmeyi geri aç',
      reload: 'Sayfayı yenile',
      settings: 'Ayarları aç',
      commandPalette: 'Komut paletini aç',
      find: 'Sayfada bul',
      fullScreen: 'Tam ekranı aç/kapat',
      exitKiosk: 'Kiosk modundan çık',
      print: 'Sayfayı yazdır',
      savePage: 'Sayfayı kaydet',
      viewSource: 'Sayfa kaynağını görüntüle',
      newPrivateWindow: 'Yeni bir gizli pencere aç',
      devTools: 'Geliştirici araçlarını aç',
      hardReload: 'Önbelleği yok sayarak yenile',
      closeTab: 'Sekmeyi kapat',
      focusAddressBar: 'Adres çubuğuna odaklan',
      focusAddressBarAlt: 'Adres çubuğuna odaklan (alternatif)',
    },
  },

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

  // --- Geliştirici ---
  developerTitle: 'Geliştirici',
  developerDesc:
    'Mevcut top-level settings objesi için sadece geliştirme ortamında görünen editör. Değerler normal preferences şemasıyla doğrulanır.',
  developerSearchPlaceholder: 'Settings keylerinde ara',
  developerApply: 'Uygula',
  developerEdit: 'Düzenle',
  developerSaved: 'Geliştirici ayarı kaydedildi.',
  developerSaveFailed: 'Bu ayar kaydedilemedi.',
  developerInvalidJson: 'Geçersiz JSON.',
  developerPublic: 'Public',
  developerPrivate: 'Private',
  developerType: 'Tip',
  developerValue: 'Mevcut değer',
  developerColumnKey: 'Key',
  developerColumnVisibility: 'Görünürlük',
  developerColumnType: 'Tip',
  developerColumnValue: 'Değer',
  developerColumnActions: 'İşlemler',
  developerFlagsTitle: 'Chromium flagleri',
  developerFlagsDesc:
    'Sadece geliştirme ortamı. İzin listesindeki bir Chromium/Electron flagini aç, sonra yeniden başlat. Burada yalnızca incelenmiş flagler görünür — serbest giriş yoktur ve sayfa izolasyonunu zayıflatan hiçbir şey listelenemez.',
  developerFlagsRelaunchHint: 'Flag değişikliklerinin geçerli olması için Tepegöz’ü yeniden başlat.',
  developerFlagsExperimental: 'Deneysel',
  developerFlagName: {
    forceDarkMode: 'Koyu modu zorla',
    forceDarkModeDesc:
      'Her sayfayı, sitenin kendi temasını yok sayarak Chromium’un otomatik koyu algoritmasıyla çiz.',
    parallelDownloading: 'Paralel indirme',
    parallelDownloadingDesc: 'Büyük indirmeleri birden çok eşzamanlı bağlantıya böl.',
    overlayScrollbars: 'Üstte kayan kaydırma çubukları',
    overlayScrollbarsDesc:
      'İçeriğin üzerinde yüzen, yerleşimde yer kaplamayan ince, otomatik gizlenen kaydırma çubukları.',
    forceReducedMotion: 'Azaltılmış hareketi zorla',
    forceReducedMotionDesc:
      'Her sayfaya azaltılmış hareket tercihi bildirerek gereksiz animasyonları bastır.',
    disableGpu: 'GPU hızlandırmayı kapat',
    disableGpuDesc:
      'Tümüyle CPU’da çiz — görsel bozulmaların nedeninin bir GPU sürücüsü olup olmadığını elemek için işe yarar.',
    showFpsCounter: 'FPS sayacını göster',
    showFpsCounterDesc: 'Her sayfada Chromium’un kare hızı / GPU HUD’unu göster.',
  },

  // --- Sıfırla ---
  resetTitle: 'Ayarları sıfırla',
  resetDesc:
    'Tüm tercihleri varsayılanlara geri yükler. Kayıtlı API anahtarları ve parolalar etkilenmez.',
  resetButton: 'Varsayılanlara sıfırla',
  resetConfirm:
    'Tüm ayarlar varsayılanlara sıfırlansın mı? Kayıtlı anahtarlar ve parolalar korunur.',
  resetDone: 'Ayarlar varsayılanlara sıfırlandı.',

  // --- Hakkında ---
  aboutTitle: 'Hakkında',
  aboutVersion: 'Sürüm',
  aboutPlatform: 'İşletim sistemi',
  aboutProjectTitle: 'Tepegöz hakkında',
  aboutProjectDesc:
    'Tepegöz; Electron ve TypeScript ile geliştirilen, ajan tabanlı, tasarımı gereği güvenli ve yerel öncelikli bir web tarayıcısıdır.',
  aboutAuthorTitle: 'Geliştirici',
  authorName: 'Kuray Karaaslan',
  aboutWebsite: 'Web sitesi',
  aboutGithub: 'GitHub',
  aboutLinkedin: 'LinkedIn',
  aboutInstagram: 'Instagram',

  // Sürüm ve derleme. Motor adları özel isimdir; her dilde aynı kalır.
  aboutBuildTitle: 'Sürüm ve derleme',
  aboutChannel: 'Kanal',
  aboutChannelDev: 'Geliştirme derlemesi',
  aboutBuildLabel: 'Derleme',
  aboutBuildUnstamped: 'Damgalanmamış',
  aboutChromium: 'Chromium',
  aboutElectron: 'Electron',
  aboutNode: 'Node.js',
  aboutV8: 'V8',
  aboutCopyDiagnostics: 'Tanılama bilgisini kopyala',
  aboutCopyDiagnosticsHint:
    'Yukarıdaki sürüm, motor ve derleme satırlarını kopyalar — hata bildirimine yapıştırın.',
  aboutCopied: 'Kopyalandı',
  aboutCopyFailed: 'Panoya erişilemedi.',

  // Güncellemeler. Bu derlemede güncelleyici yok; kartın yapabileceği tek dürüst şey bunu söylemek.
  aboutUpdatesTitle: 'Güncellemeler',
  aboutUpdatesUnavailable:
    'Bu derlemede otomatik güncelleme yok. Yeni sürümler yayınlar sayfasında duyurulur.',

  // Lisans ve üçüncü taraf bildirimleri. AGPL-3.0, uygulamanın kullanıcısını kaynağa yöneltmesini zorunlu kılar.
  aboutLegalTitle: 'Lisans ve bildirimler',
  aboutLicense: 'Lisans',
  aboutLicenseDesc:
    'Tepegöz, {license} ile lisanslanmış özgür yazılımdır. Kullanabilir, inceleyebilir, paylaşabilir ve değiştirebilirsiniz; değiştirilmiş bir sürümü çalıştırırsanız aynı lisans, kaynağını kullananlara sunmanızı gerektirir.',
  aboutLicenseText: 'Lisans metni',
  aboutThirdPartyTitle: 'Üçüncü taraf bildirimleri',
  aboutThirdPartyDesc:
    'Tepegöz, Chromium ve Electron ile çalışır. Bunların lisans bildirimleri uygulamayla birlikte gelir.',
  aboutThirdPartyOpen: 'Bildirimleri aç',
  aboutThirdPartyMissing: 'Bu derlemede bildirim dosyası yok — çevrimiçi kopya açılıyor.',

  // Proje bağlantıları.
  aboutProjectLinksTitle: 'Proje',
  aboutSource: 'Kaynak kodu',
  aboutReleases: 'Yayınlar',
  aboutDocs: 'Belgeler',
  aboutReportIssue: 'Hata bildir',
  aboutOpensInNewTab: 'Yeni sekmede açılır',
  aboutOpenDataFolder: 'Veri klasörünü aç',
  aboutOpenDataFolderFailed: 'Veri klasörü açılamadı.',

  // --- Yer tutucu ("yakında") bölümleri — salt arayüz, hiçbir şey kaydetmez ---
  // İndirilenler / arama motoru düzenleme / varsayılan tarayıcı yeniden denetleme / kontrast okuması.
  downloadLocationBrowse: 'Gözat…',
  downloadLocationOpen: 'Klasörü aç',
  downloadLocationOpenFailed: 'Bu klasör açılamadı. Taşınmış veya silinmiş olabilir.',
  clearDownloadsConfirm: 'Biten, iptal edilen ve başarısız tüm aktarımları listeden kaldırır. Dosyaların kendisi silinmez.',
  clearDownloadsResult: '{count} kayıt listeden kaldırıldı.',
  searchEngineEdit: 'Düzenle',
  searchEngineSave: 'Kaydet',
  searchEngineDuplicate: 'Bu adda bir motor zaten var.',
  contrastSample: 'Örnek',
  contrastText: 'Metin',
  contrastAccent: 'Vurgu',
  contrastAccentLabel: 'Vurgu üstündeki etiket',
  contrastTargets: 'WCAG AA metin için {text}, denetimler için {nonText} ister.',

  // --- MCP sunucuları (daha önce yalnızca Geliştirici sayfasındaki ham JSON alanından ayarlanabiliyordu) ---
  mcp: {
    title: 'MCP sunucuları',
    subtitle:
      'Model Context Protocol sunucuları ajanı araçlarla genişletir. Yerel olan alt süreç olarak çalışır; uzak olana HTTP üzerinden erişilir.',
    labelField: 'Ad',
    labelPlaceholder: 'Dosya sistemi',
    transport: 'Taşıma',
    transports: {
      stdio: 'Yerel süreç',
      http_sse: 'HTTP (SSE)',
    },
    command: 'Komut',
    commandPlaceholder: 'npx',
    args: 'Argümanlar',
    argsPlaceholder: '-y @modelcontextprotocol/server-filesystem /home',
    url: 'Sunucu adresi',
    urlPlaceholder: 'https://example.com/mcp',
    add: 'Sunucu ekle',
    enabled: 'Etkin',
    empty: 'Henüz MCP sunucusu yok.',
    errorLabel: 'Sunucuya bir ad verin.',
    errorCommand: 'Yerel sunucunun çalıştıracak bir komuta ihtiyacı var.',
    errorUrl: 'Tam bir http:// veya https:// adresi girin.',
    removeTitle: 'Sunucuyu kaldır',
    removeBody:
      '{name} ve sağladığı araçlar kaldırılır. Programın kendisi silinmez, istediğinizde yeniden ekleyebilirsiniz.',
    envNote: 'Bu sunucu ortam değişkenleri taşıyor; buradan düzenlediğinizde onlara dokunulmaz.',
    envLink: 'Geliştirici sayfasından düzenleyin',
  },

  mcpStateLabels: {
    idle: 'Boşta',
    connecting: 'Bağlanıyor…',
    ready: 'Hazır',
    error: 'Hata',
  },
  mcpToolsLabel: 'araç',
  moveUp: '{name} anahtarını yukarı taşı',
  moveDown: '{name} anahtarını aşağı taşı',
  keyRemoveTitle: 'Anahtarı kaldır',
  keyRemoveBody:
    '{name} kaldırılır. Anahtarın kendisi bir daha gösterilmez; geri almak için sağlayıcınızdan yeniden yapıştırmanız gerekir.',

  notificationsSiteNote: 'Bu ana anahtardır. Siteler ayrıca kendi izinlerini de almalıdır; bunu kapatmak hepsini izinlerinden bağımsız susturur.',
  notificationsSiteLink: 'Site bazlı bildirim izinleri',
  developerResetRow: 'Varsayılana döndür',

  // --- Erişilebilirlik (ürün WCAG 2.2 AA iddia ederken yer tutucuydu) ---
  accessibility: {
    title: 'Erişilebilirlik',
    subtitle: 'Sayfaların ne kadar büyük olduğu ve arayüzün ne kadar hareket ettiği.',
    pageZoom: 'Varsayılan sayfa yakınlaştırması',
    pageZoomHint:
      'Kendisi için ayar yapmadığın sitelerin alacağı düzey. Tek bir siteyi yakınlaştırmak yine bunu geçersiz kılar ve o site için hatırlanır.',
    perSiteCount: '{count} sitenin kendi yakınlaştırma düzeyi var.',
    clearPerSite: 'Tüm siteleri sıfırla',
    clearPerSiteBody:
      '{count} sitenin tamamındaki yakınlaştırma düzeyi unutulur. Yukarıdaki varsayılana dönerler; başka hiçbir şey değişmez.',
    reduceMotion: 'Hareketi azalt',
    reduceMotionDesc:
      'Animasyonları ve geçişleri sıfıra indirir. Sistem ayarın zaten uygulanıyor — sisteminin istediğinden daha az hareket istiyorsan bunu aç.',
    elsewhereTitle: 'İlgili ayarlar',
    elsewhereHint: 'Bunlar da okunabilirliği değiştirir ama başka sayfalara aittir.',
    linkTheme: 'Tema ve kontrast — Görünüm',
    linkShortcuts: 'Klavye kısayolları',
  },

  // --- Açılışta (Sistem tepsisi ve güç sayfasından taşındı; eskiden orada saklıydılar) ---
  startup: {
    title: 'Açılışta',
    modeWindowDesc: 'Normal bir tarayıcı penceresi açar.',
    modeBackgroundDesc:
      'Pencere açmadan sistem tepsisinde başlar. Sekmeler çizilmeye devam eder ve siz hiçbir şey açmadan ajan çalışabilir.',
    modeKioskDesc: 'Tek bir adresi, hiç tarayıcı arayüzü olmadan tam ekran açar.',
    kioskUrlHint: 'Kiosk modunda adres çubuğu yoktur; yüklenecek tek sayfa budur.',
    urlInvalid: 'Tam bir http:// veya https:// adresi girin.',
    rangeInvalid: '{min} ile {max} arasında tam bir sayı girin.',
    movedHere: 'Başlangıç modu ve oturum açılışında başlatma, Tercihler → Açılışta sayfasına taşındı.',
  },

  // --- Ajan denetimleri (eskiden, üçü zaten sevk edilmiş dört maddeyi sayan bir yer tutucuydu) ---
  agentControls: {
    title: 'Ajan denetimleri',
    autonomyHint:
      'Ajanın sormadan önce nereye kadar gidebileceği. Reddedilen işlemler her seviyede reddedilmiş kalır.',
    effortHint: 'Her adıma ne kadar akıl yürütme düşeceği. Yüksek seviyeler daha çok token harcar.',
    elsewhereTitle: 'İlgili ayarlar',
    elsewhereHint: 'Bunlar da ajanı denetler ama başka sayfalara aittir.',
    linkBudget: 'Token bütçesi — Maliyet ve performans',
    linkRouting: 'Model yönlendirme — Sağlayıcılar ve API anahtarları',
    linkPermissions: 'Araç bazlı izinler — Site izinleri',
  },

  // --- Sistem (eskiden, ikisi zaten sevk edilmiş üç maddeyi sayan bir yer tutucuydu) ---
  system: {
    title: 'Sistem',
    subtitle: 'Tarayıcının tamamını ilgilendiren makine düzeyi davranışlar.',
    hardwareAcceleration: 'Donanım hızlandırma kullan',
    hardwareAccelerationDesc:
      'Sayfaları GPU ile çiz. Yalnızca çizim bozuklukları ya da sürücü çökmeleri görüyorsanız kapatın — yazılımla çizim daha yavaştır ve daha çok pil harcar.',
    restartRequired: 'Tepegöz bunu açılışta karar verir; değişiklik yeniden başlattıktan sonra geçerli olur.',
    restartNow: 'Şimdi yeniden başlat',
    crashReporting: 'Çökme raporları topla',
    crashReportingDesc:
      'Tepegöz çöktüğünde, profilinizdeki Crashes klasörüne tanılama amaçlı bir minidump kaydeder. Hiçbir şey yüklenmez — dosyalar makinenizde kalır, dilerseniz siz gönderirsiniz. Varsayılan olarak kapalı.',
    elsewhereTitle: 'İlgili ayarlar',
    elsewhereHint: 'Bunlar da sistem düzeyindedir ama başka sayfalara aittir.',
    linkLaunchAtLogin: 'Oturum açılışında başlat — Sistem tepsisi ve güç',
    linkProxy: 'Proxy ve tüneller — Ağ gizliliği',
  },

  coming: {
    autofill: {
      title: 'Otomatik doldurma',
      description: 'Kayıtlı ödeme yöntemleri ve adresler.',
      items: ['Ödeme yöntemleri', 'Adresler', 'Parola sızıntısı denetimi'],
    },
  },
  // --- Ağ gizliliği (Faz 5): yerel bir SOCKS uç noktası üzerinden sekme/grup bazında yönlendirme ---
  network: {
    routesTitle: 'Trafik nereye gidiyor',
    routesHint: 'Sekme ve grup başına yönlendirmeler sekme ve grup menülerinden ayarlanır; burası onları gözden geçirdiğin yer.',
    routesGroups: 'Gruplar',
    routesTabs: 'Sekmeler',
    routesNoOverrides: 'Kendi rotasında olan sekme yok — her şey yukarıdaki varsayılanı izliyor.',
    routeSource: {
      tab: 'Bu sekmede ayarlı',
      group: 'Grubundan',
      general: 'Varsayılandan',
    },
    routeHeld: 'Tutuluyor — tünel kapalı',
    removeTitle: 'Bağlantıyı kaldır',
    removeBody: '{name} kaldırılır. Ona bağlı sekme veya gruplar profil varsayılanına döner.',
    removeBodyDefault: '{name} profil varsayılanı. Kaldırırsan bağlanmamış TÜM trafik doğrudan bağlantıya döner.',
    title: 'Ağ gizliliği',
    intro:
      'Bir sekmeyi ya da bütün bir sekme grubunu WireGuard, Tor veya zaten çalıştırdığınız bir SOCKS5 uç noktası üzerinden yönlendirin. Tepegöz tüneli kendisi sağlamaz; siz seçmedikçe hiçbir şey tünelden geçmez.',
    defaultRoute: 'Varsayılan rota',
    defaultRouteHint:
      'Kendi rotası olmayan ve rotalı bir grupta bulunmayan her sekme için geçerlidir. Değiştirmek etkilenen sekmeleri yeniden yükler.',
    direct: 'Doğrudan (tünelsiz)',
    connections: 'Bağlantılar',
    noConnections: 'Henüz bağlantı eklenmedi.',
    notedAs: 'Not: {note}',
    remove: 'Kaldır',
    removeHint:
      'Bir bağlantıyı kaldırmak, onu kullanan sayfaların çerezlerini ve önbelleğini de siler ve sekmelerini varsayılan rotaya döndürür.',
    statusUp: 'bağlı',
    statusDown: 'bağlı değil',
    statusConnecting: 'bağlanıyor',
    labelPlaceholder: 'İsim',
    notePlaceholder: 'Not (örn. Tor, Mullvad SE)',
    portPlaceholder: 'Port',
    portInvalid: '1 ile 65535 arasında bir port girin.',
    add: 'Ekle',
    kindLabel: 'Tür',
    nameLabel: 'İsim',
    noteLabel: 'Not',
    portLabel: 'Port',
    profileLabel: 'Profil',
    chooseFile: '.conf seç…',
    pickedSummary: 'Uç nokta {endpoint} · DNS {dns}',
    connect: 'Bağlan',
    disconnect: 'Bağlantıyı kes',
    protocolWireguard: 'WireGuard',
    protocolTor: 'Tor',
    protocolByo: 'SOCKS',
    chainedVia: '{name} üzerinden',
    keychainBody:
      'Bir WireGuard profili özel anahtar içerir; bu yüzden ancak işletim sistemi onu şifreleyebildiğinde içe aktarılabilir. Hiçbir şey düz metin olarak yazılmayacak.',
    torUpstream: 'Üst bağlantı',
    torUpstreamNone: 'Doğrudan Tor’a',
    torUpstreamVia: '{name} üzerinden',
    binaryMissing:
      '{name} bulunamadı. {dir} klasörüne koyun ya da aşağıya tam yolunu yazın. Tepegöz bu dosyayı içinde getirmez.',
    helpersHint:
      'WireGuard ve Tor bağlantıları bu iki programı çalıştırır. Tepegöz bunları içinde getirmez — alışılmış kurulum konumlarında ve PATH’te arar; ya da bulundukları klasörü siz gösterebilirsiniz.',
    binaryAutoDetected: '(otomatik bulundu)',
    binaryBrowse: 'Gözat…',
    binaryChange: 'Değiştir…',
    binaryClear: 'Temizle',
  },
};
