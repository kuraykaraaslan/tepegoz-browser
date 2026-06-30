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
};
