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
    loading: 'Yükleniyor…',
  },
  window: {
    minimize: 'Küçült',
    maximize: 'Büyüt',
    restore: 'Önceki boyut',
    close: 'Kapat',
  },
  permissions: {
    trust_profile_trusted: {
      title: 'Güven ayarınız izin verdi',
      why: 'Bu siteyi güvenilir olarak işaretlediniz, bu yüzden sıradan değişiklikler sorulmadan yapılıyor. Silme, para harcama ve sayfanın kendi içeriğinden gelen her şey yine de soruluyor.',
      whatYouCanDo:
        "Bunu artık istemiyorsanız sitenin güven ayarını Ayarlar'dan değiştirin veya kaldırın.",
    },
    trust_profile_restricted: {
      title: 'Bu siteyi kısıtladığınız için soruluyor',
      why: 'Bu siteyi kısıtlı olarak işaretlediniz, bu yüzden burada her şey size soruluyor — normalde sessizce geçecek okumalar dahil.',
      whatYouCanDo:
        "Beklediğiniz bir şeyse onaylayın. Sorulmasını istemiyorsanız sitenin ayarını Ayarlar'dan değiştirin.",
    },
    egress_possible_secret: {
      title: 'Onay — bu bir kimlik bilgisi içeriyor olabilir',
      why: 'Ajanın bu cihazdan göndermek üzere olduğu istekte bir API anahtarı, token veya özel anahtar gibi görünen bir şey var. Gerçek bir sır olabilir ya da ajanın okuması istenen ve yalnızca ona benzeyen sayfa metni olabilir.',
      whatYouCanDo:
        'Aşağıda işaretlenen değerleri kontrol edin. Herhangi biri gerçek bir kimlik bilgisiyse reddedin — gönderildikten sonra kontrolünüzden çıkar.',
    },
    read_allowed: {
      title: 'İzin verildi',
      why: 'Bu yalnızca sayfayı okuyor, hiçbir şeyi değiştirmiyor.',
      whatYouCanDo: 'Bir şey yapmanız gerekmiyor.',
    },
    sensitive_site_read: {
      title: 'Okumadan önce onay',
      why: 'Bu site hassas sayılıyor (bankacılık, kripto, parola veya sağlık), bu yüzden okumak bile önce size sorulur.',
      whatYouCanDo:
        'Bunu siz istediyseniz onaylayın. İstemediyseniz reddedin — ajanın bu sitede olmaması gerekir.',
    },
    sensitive_site_lockout: {
      title: 'Hassas sitede engellendi',
      why: 'İşlem, bankacılık/kripto/parola/sağlık sitesinde bir şeyi DEĞİŞTİRECEKTİ. Bu siteler yalnızca okumaya kilitlidir ve buradan hiçbir onay bu kilidi açamaz.',
      whatYouCanDo: 'İşlemi sayfada kendiniz yapın. Kilit bilinçlidir, onayla aşılamaz.',
    },
    tab_egress_blocked_read: {
      title: 'Onay — bu sekme ağa erişemiyor',
      why: 'Bu sekmenin bağlantısı şu anda engelli (bir VPN/Tor tüneli düştü veya bir ağ sızıntısı denetimi başarısız oldu), bu yüzden bu okuma sayfaya gerçekten ulaşmayacak.',
      whatYouCanDo:
        'Ajanın yine de denemesini istiyorsanız onaylayın (yalnızca başarısız olur) veya önce bağlantının düzelmesini bekleyin.',
    },
    tab_egress_blocked: {
      title: 'Engellendi — bu sekme ağa erişemiyor',
      why: 'Bu sekmenin bağlantısı şu anda engelli (bir VPN/Tor tüneli düştü veya bir ağ sızıntısı denetimi başarısız oldu). İşlem sorulmadan doğrudan reddedilir, çünkü zaten hiçbir şey gerçekleşmeyecekti.',
      whatYouCanDo:
        'Ayarlar → Ağ üzerinden bağlantıyı kontrol edin veya sekmeyi çalışan bir rotaya geçirip tekrar deneyin.',
    },
    tainted_side_effect: {
      title: 'Onay — talimatlar sayfadan geldi',
      why: 'Bu işlemin değerleri, ajanın okuduğu sayfa içeriğinden alındı; yani bir sayfa bunları yerleştirmiş olabilir. Prompt injection bir okumayı tam da böyle eyleme çevirir.',
      whatYouCanDo:
        'Aşağıdaki argümanları SİZİN istediğinizle karşılaştırın. Sizden değil sayfadan gelmiş görünen bir şey varsa reddedin.',
    },
    state_change_confirm: {
      title: 'Değişikliği onaylayın',
      why: 'Bu işlem yalnızca okumuyor, bir şeyi değiştiriyor.',
      whatYouCanDo: 'İstediğinizle örtüşüyorsa onaylayın.',
    },
    destructive_confirm: {
      title: 'Onay — bu siler veya üzerine yazar',
      why: 'İşlem veriyi kaldırıyor ya da değiştiriyor ve ajan tarafından geri alınamıyor.',
      whatYouCanDo: 'Onaylamadan önce hedefi dikkatle okuyun. Bu yolda geri alma yok.',
    },
    financial_confirm: {
      title: 'Onay — bu para harcıyor',
      why: 'İşlem para transfer ediyor veya bir satın almayı taahhüt ediyor.',
      whatYouCanDo: 'Onaylamadan önce tutarı ve alıcıyı kontrol edin.',
    },
    unknown_risk_confirm: {
      title: 'Onay — risk beyan edilmemiş',
      why: 'Bu araç ne kadar tehlikeli olduğunu belirtmiyor, bu yüzden tehlikeliymiş gibi davranılıyor.',
      whatYouCanDo: 'Aracı ve argümanları tanıyorsanız onaylayın.',
    },
    code_exec_read_journaled: {
      title: 'İzin verildi ve kaydedildi',
      why: 'Ajan yalnızca okuyan bir kod çalıştırdı. Sonradan inceleyebilmeniz için günlüğe yazıldı.',
      whatYouCanDo: 'Bir şey yapmanız gerekmiyor. Çalışma günlükte görünür.',
    },
    code_exec_write_disabled: {
      title: 'Engellendi — yazan kod çalıştırma kapalı',
      why: 'Model tarafından yazılan ve yazma yapabilen kod bu sürümde kapalıdır; onaydan bağımsızdır.',
      whatYouCanDo: 'Henüz kullanılabilir değil. Burada vereceğiniz hiçbir onay bunu açmaz.',
    },
  },
  errors: {
    translateNoLocalModel:
      "Cihaz üzerinde çeviri modeli kurulu değil. Ayarlar'dan bir tane kurun ya da bulut sağlayıcıya geçin.",
    translateNoCloudProvider:
      "Yapılandırılmış bir bulut yapay zekâ anahtarı yok. Ayarlar → Sağlayıcılar'dan bir tane ekleyin.",
    localModelNotLoaded: 'Bu yerel model yüklü değil. Yükleyip yeniden deneyin.',
    networkNoSuchConnection: 'Bu bağlantı artık mevcut değil.',
    networkChainLoop:
      'Bu bağlantılar birbirine geri zincirleniyor. Birinin üst bağlantısını değiştirip yeniden deneyin.',
    networkSecretsUnavailable:
      'İşletim sistemi anahtarlığı kullanılamıyor, bu yüzden WireGuard profili güvenle saklanamaz.',
    networkBinaryNotFound:
      'Bu yardımcı program seçtiğiniz klasörde bulunamadı. Dosyayı doğrudan içeren klasörü seçin.',
    networkTunnelFailed: 'Tünel açılamadı. Profili kontrol edip yeniden deneyin.',
    badRequest: 'Geçersiz istek',
    notFound: 'Bulunamadı',
    downloadNotFound: 'Bu indirme artık listede yok.',
    downloadNotReleased: 'İndirmeyi önce bildirimden açın — hâlâ karantinada.',
    downloadNotReadyToRelease: 'Bu indirme henüz serbest bırakılmaya hazır değil.',
    downloadBlocked: 'Bu indirme güven politikası tarafından engellendi.',
    downloadFileMissing: 'İndirilen dosya diskte bulunamadı.',
    downloadNoActivePage: 'İndirmeye başlamadan önce bir web sayfası açın.',
    uploadNotFound: 'Bu yükleme artık listede yok.',
    uploadNoActivePage: 'Yüklemeye başlamadan önce bir web sayfası açın.',
    unsupportedCommand: 'Bu işlem burada desteklenmiyor.',
    noApiKey: 'API anahtarı tanımlı değil. Ayarlar → Sağlayıcılar bölümünden ekleyin.',
    unknownModel: 'Bu model artık kullanılamıyor.',
    modelNotInstalled: 'Bu model henüz kurulu değil.',
    modelDownloadFailed: 'Model indirilemedi. Bağlantınızı kontrol edip tekrar deneyin.',
    inferenceUnavailable: 'Cihaz üzerinde çıkarım bu makinede kullanılamıyor.',
    imageTooLarge: 'Bu görsel çok büyük (en fazla 8 MB).',
    unsupportedImageType: 'Bu görsel biçimi desteklenmiyor.',
    storageUnavailable: 'Depolama şu anda kullanılamıyor.',
    databaseUnavailable: 'Yerel veritabanı şu anda kullanılamıyor.',
    extensionDisabled: 'Bu eklenti devre dışı. Eklentiler bölümünden etkinleştirin.',
    recordingInProgress: 'Zaten devam eden bir kayıt var.',
    recordingSensitiveSite:
      'Hassas sitelerde kayıt yapılamaz (bankacılık, kripto, parola, sağlık).',
    agentRunInProgress: 'Bu grup için zaten çalışan bir ajan görevi var.',
    dictionaryNotFound: 'Bu sözlük artık kullanılamıyor.',
    dictionaryDownloadFailed: 'Sözlük indirilemedi.',
    dictionaryChecksumMismatch: 'İndirilen sözlük bütünlük kontrolünden geçemedi.',
    catalogEmpty: 'Yerleşik eklentiler yüklenemedi.',
    taskNotFound: 'Bu görev artık mevcut değil.',
    keyNotFound: 'Bu anahtar artık mevcut değil.',
    forbidden: 'Eylem politika tarafından engellendi',
    unauthorized: 'Kimlik doğrulama gerekli',
    badState: 'Bu işlem için geçersiz durum',
    upstreamDown: 'Servis kullanılamıyor',
    renderFailure: 'Bir şeyler ters gitti — lütfen uygulamayı yeniden başlatın',
  },
};
