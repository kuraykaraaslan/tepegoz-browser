import type { Resources } from './en';

/** Turkish — first-class locale; must match the English (source) shape exactly. */
export const tr: Resources = {
  common: {
    appName: 'Tepegöz',
    ok: 'Tamam',
    cancel: 'İptal',
    retry: 'Yeniden dene',
    save: 'Kaydet',
    settings: 'Ayarlar',
    showPassword: 'Göster',
    hidePassword: 'Gizle',
  },
  commandPalette: {
    placeholder: "Bir komut yazın ya da Tepegöz'e sorun…",
    modeChat: 'Sohbet',
    modeDo: 'Yap',
    modeMake: 'Üret',
    modeTasks: 'Görevler',
  },
  agentConsole: {
    title: 'Ajan Konsolu',
    progress: 'İlerleme',
    tokens: 'Token',
    noActiveTasks: 'Aktif görev yok',
    awaitingApproval: 'Onayınız bekleniyor',
  },
  onboarding: {
    welcome: "Tepegöz'e hoş geldiniz",
    consentTitle: 'Veriniz, sizin kontrolünüzde',
    consentBody: 'Telemetri varsayılan olarak kapalı. Hassas siteler otomasyona kapalıdır.',
  },
  errors: {
    unauthorized: 'Kimlik doğrulama gerekli',
    forbidden: 'Eylem politika tarafından engellendi',
    badState: 'Bu işlem için geçersiz durum',
    upstreamDown: 'Servis kullanılamıyor',
  },
  settings: {
    title: 'Ayarlar',
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
