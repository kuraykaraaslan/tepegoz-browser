import type { AppStrings } from './en';

/** Turkish — first-class; must match the English (source) shape exactly. */
export const tr: AppStrings = {
  browser: {
    tabs: 'Sekmeler',
    newTab: 'Yeni sekme',
    closeTab: 'Sekmeyi kapat',
    untitled: 'Yeni Sekme',
    back: 'Geri',
    forward: 'İleri',
    reload: 'Yenile',
    omniboxPlaceholder: 'Ara veya adres gir',
    // Omniçubuk öneri ipuçları (deterministik açılır liste — yapay zekâ başlatmaz).
    omniboxSearchHint: "Web'de ara",
    omniboxSwitchToTab: 'Sekmeye geç',
    settings: 'Ayarlar',
    menu: 'Ana menü',
    exit: 'Çıkış',
    // Sekme sağ tık menüsü (yerel), Chrome'un sekme menüsünü örnek alır.
    newTabRight: 'Sağda yeni sekme',
    duplicateTab: 'Çoğalt',
    closeOtherTabs: 'Diğer sekmeleri kapat',
    closeTabsRight: 'Sağdaki sekmeleri kapat',
  },
  commandPalette: {
    placeholder: "Bir komut yazın ya da Tepegöz'e sorun…",
    modeChat: 'Sohbet',
    modeDo: 'Yap',
    modeMake: 'Üret',
    modeTasks: 'Görevler',
  },
  extensions: {
    title: 'Eklentiler',
    manage: 'Eklentileri yönet',
    search: 'Eklentilerde ara',
    empty: 'Eşleşen eklenti yok',
  },
  sidebar: {
    resize: 'Kenar çubuğunu yeniden boyutlandır',
  },
  history: {
    title: 'Geçmiş',
    search: 'Geçmişte ara',
    empty: 'Henüz geçmiş yok',
    clear: 'Tümünü temizle',
    delete: 'Kaldır',
  },
  onboarding: {
    welcome: "Tepegöz'e hoş geldiniz",
    consentTitle: 'Veriniz, sizin kontrolünüzde',
    consentBody: 'Telemetri varsayılan olarak kapalı. Hassas siteler otomasyona kapalıdır.',
  },
  settings: {
    title: 'Ayarlar',
    search: 'Ayarlarda ara',
    noResults: 'Eşleşen ayar yok',
    providersTitle: 'Sağlayıcılar ve API anahtarları',
    providersSubtitle:
      'Anahtarlar bu cihazda şifrelenir (işletim sistemi anahtarlığı) ve sizin işleminiz olmadan cihazdan çıkmaz.',
    apiKey: 'API anahtarı',
    apiKeyPlaceholder: 'Anahtarınızı yapıştırın…',
    keySet: 'Anahtar tanımlı',
    keyNotSet: 'Anahtar yok',
    remove: 'Kaldır',
    keySaved: 'Anahtar kaydedildi.',
    keyRemoved: 'Anahtar kaldırıldı.',
    encryptionUnavailable:
      'İşletim sistemi şifrelemesi kullanılamıyor — anahtarlar bu cihazda güvenli saklanamaz.',
    providerNames: {
      anthropic: 'Claude (Anthropic)',
      openai: 'OpenAI',
      gemini: 'Gemini (Google)',
    },
    appearanceTitle: 'Görünüm',
    theme: 'Tema',
    themeSystem: 'Sistem',
    themeLight: 'Açık',
    themeDark: 'Koyu',
    languageTitle: 'Dil',
    langSystem: 'Sistem',
    privacyTitle: 'Gizlilik ve telemetri',
    telemetry: 'Anonim kullanım telemetrisini paylaş',
    telemetryDesc: 'Varsayılan kapalı. Sayfa içeriği veya anahtarlar asla gönderilmez.',
    costTitle: 'Maliyet ve performans',
    localModel: 'Basit işler için yerel model kullan',
    localModelDesc:
      'Basit adımları (sınıflandırma, özetleme) cihazda çalıştırarak AI maliyetini düşürür, gerektiğinde buluta döner. Yerel model ileri bir sürümde devreye girer.',
  },
};
