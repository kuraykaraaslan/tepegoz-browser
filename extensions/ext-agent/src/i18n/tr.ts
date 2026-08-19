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
  runFailed: 'Ajan başlatılamadı.',
  approvalTitle: 'Onay gerekli',
  approvalBody: 'Ajan, durumu değiştiren bir araç çalıştırmak istiyor. İzin veriyor musunuz?',
  biometricNote: 'Bu yüksek riskli bir işlem (Windows Hello ileri bir sürümde gerekli olacak).',
  // Risk sınıfları (S6-PR2). Sınıf, ana süreçte aracın KENDİSİNDEN ve gerçek argümanlarından
  // türetilir; böylece istem, ne tür bir işlem istendiğini adıyla söyleyebilir. Düz bir "bir araç
  // durumu değiştirmek istiyor" uyarısı kullanıcıyı onaya alıştırır; işlemi adlandırmak onayı anlamlı kılar.
  riskClass: {
    label: 'Risk sınıfı',
    read: {
      name: 'Okuma',
      desc: 'Yalnızca sayfa içeriğini okur. Hiçbir şey değişmez, hiçbir yere gönderilmez.',
    },
    'ui-write': {
      name: 'Sayfa değişikliği',
      desc: 'Sayfada veya uygulamada bir şeyi değiştirir. Geri alınabilir, hassas veri yok.',
    },
    'data-egress': {
      name: 'Veri çıkışı',
      desc: 'Veriyi bu cihazın dışına veya başka bir siteye gönderir. Nereye gittiğini kontrol edin.',
    },
    financial: {
      name: 'Para',
      desc: 'Bir ödeme veya finansal hesap söz konusu. Para hareket edebilir.',
    },
    credential: {
      name: 'Gizli bilgi',
      desc: 'Parola, tek kullanımlık kod veya kart bilgisi söz konusu.',
    },
    destructive: {
      name: 'Geri alınamaz',
      desc: 'Veriyi siler veya üzerine yazar. Bu işlem geri alınamaz.',
    },
  },
  // Bir sitenin otomasyona neden kapatıldığı, kategoriye göre (hassas site kilidi).
  sensitiveSite: {
    banking: 'Bu bir bankacılık veya ödeme sitesine benziyor.',
    government: 'Bu bir kamu hizmetine benziyor.',
    crypto: 'Bu bir kripto borsası veya cüzdanına benziyor.',
    'password-manager': 'Bu bir parola yöneticisine benziyor.',
    health: 'Bu bir sağlık hizmetine benziyor.',
  },
  approve: 'Onayla',
  deny: 'Reddet',
  planTitle: 'Planı gözden geçirin',
  planBody:
    'İstemediğiniz adımların işaretini kaldırıp çalıştırın. Onaylayana kadar hiçbir şey yürütülmez.',
  planRun: 'Planı çalıştır',
  // İnsana Devir Denetleyicisi — CAPTCHA / 2FA / giriş duvarı algılandığında ajan kontrolü geri verir.
  handoff: {
    notifyTitle: 'Sıra sizde — Tepegöz duraklattı',
    captcha:
      'Bir CAPTCHA algılandı. Tepegöz durdu ve kontrolü size geri verdi — otomatik olarak çözmeyecek. Kendiniz tamamlayın, sonra yeni bir görev başlatın.',
    twofa:
      'Bir doğrulama adımı (2FA / tek kullanımlık kod) algılandı. Tepegöz durdu ve kontrolü size geri verdi — girişi kendiniz tamamlayın, sonra yeni bir görev başlatın.',
    login:
      'Bir giriş ekranı algılandı. Tepegöz duraklattı ve sizin yerinize giriş yapmayacak. Sayfada giriş yapın, sonra “Devam et”e basın — görevi oradan sürdürür.',
  },
  // Token Defteri kotası — %80 uyarısı (kümülatif kullanım eşiği aştığında bir kez gösterilir).
  quota: {
    warnTitle: 'Token kotanıza yaklaşıyorsunuz',
    warnBody: "Bu hesap token kotasının %80'inden fazlasını kullandı. Ayarlar → Ajan'dan düzenleyin.",
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
  // Besteci / çerçeve.
  newTask: 'Yeni görev',
  history: {
    label: 'Konuşma geçmişi',
    search: 'Konuşmalarda ara...',
    empty: 'Henüz konuşma yok',
    loading: 'Yükleniyor...',
    full: 'Tüm konuşma geçmişi',
    delete: 'Konuşmayı sil',
  },
  skills: {
    label: 'Beceriler',
    title: 'Yeniden kullanabileceğin kayıtlı istemler',
    empty: 'Henüz kayıtlı beceri yok',
    loading: 'Yükleniyor...',
    save: 'Bu istemi beceri olarak kaydet',
    saveTitle: 'Beceriye ad ver',
    namePlaceholder: 'Haftalık fatura kontrolü',
    startUrl: 'Başlangıç',
    grantProfile: 'Beklenen izin',
    hint: 'Beceri seçmek aşağıdaki kutuyu doldurur ve başlangıç sayfasını açar. Sen gönder demeden hiçbir şey çalışmaz.',
    delete: 'Beceriyi kaldır',
    saveEmpty: 'Önce bir istem yaz, sonra beceri olarak kaydet.',
  },
  grants: {
    remember: '“{skill}” için bunu hatırla',
    rememberHint: 'Yalnızca bu site ve bu tür işlem için, {days} gün boyunca. Beceriyi silmek bunu geri alır.',
    remembered: '“{skill}” için bu izin kaydedildi.',
    used: '“{skill}” için kaydettiğin izinle yapıldı.',
  },
  commerce: {
    confirm: 'Bunun para harcayabileceğini anlıyorum',
    caution: 'Otomatik satın alma hukuken tartışmalı (Amazon - Perplexity davası). Bazı siteler şartlarında bunu yasaklıyor; güvenmeden önce kontrol et.',
  },
  scope: {
    grant: 'Bu görev bitene kadar {host} üzerinde buna izin ver',
    hint: 'Yalnızca bu site ve bu tür işlem için, yalnızca bu görev sürerken. Para, parola ve silme işlemleri her zaman sorar.',
  },
  planGrant: 'Onaylamak, bu planın adı geçen sitelerdeki rutin adımlarını yalnızca bu görev için kapsar. Para, parola ve silme işlemleri yine her seferinde sorar.',
  background: 'Arka planda devam et',
  evidence: {
    verified: 'Doğrulandı',
    verifiedHint: 'Ajan işlemi yaptıktan sonra sayfada teyit etti.',
    attempted_unverified: 'Teyit edilmedi',
    attempted_unverifiedHint: 'Ajan bunu yaptı ama sonucu teyit edemedi. Kendin kontrol etmen iyi olur.',
    contradicted: 'Çelişkili',
    contradictedHint: 'Sayfa, ajanın bildirdiğiyle çelişti. Buna güvenme.',
  },
  historyPage: {
    title: 'Ajan geçmişi',
    search: 'Konuşmalarda ara',
    empty: 'Henüz konuşma yok',
    loading: 'Yükleniyor...',
    clear: 'Tümünü temizle',
    delete: 'Kaldır',
    openInPanel: 'Panelde aç',
    turns: 'tur',
    detailEmpty: 'Önizlemek için bir konuşma seçin.',
  },
  send: 'Gönder',
  stop: 'Durdur',
  pause: 'Duraklat',
  resume: 'Devam et',
  steer: 'Talimat gönder (çalışan göreve eklenir)',
  steerPlaceholder: 'Çalışırken bir talimat ekle…',
  paused: 'Duraklatıldı',
  modelLabel: 'Model',
  noModels: 'Uygun model yok',
  // Bestecinin çalışma yapılandırması (dişli simgesi): sağlayıcı · model · otonomi · çaba, her biri kendi satırı.
  config: 'Yapılandırma',
  provider: 'Sağlayıcı',
  // Model açılır menüsündeki "sabitleme yok" seçeneği — çalışma göreve göre otomatik yönlendirilir.
  modelAuto: 'Otomatik',
  autonomyLabel: 'Otonomi',
  // Otonomi 'ask' değilken gösterilen amber risk bandı (seviyeye duyarlı).
  risk: {
    actTitle: 'Sormadan uyguluyor',
    actBody: 'Rutin adımları kendi çalıştırır, ama yıkıcı veya finansal işlemler için yine durur.',
    autoTitle: 'Tam otonom',
    autoBody: 'Bu sayfada ve internette durmadan işlem yapar — zaman çizelgesini gözden geçir.',
  },
  // Kademeli otonomi seviyeleri (besteci açılır menüsü).
  autonomy: {
    ask: { title: 'Uygulamadan önce sor', desc: 'Planı ve durum değiştiren her adımı gözden geçirir.' },
    act: {
      title: 'Sormadan uygula',
      desc: 'Rutin adımları çalıştırır; yıkıcı veya finansal işlemler için yine sorar.',
    },
    auto: { title: 'Otomatik', desc: 'Tam otonom — durmadan işlem yapar.' },
    dangerous: { title: 'Tehlikeli', desc: 'Yakında — güvenlik kilitleri olmayan kısıtsız mod.' },
  },
  // Akıl yürütme çabası ön ayarları (besteci çaba açılır menüsü). Yüksek çaba → daha derin akıl + daha çok token.
  effort: {
    title: 'Çaba',
    low: { title: 'Düşük', desc: 'En hızlı ve en ucuz — kısa akıl yürütme.' },
    medium: { title: 'Orta', desc: 'Dengeli akıl yürütme ve maliyet.' },
    high: { title: 'Yüksek', desc: 'Daha derin akıl yürütme (varsayılan).' },
    xhigh: { title: 'Çok yüksek', desc: 'Genişletilmiş akıl yürütme, daha uzun yanıtlar.' },
    max: { title: 'Azami', desc: 'Azami akıl yürütme ve token bütçesi.' },
  },
  // S6: sertleştirilmiş okuma anahtarı. Varsayılan kapalı — tarayıcı ajanı sayfa verisinin çoğunu meşru
  // olarak okumak zorunda, yani bu ayar bir miktar yeteneği daha küçük bir giriş yüzeyiyle takas eder.
  strictGuard: {
    title: 'Sertleştirilmiş okuma',
    desc: 'Ajan sayfaları okumadan önce kişisel verileri temizle. Daha güvenli, ama görevin ihtiyaç duyduğu ayrıntıları gizleyebilir.',
    on: 'Açık',
    off: 'Kapalı',
  },
  // Katlanabilir akıl yürütme bölümü (ajanın plan hedefi + adım gerekçeleri).
  reasoning: {
    title: 'Akıl yürütme',
    show: 'Göster',
    hide: 'Gizle',
  },
  // Markdown kod bloklarındaki kopyala düğmesi.
  copy: 'Kopyala',
  // Sohbet akışı — her tur, kullanıcının mesajı ve ardından ajanın yanıtı.
  thread: {
    you: 'Sen',
    working: 'Çalışıyor…',
  },
  // Besteci ek chip'leri (seçili metin / dosya / ekran görüntüsü).
  attach: {
    selection: 'Seçili metin',
    file: 'Dosya',
    screenshot: 'Ekran görüntüsü',
    removeLabel: 'Eki kaldır',
    selectionEmpty: 'Sayfada seçili metin yok.',
    addSelection: 'Seçili metni ekle',
    addFile: 'Dosya ekle',
    addScreenshot: 'Ekran görüntüsü ekle',
    lines: 'satır',
  },
  // "Göreve çevir" — bu sohbeti tekrarlı bir göreve dönüştür (bkz. Zamanlanmış Görevler eklentisi).
  scheduleTask: {
    action: 'Göreve çevir',
    title: 'Zamanlanmış göreve çevir',
    desc: 'Bu sohbeti zamanlanmış olarak ya da sayfa değişince otomatik çalıştır.',
    name: 'Ad',
    instruction: 'Talimat',
    instructionHint: 'Bu görev her çalıştığında ajanın ne yapacağı.',
    targetUrl: 'Hedef sayfa (URL)',
    schedule: 'Zamanlama',
    presetContinuous: 'Sürekli (5 dakikada bir)',
    presetInterval: 'Aralıklı',
    presetPageChange: 'Sayfa değişince',
    everyMinutes: 'Her (dakika)',
    minInterval: 'En az 5 dakika.',
    autonomy: 'Aksiyon gerektiğinde',
    autonomyNotify: 'Bana bildir',
    autonomySameOrigin: 'Bu sitede aksiyon al',
    save: 'Görevi kaydet',
    cancel: 'Vazgeç',
    nameRequired: 'Göreve bir ad verin.',
    instructionRequired: 'Görev için bir talimat ekleyin.',
    saveFailed: 'Görev kaydedilemedi.',
    saved: '✓ Görev kaydedildi',
    openManager: 'Görevleri aç',
  },
  // Tam tanılama paketini ~/tepegoz klasörüne aktar (başlıktaki yıldız) — sohbet dökümü + sekme DOM/PNG
  // anlık görüntüleri, bellek, günlük ve manifest; bir agent koşusunu analiz etmek için.
  exportLog: {
    action: 'Tanılama paketini tepegoz’a kaydet',
    saved: '✓ Paket kaydedildi',
    failed: 'Tanılama paketi kaydedilemedi.',
  },
};
