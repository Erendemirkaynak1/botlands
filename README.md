# Universal Bot Control Center (UBCC)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-informational)
![Status](https://img.shields.io/badge/status-planning-orange)

**Universal Bot Control Center (UBCC)**, farklı dillerde ve teknolojilerde yazılmış yerel botları ve otomasyon betiklerini tek bir masaüstü arayüzünden yönetmek için tasarlanan açık kaynaklı, çapraz platform bir uygulamadır.

> Proje şu anda planlama/ilk mimari aşamasındadır. Bu depo henüz çalışan bir uygulama veya yayınlanmış kurulum paketi içermez.

## Amaç

Kullanıcıların kendi bilgisayarlarında bulunan Discord/Telegram botlarını, web scraping görevlerini, Python ve Node.js betiklerini, Windows batch dosyalarını ve diğer yerel çalıştırılabilir programları tek merkezden:

- Eklemesi, düzenlemesi ve kaldırması
- Başlatması, durdurması ve yeniden başlatması
- Devre dışı bırakması ve durumlarını izlemesi
- stdout/stderr çıktılarını canlı konsolda görmesi
- CPU, RAM ve çalışma süresi gibi temel ölçümleri takip etmesi

hedeflenmektedir.

## Teknoloji yığını

| Katman | Teknoloji | Sorumluluk |
| --- | --- | --- |
| Masaüstü | Electron.js | Pencere, uygulama yaşam döngüsü ve paketleme |
| Ana süreç | Node.js | Dosya sistemi, süreç yönetimi ve IPC |
| Güvenli köprü | Electron Preload + contextBridge | Renderer'a yalnızca izin verilen API'leri açmak |
| Arayüz | HTML5, CSS3, Vanilla JavaScript | Hafif, okunabilir ve framework bağımsız UI |
| Yerel veri | electron-store (JSON tabanlı) | Bot tanımları ve kullanıcı tercihleri |
| Sistem ölçümü | systeminformation | CPU/RAM ve süreç istatistikleri |
| Süreç ağacı | tree-kill | Alt süreçleri platformlar arasında sonlandırmak |
| Dağıtım | Electron Forge | Windows, Linux ve macOS paketleri |

## Mimari ve güvenlik

Uygulama üç ana güven sınırına ayrılır:

1. **Main process:** Bot komutlarını doğrular, süreçleri başlatır/durdurur, yapılandırmayı saklar ve kaynak ölçümlerini toplar.
2. **Preload:** `contextBridge` ile dar kapsamlı, açıkça tanımlanmış fonksiyonları Renderer'a sunar.
3. **Renderer:** Sadece arayüzü yönetir. Node.js modüllerine, dosya sistemine veya ham IPC'ye doğrudan erişmez.

Güvenlik varsayılanları:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- Yerel içerik ve kısıtlayıcı Content Security Policy
- IPC kanal ve payload doğrulaması; her istekte beklenen pencere/sender kontrolü
- Preload üzerinden yalnızca izin verilen fonksiyonlar; ham `ipcRenderer` API'si asla açılmaz
- Süreç başlatırken `shell: false`; çalıştırılabilir dosya ve argümanlar ayrı alanlarda tutulur
- Çalışma dizini, executable yolu ve ortam değişkenleri doğrulanır
- Bot komutları kullanıcının kendi makinesinde kod çalıştırır. Uygulama, eklenen betiklerin güvenilir olduğunu varsaymaz; kullanıcıya açık uyarı gösterir.

**Önemli:** Bu araç yerel programları çalıştırmak için tasarlanır. Kullanıcı tarafından eklenen botlar tam kullanıcı izinleriyle çalışabilir. Güvenilmeyen kodu çalıştırmak için güvenli bir sandbox sağlamaz. Ortam değişkenleri/token'lar yerel depoda düz metin olarak saklanmamalı; ilk sürümde hassas değerler için işletim sistemi kimlik bilgisi kasası entegrasyonu değerlendirilmelidir.

## Önerilen proje yapısı

```text
botlands/
├── src/
│   ├── main/
│   │   ├── index.js                 # Electron giriş noktası ve BrowserWindow
│   │   ├── ipc/
│   │   │   ├── index.js             # IPC handler kayıtları
│   │   │   ├── bot-handlers.js      # Bot CRUD ve lifecycle kanalları
│   │   │   └── system-handlers.js   # Sistem ölçümü kanalları
│   │   ├── services/
│   │   │   ├── bot-manager.js       # Bot süreçlerinin yaşam döngüsü
│   │   │   ├── process-monitor.js   # CPU/RAM/PID ölçümleri
│   │   │   └── log-manager.js       # stdout/stderr akışı ve log tamponu
│   │   ├── storage/
│   │   │   └── bot-store.js         # Yerel JSON yapılandırması
│   │   └── utils/
│   │       ├── command-parser.js    # Komut/executable/argüman ayrıştırma
│   │       ├── path-utils.js        # Platforma uygun yol yardımcıları
│   │       └── validation.js        # Girdi doğrulama
│   ├── preload/
│   │   └── index.js                 # contextBridge API yüzeyi
│   └── renderer/
│       ├── index.html
│       ├── assets/
│       │   └── icons/
│       ├── css/
│       │   ├── reset.css
│       │   ├── variables.css
│       │   ├── layout.css
│       │   └── components.css
│       └── js/
│           ├── app.js
│           ├── state.js
│           ├── api.js               # window.ubcc üzerinden preload çağrıları
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
├── .github/
│   └── workflows/
│       └── build.yml
├── forge.config.js
├── package.json
├── .gitignore
├── LICENSE
├── README.md
└── roadmap.md
```

## Geliştirme ortamı

### Gereksinimler

- Node.js **22.17 veya üzeri** (LTS önerilir)
- npm (Node.js ile gelir)
- Git
- Windows, Linux veya macOS
- Linux dağıtımına göre Electron'un ihtiyaç duyduğu sistem kütüphaneleri

### Kurulum

```bash
git clone https://github.com/Erendemirkaynak1/botlands.git
cd botlands
npm install
npm start
```

Bu komutlar, `package.json` ve uygulama giriş dosyaları eklendikten sonra kullanılacaktır. Proje planlama aşamasında olduğundan şu anda çalıştırılabilir bir uygulama mevcut değildir.

### Önerilen paketler

Üretim bağımlılıkları:

```bash
npm install electron-store systeminformation tree-kill
```

Geliştirme bağımlılıkları:

```bash
npm install --save-dev electron @electron-forge/cli \
  @electron-forge/maker-squirrel \
  @electron-forge/maker-dmg \
  @electron-forge/maker-deb \
  @electron-forge/maker-zip
```

Electron Forge için önerilen npm script'leri:

```json
{
  "scripts": {
    "start": "electron-forge start",
    "package": "electron-forge package",
    "make": "electron-forge make"
  }
}
```

### Paketleme

```bash
npm run package
npm run make
```

Electron Forge, yapılandırılmış maker'lara göre işletim sistemine uygun dağıtım çıktıları üretir. Windows, macOS ve Linux paketlerinin güvenilir biçimde üretilmesi için CI üzerinde her işletim sisteminde ayrı build çalıştırılması önerilir. macOS imzalama/noter onayı ve Windows kod imzalama, yayın sürecinde ayrıca yapılandırılmalıdır.

## Kullanım akışı (hedeflenen)

1. Kullanıcı bot adı, çalışma dizini, executable, argümanlar ve ortam değişkenlerini tanımlar.
2. Main process girdileri doğrular ve bot tanımını yerel depoya kaydeder.
3. Başlatma isteği IPC üzerinden Main process'e iletilir.
4. Bot Manager, süreç için `spawn(executable, args, { cwd, env, shell: false })` kullanır.
5. stdout/stderr olayları güvenli IPC kanallarıyla arayüze aktarılır.
6. Monitor, PID üzerinden kaynak kullanımını toplar ve durum güncellemelerini yayınlar.
7. Durdurma/yeniden başlatma sırasında süreç ağacı platforma uygun biçimde yönetilir.

## Platform notları

- **Windows:** `.exe`, `.cmd` ve `.bat` çalıştırma davranışları birbirinden farklıdır. Batch dosyaları için açıkça tanımlanmış Windows adapter'ı kullanılmalı; shell üzerinden çalıştırma gerektiğinde argüman kaçışlama ve güvenlik sınırları ayrıca ele alınmalıdır.
- **Linux/macOS:** Çalıştırılabilir dosya izinleri, sinyaller ve süreç grupları dikkate alınmalıdır.
- Çocuk süreçleri başlatan botlarda yalnızca ana PID'yi öldürmek yeterli olmayabilir. Süreç ağacının sonlandırılması ve kapanma zaman aşımı test edilmelidir.
- `python` gibi komutlar PATH üzerinden çözülebilir; kullanıcıya seçilen executable'ın çözümlenen yolu gösterilmelidir.

## Katkı ve lisans

Katkılar memnuniyetle karşılanır. Büyük değişikliklerden önce bir issue açarak öneriyi tartışın. Kod katkılarında okunabilirlik, platform testleri ve güvenlik kontrolleri önceliklidir.

Bu proje MIT lisansı ile dağıtılır. Ayrıntılar için [LICENSE](LICENSE) dosyasına bakın.

## Teknik kaynaklar

- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Electron Forge](https://www.electronforge.io/)
- [Node.js child_process](https://nodejs.org/api/child_process.html)
- [systeminformation](https://www.npmjs.com/package/systeminformation)
- [electron-store](https://www.npmjs.com/package/electron-store)
- [tree-kill](https://www.npmjs.com/package/tree-kill)
