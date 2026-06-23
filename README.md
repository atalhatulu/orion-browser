# 🌌 Orion Browser

Orion Browser, Chromium ve Electron tabanlı, **Spatial UI** (Uzamsal Arayüz) ve **Glassmorphism** tasarım dillerini harmanlayarak geliştirilmiş yeni nesil, ultra-minimalist bir web tarayıcısıdır. Standart sekmeli tarayıcı anlayışını yıkarak tamamen akıcı, üç boyutlu geçişlere ve şeffaf katmanlara odaklanır.

---

## ✨ Özellikler

- **🛸 Spatial UI & 3D Sekme Geçişleri:** Geleneksel üst sekme çubuğu yoktur. Sekmeler arasında geçiş yaparken ana ekran küçülerek (scale) üç boyutlu bir kayma efektiyle yeni sekmeye geçer. Tıpkı modern bir işletim sisteminde pencereler arası gezinir gibi!
- **👁️ Gerçek Zamanlı Sekme Önizlemeleri (Thumbnails):** Alt durum çubuğundaki Apple/Samsung tarzı noktalara fare ile geldiğinizde, o sekmede açık olan sitenin canlı ve anlık bir ekran görüntüsü şık bir baloncuk (tooltip) içinde belirir.
- **⚡ Canlı Ağ İstatistikleri:** Tarayıcının sağ alt köşesinde anlık internet indirme hızınızı (Mbps) ve bulut sunuculara olan gecikmenizi (Ping/ms) saniye saniye takip edebilirsiniz.
- **🎨 Kusursuz Karanlık Tema & Cam Efekti:** Tamamen siyah (Deep Dark) arka plan üzerine inşa edilmiş yarı saydam (blur) menü barları ile modern VIP hissiyatı.
- **🏠 Dinamik Ana Sayfa:** Tarayıcıyı açtığınızda sizi karşılayan özel tasarımlı, dijital saatli ve Google arama entegrasyonlu büyüleyici bir karşılama ekranı (Homepage).
- **🛠️ Gelişmiş Bağlam Menüsü (Context Menu):** Görsellerin üzerine sağ tıklandığında resmi yeni sekmede açma veya farklı kaydetme gibi dinamik olarak değişen akıllı sağ tık menüsü.
- **📥 Entegre İndirme Yöneticisi:** Arka planda çalışan ve alt bilgi barında canlı % ilerlemesini gösteren şık bir indirme takip sistemi.
- **⌨️ Pratik Kısayollar:** `F11` ile tam ekran moduna geçiş, `Ctrl + W` ile aktif sekmeyi anında kapatma desteği.

---

## 🚀 Kurulum & Çalıştırma

Orion Browser'ı kendi makinenizde çalıştırmak için sisteminizde [Node.js](https://nodejs.org/) kurulu olması gerekmektedir.

1. **Repoyu Klonlayın:**
   ```bash
   git clone https://github.com/kullaniciadiniz/orion-browser.git
   cd orion-browser
   ```

2. **Gereksinimleri Yükleyin:**
   ```bash
   npm install
   ```

3. **Tarayıcıyı Başlatın:**
   ```bash
   npm start
   ```
   *(Veya Linux/macOS sistemlerde sağlanan `start-orion.sh` scriptini kullanarak doğrudan başlatabilirsiniz).*

---

## 📁 Proje Mimarisi

- `main.js`: Electron arka plan işlemleri, pencere yönetimi, IPC iletişimleri ve indirme (download) yöneticisi.
- `renderer.js`: Tarayıcının ana mantığı, sekme yönetimi (DOM/Webview), ping hesaplamaları ve UI etkileşimleri.
- `index.html`: Orion Browser'ın ana iskeleti, üst ve alt barlar, DOM tabanlı önizleme modülleri.
- `style.css`: Üç boyutlu geçiş animasyonları, glassmorphism tasarımları ve saydam yerleşim ayarları.
- `homepage.html`: Yeni sekme açıldığında yüklenen başlangıç sayfası.

---

## 🛠️ Kullanılan Teknolojiler
- **Electron.js** (Chromium & Node.js)
- **Vanilla JavaScript** (Saf JS performansı)
- **CSS3** (Backdrop-filter, Flexbox, Keyframes)
- **HTML5** (Webview entegrasyonu)

---

## 📝 Lisans
Bu proje geliştirilme aşamasındadır. Açık kaynak kodlu veya kişisel kullanıma göre lisanslanabilir.

> *Tasarım ve kodlama süreçleri özenle elde yapılandırılmıştır.*