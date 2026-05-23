# OzRouter

OzRouter, kodlama araçlarını, sohbet istemcilerini ve OpenAI uyumlu SDK'ları tek bir endpoint üzerinden yönlendiren yerel bir AI ağ geçididir. [OmniRoute](https://github.com/diegosouzapw/OmniRoute) projesinin bir fork'udur.

Yerel makineler, ev sunucuları ve özel geliştirme ortamları için tasarlanmıştır. OzRouter'ı bir kez çalıştırır, araçlarınızı `http://localhost:20128/v1` adresine bağlarsınız, ardından sağlayıcı hesaplarını, fallback kurallarını, kotaları, kullanım günlüklerini ve model yönlendirmelerini panelden yönetirsiniz.

OzRouter yalnızca GitHub üzerinden indirilebilir:

```txt
https://github.com/batuhanozkose/OzRouter
```

Bu proje için resmi bir npm paketi, kontainer imajı veya barındırılan bulut servisi yoktur.

## Özellikler

- Tek bir OpenAI uyumlu API endpoint'i: `http://localhost:20128/v1`.
- OpenAI, Anthropic, Gemini, yerel endpoint'ler, OAuth tabanlı kodlama araçları ve diğer uyumlu sağlayıcılar için çoklu sağlayıcı yönlendirme.
- Sağlayıcı başına birden fazla hesap ve otomatik fallback.
- Çapraz sağlayıcı fallback zincirleri için combo yönlendirme.
- Sağlayıcı bağlantıları için kota ve sağlık takibi.
- Sağlayıcılar, modeller, combolar, kullanım, günlükler, bellek, ayarlar ve CLI araç entegrasyonu için panel.
- OpenAI tarzı sohbet, Responses API akışları, Claude tarzı istekler ve Gemini tarzı istekler arasında protokol dönüştürme.
- Agent entegrasyonları için MCP ve A2A arayüzleri.
- Yapılandırılabilir veri dizini altında yerel SQLite depolama.

## Nasıl Çalışır

```txt
İstemci / Araç
    |
    | OpenAI uyumlu istek
    | http://localhost:20128/v1
    v
OzRouter
    |
    +-- Sağlayıcı hesabı 1
    +-- Sağlayıcı hesabı 2
    +-- Yerel model endpoint'i
    +-- Çapraz sağlayıcı combo fallback
```

Tipik istemciler:

- Codex
- Claude Code
- Cursor
- Cline
- OpenCode
- OpenWebUI
- Continue
- OpenAI uyumlu base URL'i destekleyen herhangi bir SDK veya uygulama

## Gereksinimler

Aşağıdaki Node.js sürümlerinden birini kullanın:

- Node.js `>=20.20.2 <21`
- Node.js `>=22.22.2 <23`
- Node.js `>=24.0.0 <25`

Önerilen:

- Node.js 24 LTS
- npm 10+
- Git
- `better-sqlite3` aracılığıyla SQLite desteği

Yerel sürümlerinizi kontrol edin:

```bash
node --version
npm --version
git --version
```

Node.js sürümünüz çalışma zamanı kontrolü tarafından reddedilirse, devam etmeden önce desteklenen bir sürümü yükleyin. Örneğin `nvm` ile:

```bash
nvm install 24
nvm use 24
```

## Kurulum

### Hızlı Kurulum (Önerilen)

Tek komut — depoyu klonlar, bağımlılıkları yükler, PM2'yi kurar, derler ve başlatır:

```bash
curl -fsSL https://raw.githubusercontent.com/batuhanozkose/OzRouter/main/scripts/install.sh | bash
```

Kurulum sihirbazı Node.js kontrolü, git, npm bağımlılıkları, ortam ayarları, sistem açılışında otomatik başlayan PM2 süreç yönetimi ve ilk derlemeyi gerçekleştirir. OzRouter'ı otomatik olarak PM2 üzerinden başlatır. Tamamlandıktan sonra şu adresi açın:

```txt
http://localhost:20128/dashboard
```

Varsayılan giriş, `.env` dosyanızdaki `INITIAL_PASSWORD` değeridir.

### Manuel Kurulum

Depoyu klonlayın:

```bash
git clone https://github.com/batuhanozkose/OzRouter.git
cd OzRouter
```

Bağımlılıkları yükleyin:

```bash
npm install
```

Yerel ortam dosyanızı oluşturun:

```bash
cp .env.example .env
```

Gizli anahtarlar oluşturun:

```bash
openssl rand -base64 48
openssl rand -hex 32
openssl rand -hex 32
```

`.env` dosyasını açın ve en az şu değerleri ayarlayın:

```env
PORT=20128
NEXT_PUBLIC_BASE_URL=http://localhost:20128
DATA_DIR=~/.ozrouter
INITIAL_PASSWORD=bu-sifreyi-degistirin
JWT_SECRET=<base64-gizli-anahtar>
API_KEY_SECRET=<hex-gizli-anahtar>
STORAGE_ENCRYPTION_KEY=<hex-gizli-anahtar>
```

Notlar:

- `INITIAL_PASSWORD`, ilk panel giriş şifresidir.
- `JWT_SECRET`, panel oturumlarını imzalar.
- `API_KEY_SECRET`, yerel API anahtarlarını imzalar/oluşturur.
- `STORAGE_ENCRYPTION_KEY`, hassas yerel bağlantı alanlarını korur.
- `.env` dosyasını gizli tutun. Depoya eklemeyin.

## Geliştirme Modunda Çalıştırın

Uygulamayı başlatın:

```bash
npm run dev
```

Paneli açın:

```txt
http://localhost:20128/dashboard
```

İstemcilerde şu API base URL'ini kullanın:

```txt
http://localhost:20128/v1
```

İlk giriş:

1. Paneli açın.
2. `.env` dosyanızdaki `INITIAL_PASSWORD` değerini girin.
3. Panelden sağlayıcı bağlantıları ekleyin.
4. Model oluşturun veya seçin.
5. Aracınızı `http://localhost:20128/v1` adresine yönlendirin.

## Üretim Modunda Çalıştırın

Uygulamayı derleyin:

```bash
npm run build
```

Üretim sunucusunu terminale bağlı olarak başlatın:

```bash
npm run start
```

Bu mod basit manuel çalıştırmalar içindir. Terminal/oturum kapanırsa süreç de durur.

Kalıcı bir PM2 süreci için PM2'yi kurup OzRouter'ı PM2 script'iyle başlatın:

```bash
npm install -g pm2
npm run pm2:start
```

PM2 komutları:

```bash
npm run pm2:status
npm run pm2:logs
npm run pm2:restart
npm run pm2:stop
```

Hızlı kurulum script'i PM2 ayarını otomatik yapar. GitHub'dan manuel clone yapanlar `npm run start` ile terminale bağlı çalıştırabilir veya kalıcı üretim servisi için PM2 akışını kullanabilir. Sunucu iki modda da `.env` dosyasındaki aynı değerleri kullanır.

Yalnızca yerel bir kurulum için, localhost'a bağlı tutun ve şunu kullanın:

```env
NEXT_PUBLIC_BASE_URL=http://localhost:20128
```

OzRouter'ı ağınızdaki başka bir cihaza açarsanız, güçlü bir panel şifresi, güçlü gizli anahtarlar ve istemciler için API anahtarları kullanın.

## İstemci Yapılandırması

Çoğu OpenAI uyumlu istemci iki değere ihtiyaç duyar:

```txt
Base URL: http://localhost:20128/v1
API key:  Panelden oluşturulmuş bir OzRouter API anahtarı
```

Bazı araçlar anahtarı `OPENAI_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `GEMINI_API_KEY` veya benzeri olarak adlandırır. Araç OzRouter base URL'ine yönlendirildiğinde OzRouter anahtarını kullanın.

Örnek ortam değişkenleri:

```bash
export OPENAI_BASE_URL="http://localhost:20128/v1"
export OPENAI_API_KEY="sk-ozrouter-anahtariniz"
```

## Sağlayıcı ve Fallback Ayarları

Aynı sağlayıcı hesap fallback'i için:

1. Aynı sağlayıcı altında birden fazla hesap ekleyin.
2. Hesapları etkin tutun.
3. OzRouter, yapılandırılmış yönlendirme stratejisini kullanır ve aktif hesap kullanılamaz, rate-limit'e takılmış veya kotası bitmiş olduğunda başka bir hesaba geçer.

Çapraz sağlayıcı fallback için:

1. Bir combo oluşturun.
2. İstediğiniz öncelik sırasına göre model/sağlayıcıları ekleyin.
3. Combo modelini istemcinizden kullanın.

Aynı sağlayıcı için birden fazla hesabınız varsa aynı sağlayıcı fallback'i kullanın. Codex'ten Gemini'ye gibi farklı sağlayıcılar arasında fallback istediğinizde combo'ları kullanın.

## Veri Dizini

Varsayılan olarak yerel veriler şu dizinde saklanır:

```txt
~/.ozrouter
```

Bunu şu şekilde değiştirebilirsiniz:

```env
DATA_DIR=/dizin/yol/ozrouter-verileri
```

Bu dizin şunları içerebilir:

- SQLite veritabanları
- Sağlayıcı bağlantı meta verileri
- Kullanım günlükleri
- Kota anlık görüntüleri
- Yerel ayarlar

Kurulum önemliyse yedekleyin.

## Yaygın Komutlar

```bash
npm run dev
npm run build
npm run start
npm run pm2:start
npm run pm2:restart
npm run pm2:logs
npm run lint
npm run typecheck:core
npm run test:unit
```

Tek bir test dosyası çalıştırın:

```bash
node --import tsx/esm --test tests/unit/ornek.test.ts
```

Desteklenen Node.js çalışma zamanını kontrol edin:

```bash
npm run check:node-runtime
```

## Güncelleme

En son kodu çekin:

```bash
git pull
```

Bağımlılık değişikliklerini yükleyin:

```bash
npm install
```

Üretim modu kullanıyorsanız yeniden derleyin:

```bash
npm run build
```

Ardından çalışan süreci yeniden başlatın. Terminale bağlı mod için:

```bash
npm run start
```

PM2 ile yönetilen kurulumlar için:

```bash
npm run pm2:restart
```

Üretim örneğini güncellemeden önce `DATA_DIR` dizininizi yedekleyin.

## Sorun Giderme

### Desteklenmeyen Node.js Çalışma Zamanı

Desteklenen bir Node.js sürümü yükleyin. Node.js 24 LTS önerilir.

```bash
nvm install 24
nvm use 24
npm install
```

### Panel Açılmıyor

Sunucunun çalıştığını kontrol edin:

```bash
npm run dev
```

Portu kontrol edin:

```env
PORT=20128
NEXT_PUBLIC_BASE_URL=http://localhost:20128
```

Ardından açın:

```txt
http://localhost:20128/dashboard
```

### Giriş Başarısız

`.env` dosyasındaki `INITIAL_PASSWORD` değerini doğrulayın.

`.env` dosyasını değiştirdiyseniz, sunucuyu yeniden başlatın.

### İstemci Bağlanamıyor

İstemcinin şu adresi kullandığından emin olun:

```txt
http://localhost:20128/v1
```

Ayrıca istemcinin panelden oluşturulmuş bir OzRouter API anahtarı kullandığından emin olun.

### Sağlayıcı İstekleri Başarısız

Kontrol edin:

- Sağlayıcı kimlik bilgileri geçerli.
- Seçilen model o sağlayıcı için mevcut.
- Sağlayıcı hesabı etkin.
- Kota veya rate-limit durumu bağlantıyı engellemiyor.
- İstek, amaçlanan modeli veya combo'yu kullanıyor.

## Depo Düzeni

- `src/app` — Next.js panel ve API rotaları.
- `src/lib` — kalıcılık, kimlik doğrulama, ayarlar, görevler, kullanım ve uygulama servisleri.
- `src/shared` — UI bileşenleri, sabitler, türler ve paylaşılan yardımcı programlar.
- `open-sse` — sağlayıcı yürütme, akış, dönüştürme, MCP ve yönlendirme çekirdeği.
- `docs` — operasyonel dokümantasyon.
- `tests` — birim, entegrasyon ve uyumluluk testleri.

## Geliştirme Notları

- `.env`, yerel veritabanları, günlükler, derleme çıktıları veya sağlayıcı kimlik bilgilerini depoya eklemeyin.
- TypeScript değişikliklerinden sonra `npm run typecheck:core` çalıştırın.
- Yönlendirme, sağlayıcı, kimlik doğrulama veya akış mantığını değiştirdikten sonra hedefli testler çalıştırın.
- Aynı makinede birden fazla OzRouter örneği çalıştırırken `DATA_DIR` kullanın.

## Lisans

MIT.
