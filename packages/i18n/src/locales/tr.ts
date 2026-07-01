import type { Resources } from './en';

/** Turkish — first-class locale; must match the English (source) shape of the shared core exactly. */
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
  window: {
    minimize: 'Küçült',
    maximize: 'Büyüt',
    restore: 'Önceki boyut',
    close: 'Kapat',
  },
  errors: {
    unauthorized: 'Kimlik doğrulama gerekli',
    forbidden: 'Eylem politika tarafından engellendi',
    badState: 'Bu işlem için geçersiz durum',
    upstreamDown: 'Servis kullanılamıyor',
    renderFailure: 'Bir şeyler ters gitti — lütfen uygulamayı yeniden başlatın',
  },
};
