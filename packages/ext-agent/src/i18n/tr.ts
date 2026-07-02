import type { AgentStrings } from './en';

/** Turkish — first-class; must match the English (source) shape exactly. */
export const tr: AgentStrings = {
  title: 'Ajan Konsolu',
  progress: 'İlerleme',
  tokens: 'Token',
  noActiveTasks: 'Aktif görev yok',
  awaitingApproval: 'Onayınız bekleniyor',
  open: 'Ajan',
  runPlaceholder: 'Tepegöz bu sayfada ne yapsın…',
  run: 'Çalıştır',
  running: 'Çalışıyor…',
  approvalTitle: 'Onay gerekli',
  approvalBody: 'Ajan, durumu değiştiren bir araç çalıştırmak istiyor. İzin veriyor musunuz?',
  biometricNote: 'Bu yüksek riskli bir işlem (Windows Hello ileri bir sürümde gerekli olacak).',
  approve: 'Onayla',
  deny: 'Reddet',
  aiDisclaimer: 'AI üretti, hatalı olabilir — yan etkili eylemleri gözden geçirin.',
  planTitle: 'Planı gözden geçirin',
  planBody:
    'İstemediğiniz adımların işaretini kaldırıp çalıştırın. Onaylayana kadar hiçbir şey yürütülmez.',
  planRun: 'Planı çalıştır',
  // İnsana Devir Denetleyicisi — CAPTCHA / 2FA algılandığında ajan kontrolü geri verir.
  handoff: {
    notifyTitle: 'Sıra sizde — Tepegöz duraklattı',
    captcha:
      'Bir CAPTCHA algılandı. Tepegöz durdu ve kontrolü size geri verdi — otomatik olarak çözmeyecek. Kendiniz tamamlayın, sonra yeni bir görev başlatın.',
    twofa:
      'Bir doğrulama adımı (2FA / tek kullanımlık kod) algılandı. Tepegöz durdu ve kontrolü size geri verdi — girişi kendiniz tamamlayın, sonra yeni bir görev başlatın.',
  },
  // Agentic komut paleti (Sohbet/Yap/Üret/Görevler) — bu yüzeyin sahibi bu eklenti.
  commandPalette: {
    placeholder: "Bir komut yazın ya da Tepegöz'e sorun…",
    modeChat: 'Sohbet',
    modeDo: 'Yap',
    modeMake: 'Üret',
    modeTasks: 'Görevler',
  },
  // Zaman çizelgesi tekrarı — bir çalışmanın olay akışını adım adım gözden geçirin (canlı = en yeniyi izler).
  replay: {
    timeline: 'Tekrar zaman çizelgesi',
    stepLabel: 'Adım',
    live: 'Canlı',
  },
};
