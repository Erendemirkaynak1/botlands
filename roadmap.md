# UBCC — Geliştirme Yol Haritası

**Proje:** Universal Bot Control Center  
**Depo:** [Erendemirkaynak1/botlands](https://github.com/Erendemirkaynak1/botlands)  
**Durum:** Planlama / Mimari başlangıç  
**Hedef:** Windows öncelikli, Linux ve macOS destekli güvenli ve modüler masaüstü bot yöneticisi.

Bu belge MVP kapsamını, önerilen klasör yapısını, güvenlik sınırlarını, bağımlılıkları ve geliştirme sırasını tanımlar. Bu aşamada uygulama kodu yazılmıyor; önce mimari ve geliştirme zemini netleştiriliyor.

---

## 1. Ürün hedefi ve MVP kapsamı

Kullanıcı, kendi bilgisayarında bulunan farklı teknolojilerle yazılmış yerel programları tek arayüzden yönetebilmelidir.

### MVP fonksiyonları

- [ ] Bot ekleme, düzenleme, silme ve devre dışı bırakma
- [ ] Bot tanımı: ad, çalışma dizini, executable, argüman listesi, ortam değişkenleri
- [ ] Start / Stop / Restart
- [ ] Durum: stopped, starting, running, stopping, exited, errored, disabled
- [ ] PID, başlangıç zamanı ve çalışma süresi
- [ ] stdout ve stderr canlı log akışı
- [ ] Log tamponu sınırı ve temizleme/indirilebilir log
- [ ] Temel CPU ve RAM ölçümü
- [ ] Uygulama kapanırken çalışan botlar için kullanıcı tercihi (çalışır bırak / durdur / onay sor)
- [ ] Windows, Linux ve macOS için süreç başlatma/durdurma adaptörleri
- [ ] Yerel JSON tabanlı yapılandırma
- [ ] Hata mesajları, doğrulama ve boş durum arayüzleri

### MVP dışında (sonraki sürümler)

- Bot grupları ve etiketler
- Zamanlanmış başlatma/durdurma ve otomatik yeniden başlatma politikaları
- Bildirimler ve sağlık kontrolleri
- Uzak sunucu/SSH yönetimi
- Eklenti sistemi ve özel bot adaptörleri
- Gelişmiş grafikler ve log arama
- Şifreli secret store / OS keychain entegrasyonu
- İçe/dışa aktarma ve yedekleme

---

## 2. Teknoloji kararları

| Katman | Karar | Gerekçe |
| --- | --- | --- |
| Desktop | Electron.js | Tek kod tabanıyla masaüstü dağıtımı |
| Runtime | Node.js | child_process, fs, path ve sistem API'leri |
| UI | HTML5 + CSS3 + Vanilla JS | Basit, okunabilir, framework bağımlılığı yok |
| IPC | ipcMain/ipcRenderer + contextBridge | Dar kapsamlı, doğrulanabilir API |
| Storage | electron-store | JSON tabanlı yerel ayarlar |
| Metrics | systeminformation | Platformlar arası sistem ve süreç ölçümleri |
| Process tree | tree-kill + platform adaptörleri | Alt süreçleri de durdurabilmek |
| Packaging | Electron Forge | Paketleme ve maker entegrasyonu |
| Tests | Node test runner veya Vitest | Unit ve integration testleri |

### Node ve Electron sürüm politikası

- Node.js 22.17+ LTS geliştirme ortamı olarak hedeflenir.
- Electron ve Forge sürümleri kurulum sırasında güncel kararlı sürümlerden seçilir ve lockfile commit edilir.
- Güvenlik güncellemeleri düzenli takip edilir; Electron/Chromium sürümleri eskimeye bırakılmaz.

---

## 3. Klasör ve dosya yapısı

```text
botlands/
├── src/
│   ├── main/
│   │   ├── index.js
│   │   ├── ipc/
│   │   │   ├── index.js
│   │   │   ├── bot-handlers.js
│   │   │   └── system-handlers.js
│   │   ├── services/
│   │   │   ├── bot-manager.js
│   │   │   ├── process-monitor.js
│   │   │   └── log-manager.js
│   │   ├── storage/
│   │   │   └── bot-store.js
│   │   └── utils/
│   │       ├── command-parser.js
│   │       ├── path-utils.js
│   │       └── validation.js
│   ├── preload/
│   │   └── index.js
│   └── renderer/
│       ├── index.html
│       ├── assets/icons/
│       ├── css/
│       │   ├── reset.css
│       │   ├── variables.css
│       │   ├── layout.css
│       │   └── components.css
│       └── js/
│           ├── app.js
│           ├── state.js
│           ├── api.js
│           ├── views/
│           │   ├── dashboard.js
│           │   ├── bot-list.js
│           │   ├── bot-editor.js
│           │   └── console.js
│           └── components/
│               ├── bot-card.js
│               ├── status-badge.js
│               └── modal.js
├── tests/
│   ├── unit/
│   └── integration/
├── docs/
│   ├── architecture.md
│   └── security.md
├── .github/workflows/build.yml
├── forge.config.js
├── package.json
├── .gitignore
├── LICENSE
├── README.md
└── roadmap.md
```

### Modül sorumlulukları

- **main/index.js:** BrowserWindow oluşturur, güvenlik ayarlarını yapar, servisleri başlatır.
- **bot-manager.js:** Bot kayıtları ve child process yaşam döngüsünün tek sahibi olur.
- **process-monitor.js:** PID bazlı CPU/RAM ölçümü ve periyodik durum güncellemesi.
- **log-manager.js:** stdout/stderr dinleme, satır bazlı akış, tampon sınırı ve log temizleme.
- **bot-store.js:** Şema doğrulaması yapılmış bot kayıtlarını saklar.
- **preload/index.js:** Renderer için izinli API fonksiyonlarını expose eder.
- **renderer/js/api.js:** UI ile preload API'si arasında tek erişim noktası.
- **ipc/**: Kanal adları, payload doğrulama ve sender kontrolü.

---

## 4. Main ↔ Preload ↔ Renderer iletişim mimarisi

### Veri akışı

```text
Renderer UI
   │ window.ubcc.bots.start(botId)
   ▼
Preload (contextBridge)
   │ ipcRenderer.invoke("bots:start", botId)
   ▼
Main IPC handler
   │ doğrula: sender + payload + bot durumu
   ▼
BotManager / Store / Monitor
   │ sonuç ve olaylar
   ▼
Main → webContents.send("bots:status", snapshot)
   ▼
Preload callback wrapper
   ▼
Renderer UI güncellenir
```

### BrowserWindow güvenlik ayarları

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`
- Yerel HTML dosyaları; uzak web içeriği yüklenmez.
- Kısıtlayıcı CSP (ör. `default-src 'self'; script-src 'self'; style-src 'self'`).
- Pencere navigasyonu ve yeni pencere açılması engellenir veya allowlist ile sınırlandırılır.
- IPC handler'ları yalnızca beklenen BrowserWindow webContents kaynağından gelen mesajları kabul eder.

### Preload API taslağı

Renderer'a ham ipcRenderer veya Node API'si açılmaz. Yalnızca işlev bazlı API:

- `bots.list()`
- `bots.create(payload)`
- `bots.update(id, payload)`
- `bots.remove(id)`
- `bots.start(id)`
- `bots.stop(id)`
- `bots.restart(id)`
- `bots.setEnabled(id, enabled)`
- `bots.onStatus(callback)`
- `bots.onLog(callback)`
- `system.getMetrics()`
- `system.onMetrics(callback)`

Event abonelik fonksiyonları unsubscribe/cleanup fonksiyonu döndürmelidir. Callback'e Electron event nesnesi verilmez; yalnızca doğrulanmış veri aktarılır.

### IPC kanal standardı

- Request/response: `ipcRenderer.invoke` + `ipcMain.handle`
- Stream/event: `webContents.send` + preload'da güvenli callback wrapper
- Kanal isimleri sabit ve merkezi tanımlanır.
- Her payload boyut, tür, uzunluk ve izin verilen alanlar açısından doğrulanır.
- Renderer'dan gelen path, executable, args ve env değerleri güvenilir kabul edilmez.

---

## 5. Bot tanımı ve süreç yürütme tasarımı

### Önerilen bot şeması

```json
{
  "id": "uuid",
  "name": "Telegram Bot",
  "cwd": "C:/Bots/telegram-bot",
  "executable": "python",
  "args": ["main.py"],
  "env": {},
  "enabled": true,
  "createdAt": "ISO-8601"
}
```

Komutu tek bir shell metni olarak saklamak yerine executable ve args ayrı tutulur. Örnek: `python main.py` → executable: `python`, args: `["main.py"]`.

### Güvenli başlatma

- `spawn(executable, args, { cwd, env, shell: false, windowsHide: true })` yaklaşımı kullanılır.
- Shell metnini otomatik parçalamaya dayalı kırılgan parser yapılmaz; UI executable ve argümanları ayrı alanlarda toplar.
- Kullanıcıya executable seçme/göz atma akışı sağlanır.
- `cwd` var mı ve dizin mi kontrol edilir; executable çözümlemesi platforma uygun yapılır.
- Env değişken adları doğrulanır; uygulama içi kritik değişkenlerin üzerine yazılması engellenir.
- Botun çalıştırdığı kodun kullanıcı hesabının izinleriyle çalıştığı açıkça belirtilir.
- `.bat` / `.cmd` desteği Windows'a özel adapter ile ele alınır. Shell zorunluysa ayrı ve dikkatle doğrulanan bir yol kullanılır; genel amaçlı `shell: true` açılmaz.
- Linux/macOS executable izinleri kontrol edilir.
- Başlatma hataları, exit code, signal ve spawn error ayrı durumlar olarak modellenir.

### Durdurma ve yeniden başlatma

- Önce nazik kapatma sinyali gönderilir (platforma göre SIGTERM veya Windows adapter).
- Belirlenen süre içinde kapanmazsa süreç ağacı sonlandırılır.
- PID'nin yeniden kullanılması ihtimaline karşı süreç kimliği/başlangıç zamanı takibi yapılır.
- Aynı bot için eşzamanlı start/stop istekleri kilitlenir.
- App kapanırken bot davranışı kullanıcı ayarına bağlıdır.

---

## 6. Log ve kaynak izleme

### Log akışı

- stdout ve stderr ayrı kanal/etiketle gösterilir.
- Çok satırlı ve büyük çıktı parçaları satırlara ayrılır.
- UI donmasını önlemek için log tamponu ve batch render kullanılır.
- Bellek sınırsız büyümez; eski satırlar düşürülür.
- Hassas env değerleri loglarda maskelenmeye çalışılır; ancak botun kendi loglarına secret yazması tamamen engellenemez.

### CPU/RAM

- PID üzerinden systeminformation ile örnekleme.
- Ölçüm aralığı yapılandırılabilir ve makul varsayılanla başlar.
- CPU ölçümü örnekleme aralığı gerektiriyorsa ilk ölçüm başlangıç değeri kabul edilir.
- Süreç kapandıktan sonra ölçüm zamanlayıcısı temizlenir.
- Ölçüm alınamayan platform/izin durumları UI'da "N/A" olarak gösterilir.

---

## 7. Bağımlılıklar ve package.json kurulumu

### Runtime dependencies

- `electron-store`: JSON tabanlı yerel ayar/bot tanımı deposu.
- `systeminformation`: CPU, RAM ve süreç ölçümleri.
- `tree-kill`: Alt süreç ağacını sonlandırma için yardımcı araç.

### Development dependencies

- `electron`: Masaüstü runtime.
- `@electron-forge/cli`: Geliştirme, paketleme ve dağıtım komutları.
- `@electron-forge/maker-squirrel`: Windows installer.
- `@electron-forge/maker-dmg`: macOS DMG.
- `@electron-forge/maker-deb`: Debian/Ubuntu paketi.
- `@electron-forge/maker-zip`: ZIP dağıtımı.

Kurulum komutları:

```bash
# Runtime
npm install electron-store systeminformation tree-kill

# Development / packaging
npm install --save-dev electron @electron-forge/cli \
  @electron-forge/maker-squirrel \
  @electron-forge/maker-dmg \
  @electron-forge/maker-deb \
  @electron-forge/maker-zip
```

Forge tabanlı temel script'ler:

```json
{
  "scripts": {
    "start": "electron-forge start",
    "package": "electron-forge package",
    "make": "electron-forge make"
  }
}
```

`electron-store` güncel sürümleri ESM tabanlı olduğundan, uygulama modül formatı baştan belirlenmeli (öneri: `package.json` içinde `"type": "module"`). Forge config dosyasının uzantısı ve import biçimi bu tercihle uyumlu tutulmalıdır. Kurulumda `package-lock.json` commit edilerek bağımlılık sürümleri sabitlenir.

### Geliştirme adımları

1. Node.js 22.17+ ve Git kur.
2. Depoyu klonla.
3. Yukarıdaki bağımlılıkları yükle.
4. package.json içinde `main: "src/main/index.js"` ve `type: "module"` tanımla.
5. `forge.config.js` maker'larını yapılandır.
6. `npm start` ile yerel geliştirme başlat.
7. `npm run package` ile paket dizinini üret.
8. `npm run make` ile platforma uygun dağıtım dosyalarını üret.

---

## 8. Aşamalar ve kabul kriterleri

### Aşama 0 — Mimari ve proje temeli
- [x] Ürün kapsamı ve teknoloji yığını belirlendi
- [x] README ve roadmap hazırlandı
- [ ] package.json ve Forge yapılandırması
- [ ] Electron Main/Preload/Renderer iskeleti
- [ ] CSP, IPC güvenlik kontrolleri ve temel test altyapısı

**Kabul:** Uygulama boş bir güvenli pencereyle Windows/Linux/macOS geliştirme ortamında açılır.

### Aşama 1 — Bot kayıtları ve temel arayüz
- [ ] Dashboard ve bot listesi
- [ ] Bot ekleme/düzenleme formu
- [ ] JSON depolama ve şema doğrulama
- [ ] Enable/Disable
- [ ] Boş durum, hata ve form validasyonları

**Kabul:** Bot tanımları uygulama yeniden açıldığında korunur; hatalı girdiler kaydedilmez.

### Aşama 2 — Process Manager
- [ ] Start/Stop/Restart
- [ ] Durum makinesi ve PID takibi
- [ ] stdout/stderr akışı
- [ ] Spawn error ve exit code işleme
- [ ] Alt süreçleri sonlandırma
- [ ] Aynı botta eşzamanlı lifecycle çağrılarını engelleme

**Kabul:** Python/Node örnek botları başlatılır, logları görünür ve kapatıldığında süreç ağacı kalıntı bırakmaz.

### Aşama 3 — Monitoring ve konsol
- [ ] CPU/RAM ölçümü
- [ ] Çalışma süresi ve PID gösterimi
- [ ] Log tamponu/temizleme
- [ ] Seçili bot konsolu
- [ ] Ölçüm ve event cleanup

**Kabul:** Birden çok bot izlenirken arayüz akıcı kalır ve kaynak kullanımı sınırlı olur.

### Aşama 4 — Platform adaptörleri ve test
- [ ] Windows exe ve batch/cmd senaryoları
- [ ] Linux executable izinleri ve sinyaller
- [ ] macOS executable ve süreç sonlandırma
- [ ] Path boşlukları, Unicode ve uzun yollar
- [ ] Uygulama kapanışı ve orphan process testleri

**Kabul:** CI üzerinde Windows, Ubuntu ve macOS testleri geçer.

### Aşama 5 — Paketleme ve yayın
- [ ] Electron Forge maker yapılandırmaları
- [ ] GitHub Actions build matrisi
- [ ] Sürümleme ve changelog
- [ ] Windows imzalama, macOS notarization rehberi
- [ ] Kullanıcı ve geliştirici dokümantasyonu

**Kabul:** Her hedef işletim sistemi için tekrarlanabilir release artifact üretilir.

---

## 9. Test stratejisi

- Unit: command input validation, path normalization, state machine, config schema.
- Integration: fake child process ile start/stop/restart, stdout/stderr ve exit code.
- Security: renderer'dan keyfi IPC kanalı çağrılamaması, sender doğrulaması, shell injection testleri.
- Platform: Windows, Ubuntu ve macOS CI runner'larında süreç ağacı ve path testleri.
- Regression: hızlı ardışık start/stop, beklenmedik crash, uygulamanın kapanması, çok büyük log çıktısı.

Testlerde gerçek bot token'ı veya kişisel secret kullanılmaz.

---

## 10. Riskler ve alınacak önlemler

| Risk | Önlem |
| --- | --- |
| Kullanıcının kötü amaçlı script çalıştırması | Açık güven uyarısı; uygulama sandbox'ı iddia etmemek |
| Shell injection | Executable + args ayrımı; varsayılan shell:false |
| Alt süreçlerin açık kalması | Süreç ağacı yönetimi ve platform testleri |
| Secret'ların JSON'da kalması | İlk sürümde uyarı; sonraki sürümde OS keychain |
| Aşırı log/bellek kullanımı | Sınırlı tampon ve batch render |
| Platform davranış farkları | Adapter katmanı ve CI matrisi |
| Electron güvenlik açığı | Düzenli sürüm güncelleme ve bağımlılık denetimi |

---

## 11. Resmî ve teknik kaynaklar

- Electron Security: https://www.electronjs.org/docs/latest/tutorial/security/
- Electron Process Model: https://www.electronjs.org/docs/latest/tutorial/process-model
- Electron Forge: https://www.electronforge.io/
- Electron Packaging: https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging
- Node.js child_process: https://nodejs.org/api/child_process.html
- electron-store: https://github.com/sindresorhus/electron-store
- systeminformation: https://github.com/sebhildebrandt/systeminformation
- tree-kill: https://github.com/pkrumins/node-tree-kill

---

## 12. İlk uygulanacak teknik iş sırası

1. `package.json`, `forge.config.js` ve `.gitignore` oluştur.
2. Main process'te güvenli BrowserWindow kur.
3. Preload'da yalnızca `window.ubcc` API'sini expose et.
4. IPC kanal sabitleri ve sender/payload doğrulaması ekle.
5. Bot store şeması ve CRUD handler'larını oluştur.
6. Bot Manager state machine ve süreç adapter'ını geliştir.
7. Renderer dashboard, bot kartları, editör ve terminal görünümünü bağla.
8. Metrics, platform testleri ve Forge release pipeline'ını tamamla.
