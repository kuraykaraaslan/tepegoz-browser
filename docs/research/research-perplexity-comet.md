# Research — Perplexity Comet

> **Ne bu?** Kapalı kaynak bir doğrudan rakibin (Perplexity Comet, agentic tarayıcı) dış
> kaynaklardan derlenmiş incelemesi. **Kod okunmadı** — Comet açık kaynak değil; bu belge
> tamamen kamuya açık kaynaklara (ürün sayfaları, incelemeler, güvenlik araştırmaları)
> dayanır ve o kaynakların doğruluğu kadar doğrudur.
>
> **Durum:** kapalı kaynak · ücretsiz · cross-platform · Perplexity hesabı gerekir.
> **Tarih.** 2026-09-01. **Dil notu.** Türkçe.
> **Kardeş belgeler:** `docs/others/tepegoz-vs-*.md` (açık kaynak rakiplerin kod-okumalı
> karşılaştırmaları), `docs/research-*.md` (kapalı kaynak rakipler).

---

## Ne

Chromium tabanlı, Perplexity'nin cevap motorunu **tarayıcının içine** gömen agentic
tarayıcı. Asistan açık sekmelerin tamamına bağlam olarak erişiyor; form doldurma, sayfa
karşılaştırma, sepet hazırlama gibi işleri kopyala-yapıştır olmadan yapıyor. Perplexity
bunun üstüne **Perplexity Computer**'ı konumlandırıyor: tarayıcının üstünde duran, aynı
sınıf ajanı belgelere, Microsoft 365 dosyalarına ve (Mac'te "Personal Computer" özelliğiyle)
**yerel dosya ve uygulamalara** genişleten bir çalışma alanı.

Tepegöz'ün doğrudan rakibi sayılmasının sebebi bu: aynı tez (tarayıcı = ajanın gövdesi),
aynı kullanıcı vaadi (oturum-açık oturumda iş yap), ücretsiz ve yaygın.

## Nasıl çalışıyor (bilinen kadarıyla)

- **Bağlam:** açık sekmelerin tamamı asistanın bağlamı. Tepegöz'ün "aktif sekme + isteğe
  bağlı `tab_*` araçlarıyla erişim" modelinden daha geniş ve daha az açık bir sınır.
- **Aksiyon:** navigasyon, form doldurma, çok-adımlı iş akışı. **Ödemeyi bilerek
  tamamlamıyor** — sepete kadar götürüp kullanıcı incelemesi ve yetkilendirmesi istiyor.
- **Onay katmanı:** CometJacking olayından sonra eklenen **görsel onay katmanı** —
  hassas aksiyonlar öncesi açık kullanıcı onayı.
- **Sert sınır:** Zenity'nin yerel-dosya sızıntısı bulgusundan sonra ajanın `file://`
  yollarına erişimi **kod seviyesinde** bloke edildi (düzeltmenin etkili olduğu 2026-02-13'te
  doğrulandı).

## Güvenlik geçmişi — Tepegöz için en öğretici kısım

Comet, "agentic tarayıcı" kategorisinin canlı tehdit vakası:

1. **CometJacking (Ağu 2025, LayerX).** Kişisel veriyi uzak sunucuya sızdırabilen bir
   saldırı vektörü. Perplexity yama yayınladı + görsel onay katmanı ekledi.
2. **PerplexedBrowser (Zenity, 2026).** **Sıfır-tıklama** takvim daveti üzerinden dolaylı
   prompt injection → güvenlik kontrollerini atlayıp **yerel PC dosyalarını** sızdırma.
   Perplexity kritik olarak sınıfladı, `file://` erişimini kod seviyesinde kapattı.
3. **Bağımsız tavsiye:** güvenlik araştırmacıları "sağlık/hukuk/finans işlerini ayrı bir
   tarayıcıda tut, ajanın güvenilmeyen sayfalarda aksiyon almasına izin verme" diyor.

**Tepegöz'e doğrudan dersler:**

- **Sıfır-tıklama zincir gerçek.** Kullanıcı hiçbir şey tıklamadan, sadece bir sayfaya/
  takvim davetine maruz kalarak ajan kandırılabiliyor. Tepegöz'ün savunması burada
  yapısal olarak daha güçlü: model-öncesi `PolicyKernel` (ADR-0006) aksiyonu **modelin
  ikna edilip edilmediğine bakmadan** danger-class + taint + site üzerinden değerlendiriyor;
  `EgressFirewall` sızıntıyı çıkışta ayrıca tarıyor. Ama Tepegöz'ün ASR bataryası hâlâ
  **measurement-owed** — yani "bizde olmaz" denemez, ölçülmeli. Bu vaka S6'nın ASR
  sweep'inin neden claim-grade olması gerektiğinin en iyi gerekçesi.
- **`file://` dersi doğrudan uygulanabilir.** Tepegöz'de `file_*` araçları **tam sandbox'lı
  bir dosya sistemi** sunuyor (ADR-0022 file-operations sandbox). Comet'in yaşadığı şey
  tam olarak "web'den gelen talimat, yerel dosya okumaya döndü". Kontrol edilmesi gereken:
  `file_*` araçlarının danger-class'ı ve taint'li argümanla çağrıldığında forced-HITL
  davranışı — bir sayfadan türetilmiş dosya yolu asla sessizce okunmamalı.
- **"Ödemeyi tamamlama" çizgisi.** Comet'in sepete kadar götürüp durması, Tepegöz'ün
  `financial` danger-class + biyometrik kapı + `ext-agent` ticaret çift-onayı ile aynı
  içgüdü. Fark: Comet'te bu bir ürün kararı, Tepegöz'de bir kernel kuralı — otonomi
  seviyesi ne olursa olsun aşılamıyor.

## Tepegöz açısından alaka

| Eksen           | Comet                                               | Tepegöz                                             | Not                                                |
| --------------- | --------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------- |
| Form faktörü    | Chromium tarayıcı                                   | Electron tarayıcı                                   | Aynı kategori — en doğrudan rakip                  |
| Bağlam          | Tüm açık sekmeler                                   | Aktif sekme + açık `tab_*` çağrıları                | Tepegöz'ün sınırı daha dar/denetlenebilir          |
| Güvenlik modeli | Ürün-seviyesi onaylar + olay sonrası sert sınırlar  | Model-öncesi deterministik kernel + egress firewall | Tepegöz mimaride önde, ölçümde borçlu              |
| Ödeme           | Sepete kadar, ödeme kullanıcıda                     | `financial` sınıfı + biyometrik + çift-onay         | Aynı çizgi, farklı zorlama                         |
| Yerel dosya     | Mac'te "Personal Computer" ile yerel dosya/uygulama | `file_*` sandbox                                    | Comet'in en riskli genişlemesi; Tepegöz sandbox'lı |
| Yaygınlık       | Ücretsiz, cross-platform, büyük kullanıcı tabanı    | 1.0 öncesi                                          | Comet açık ara önde                                |

## Alınacaklar / Alınmayacaklar

**Alınacak (fikir olarak):**

- **Çok-sekme bağlamı bir özellik.** Tepegöz'de ajan tek sekmede başlıyor; "açık
  sekmelerin tamamına sor" (Chat modu için, salt-okunur) somut bir kullanıcı değeri ve
  `tab_list_items` + `browser_get_page` ile **yeni yetki gerektirmeden** yapılabilir.
  Sınır: her sekmenin içeriği ayrı ayrı untrusted sarmalanmalı.
- **Sepet-hazırla-ödeme-bekle** akışı zaten Tepegöz'ün ticaret kapısıyla uyumlu; UX olarak
  "buraya kadar getirdim, ödemeyi sen yap" bir tasarım deseni olarak netleştirilebilir.

**Alınmayacak:**

- **Yerel dosya/uygulama erişimini genişletmek** (Perplexity Computer'ın Mac özelliği).
  Tepegöz'ün `file_*` sandbox'ı bilinçli olarak dar; Comet'in bu genişlemeyle yaşadığı
  sıfır-tıklama sızıntısı tam olarak neden dar tutulduğunun kanıtı.
- **Olay-sonrası yamalama modeli.** Comet'in güvenlik hikâyesi "çıkar → araştırmacı bulur
  → yamala" döngüsü. Tepegöz'ün tezi bunun tersi: kernel önce, ölçüm sonra, iddia en son.

## Kaynaklar

- [PerplexedBrowser: Perplexity's Agent Browser Can Leak Your Personal PC Local Files — Zenity Labs](https://labs.zenity.io/p/perplexedbrowser-perplexity-s-agent-browser-can-leak-your-personal-pc-local-files)
- [Perplexity Comet: What It Does, Costs, and Risks (2026) — GEO Toolbox](https://geotoolbox.ai/blog/perplexity-comet)
- [The Agentic Browser Landscape in 2026: A Complete Guide — No Hacks](https://nohacks.co/blog/agentic-browser-landscape-2026)
- [Perplexity Comet 2026 Review — Medium/FlowFi](https://medium.com/@FlowFi/perplexity-comet-2026-review-is-it-safe-enough-for-daily-use-agentic-browser-7c5aed839bd3)
