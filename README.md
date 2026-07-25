# Alanya Racing Motors — E-Ticaret Sitesi + Yönetim Paneli

Motosiklet/scooter aksesuarları satan bir mağaza için hazırlanmış, admin panelinden
tamamen yönetilebilen bir site. Ürün ekleme/silme/sıralama, kategori yönetimi ve
banner/site ayarları admin panelinden yapılır; değişiklikler anında canlı siteye yansır.

## Gereksinim

Bilgisayarınızda **Node.js** kurulu olmalı (v18 veya üzeri). Yoksa: https://nodejs.org
adresinden "LTS" sürümünü indirip kurun.

## Çalıştırma

**Windows:** `start.bat` dosyasına çift tıklayın. Otomatik olarak gerekli paketleri
kurar, sunucuyu başlatır ve tarayıcıda siteyi açar.

**Mac / Linux:** Terminalde bu klasöre girip `./start.sh` çalıştırın.

**Manuel:**
```bash
npm install
npm start
```

Sonra tarayıcıda:
- Mağaza: http://localhost:3000
- Yönetim paneli: http://localhost:3000/admin.html

## İlk giriş

Sunucuyu ilk kez başlattığınızda terminalde şöyle bir mesaj görürsünüz:

```
İlk çalıştırma: admin şifresi otomatik oluşturuldu.
Varsayılan şifre: alanya2026
```

Bu şifreyle admin paneline girin, ardından **"Şifre Değiştir"** bölümünden
mutlaka kendi şifrenizi belirleyin.

## Admin panelinden yapabilecekleriniz

- **Ürünler**: ekle, düzenle, sil, sürükle-bırak ile sırala (site vitrinindeki
  "Listeleme Sırası" bu sıraya göre çalışır). Her ürüne kendi bilgisayarınızdan
  görsel yükleyebilirsiniz.
- **Kategoriler**: yeni kategori açma, yeniden adlandırma, silme, sürükleyerek
  sıralama. Bir kategori silinirse içindeki ürünler "Kategorisiz" olarak işaretlenir
  (ürünler silinmez).
- **Site Ayarları / Banner**: ana sayfa banner başlığı, alt metni, banner görseli,
  telefon, WhatsApp numarası, e-posta ve adres.
- **Şifre Değiştir**: admin giriş şifrenizi güncelleme.

Tüm değişiklikler `data/db.json` dosyasında saklanır — bu dosyayı silmeyin,
yedeğini almanız önerilir.

## Sınırlamalar / henüz yapılmayanlar

- **Ödeme altyapısı yok.** "Siparişi Tamamla" butonu şu an WhatsApp'a sipariş
  özeti gönderir, kartla online ödeme almaz. Gerçek ödeme için:
  - **iyzico** veya **PayTR** (Türkiye'de yaygın, kartla anlık tahsilat)
  - **Shopier API** (mevcut Shopier mağazasıyla senkronize etmek isterseniz)
  entegrasyonu ayrıca yapılmalı.
- **Yasal metinler boş.** Footer'daki "Alışveriş Güvenliği", "Ön Bilgilendirme
  Formu", "Mesafeli Satış Sözleşmesi", "Kişisel Verilerin Korunması" bağlantıları
  şu an `#` — Türkiye'de e-ticaret için bu metinler zorunludur, gerçek içerikle
  doldurulmalı.
- **Tek admin kullanıcısı.** Şu an kullanıcı adı yok, sadece tek bir şifre var.
  Birden fazla yönetici hesabı gerekiyorsa ayrıca eklenmelidir.
- **Yerel dosya deposu.** Ürün görselleri `public/uploads` klasörüne kaydedilir.
  Bir hosting sağlayıcısına taşırken bu klasörün de birlikte taşındığından/
  yedeklendiğinden emin olun (bazı ücretsiz hosting'ler dosya sistemini kalıcı
  tutmaz — bu durumda S3 / Cloudinary gibi bir görsel deposu gerekir).

## Canlıya alma (internete açma)

Bu artık bir arka uca (Node.js sunucusu) sahip olduğu için, sadece statik dosya
barındıran hizmetler (GitHub Pages gibi) yeterli olmaz. Şunlardan biri gerekir:

- **Render.com** veya **Railway.app**: Node.js projelerini ücretsiz/düşük maliyetle
  barındırır, GitHub reposu bağlayıp otomatik deploy edebilirsiniz.
- **VPS** (DigitalOcean, Hetzner, vb.): `npm install && npm start` ile çalıştırıp
  bir domain bağlarsınız (genelde `pm2` gibi bir process manager ile arka planda
  sürekli çalıştırılır).

Bir domain (örn. alanyaracingmotors.com) alıp yukarıdaki servislerden birine
bağlamanız gerekir.

## Klasör yapısı

```
arm-site/
├── server.js              → Express sunucusu + tüm API uçları
├── package.json
├── data/
│   ├── db.json             → ürünler, kategoriler, ayarlar (asıl veri)
│   └── auth.json           → admin şifre hash'i (otomatik oluşur)
├── public/
│   ├── index.html          → mağaza vitrini
│   ├── admin.html           → yönetim paneli
│   ├── css/, js/            → stiller ve mantık
│   └── uploads/             → yüklenen ürün/banner görselleri
├── start.bat / start.sh     → tek tıkla başlatma
```

## Render.com'a ücretsiz deploy (sadece deneme/gösterim için)

**Önemli:** Render'ın ücretsiz planında dosya sistemi kalıcı değildir. Servis
15 dakika işlem almayınca "uyur", bir sonraki istekte yeniden başlar — bu sırada
`data/db.json`'a admin panelden yaptığınız değişiklikler (yeni ürün, silinen
kategori, yüklenen görsel) sıfırlanır ve depoya (GitHub) yüklediğiniz haline
döner. Bu yüzden ücretsiz plan gerçek/kalıcı bir mağaza yönetimi için uygun
değildir — sadece tasarımı ve işlevleri göstermek/denemek içindir. Kalıcı
olması için ücretli plan + Persistent Disk gerekir (bkz. Render dokümantasyonu:
render.com/docs/disks).

### Adımlar

1. **GitHub'a yükleyin.** Bu klasörde (terminalde):
   ```bash
   git init
   git add .
   git commit -m "İlk sürüm"
   ```
   GitHub'da yeni bir repo oluşturun (github.com/new, README eklemeden),
   sonra:
   ```bash
   git remote add origin https://github.com/KULLANICI_ADINIZ/REPO_ADI.git
   git branch -M main
   git push -u origin main
   ```

2. **Render'da servis oluşturun.** render.com'a GitHub hesabınızla giriş yapın →
   **New +** → **Web Service** → az önce push ettiğiniz repoyu seçin.
   - Environment: **Node**
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance Type: **Free**
   - (Bu depodaki `render.yaml` dosyası bu ayarları otomatik önerecektir.)
   - **Create Web Service**'e tıklayın.

3. **İlk şifreyi görün.** Deploy bitince servisin **Logs** sekmesinde
   "Varsayılan şifre: alanya2026" satırını arayın (her yeniden başlamada
   aynı şifre tekrar basılır çünkü dosya sıfırlanıyor).

4. Size verilen `https://SIZIN-SERVIS-ADINIZ.onrender.com` adresi mağazanız,
   `/admin.html` ise yönetim paneli olur.

5. **Uyku modu notu:** 15 dakika sonra servis uyur; sonraki ilk ziyaret
   30-50 saniye sürebilir (Render'ın ücretsiz planının doğal davranışı).

Gerçek/kalıcı bir yönetim paneli isterseniz, bana söyleyin — ücretli plan +
Persistent Disk için `server.js`'deki veri yollarını buna göre güncelleriz.
