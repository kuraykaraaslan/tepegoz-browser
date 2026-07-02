import type { SettingsStrings } from './en';

/** Turkish — first-class; must match the English (source) shape exactly. */
export const tr: SettingsStrings = {
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
  notificationsTitle: 'Bildirimler',
  notifications: 'Bildirimleri etkinleştir',
  notificationsDesc:
    'Ajan devri, siteler ve sistem olayları için bildirim merkezini, toast’ları ve işletim sistemi bildirimlerini gösterir. Kapalıyken yalnızca merkez geçmişi tutar.',
  costTitle: 'Maliyet ve performans',
  localModel: 'Basit işler için yerel model kullan',
  localModelDesc:
    'Basit adımları (sınıflandırma, özetleme) cihazda çalıştırarak AI maliyetini düşürür, gerektiğinde buluta döner. Yerel model ileri bir sürümde devreye girer.',
  connectionsTitle: 'Bağlantılar',
  connectionsSubtitle:
    'Model Context Protocol (MCP) sunucuları. Araçları, güvenlik politikası üzerinden ajana sunulur. Sunucuları tercihlerden ekleyin; buradan düzenleme ileri bir sürümde gelecek.',
  mcpNoServers: 'Yapılandırılmış MCP sunucusu yok.',
  mcpStateIdle: 'Boşta',
  mcpStateConnecting: 'Bağlanıyor…',
  mcpStateReady: 'Hazır',
  mcpStateError: 'Hata',
  mcpToolCount: 'araç',
};
