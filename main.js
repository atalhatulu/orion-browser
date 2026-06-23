const { app, BrowserWindow, ipcMain, Menu, session } = require('electron');
const path = require('path');

let win;
let blockedCount = 0; // Engellenen reklam/izleyici sayısı

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    titleBarStyle: 'hidden',
    transparent: true,
    webPreferences: {
      webviewTag: true,
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('index.html');

  win.on('maximize', () => {
      if (win.webContents) win.webContents.send('window-state', 'maximized');
  });
  win.on('unmaximize', () => {
      if (win.webContents) win.webContents.send('window-state', 'unmaximized');
  });

  // --- 3. AŞAMA: GÜVENLİK VE HIZ (ADBLOCKER) ---
  const adBlockList = [
      '*://*.doubleclick.net/*',
      '*://*.google-analytics.com/*',
      '*://*.googlesyndication.com/*',
      '*://*.facebook.net/*',
      '*://*.adnxs.com/*',
      '*://*.adsystem.com/*',
      '*://*.taboola.com/*',
      '*://*.outbrain.com/*'
  ];

  session.defaultSession.webRequest.onBeforeRequest({ urls: adBlockList }, (details, callback) => {
      blockedCount++;
      // Arayüze sayıyı gönder
      if (win && win.webContents) {
          win.webContents.send('tracker-blocked', blockedCount);
      }
      callback({ cancel: true }); // Ağ isteğini daha yüklenmeden doğrudan reddet (Hızlandırır)
  });

  // İNDİRME YÖNETİCİSİ
  win.webContents.session.on('will-download', (event, item, webContents) => {
      win.webContents.send('download-started', { filename: item.getFilename() });

      item.on('updated', (event, state) => {
          if (state === 'progressing') {
              const progress = Math.round((item.getReceivedBytes() / item.getTotalBytes()) * 100);
              win.webContents.send('download-progress', { filename: item.getFilename(), progress });
          }
      });

      item.once('done', (event, state) => {
          win.webContents.send('download-done', { filename: item.getFilename(), state });
      });
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// SAĞ TIK MENÜSÜ
ipcMain.on('show-context-menu', (event, params) => {
    const template = [];

    if (params.linkURL) {
        template.push({ label: 'Bağlantıyı Kopyala', role: 'copy' });
        template.push({ label: 'Bağlantıyı Yeni Sekmede Aç', click: () => { event.sender.send('new-tab-url', params.linkURL); } });
        template.push({ type: 'separator' });
    }

    if (params.mediaType === 'image') {
        template.push({ label: 'Resmi Kopyala', role: 'copy' });
        template.push({ label: 'Resmi Farklı Kaydet', click: () => { win.webContents.downloadURL(params.srcURL); } });
        template.push({ label: 'Resmi Yeni Sekmede Aç', click: () => { event.sender.send('new-tab-url', params.srcURL); } });
        template.push({ type: 'separator' });
    }

    template.push(
        { role: 'copy', label: 'Kopyala' },
        { role: 'paste', label: 'Yapıştır' },
        { role: 'cut', label: 'Kes' },
        { type: 'separator' },
        { role: 'reload', label: 'Sayfayı Yenile' },
        { role: 'toggledevtools', label: 'Öğeyi İncele' }
    );
    
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: win });
});

ipcMain.on('window-minimize', () => win.minimize());
ipcMain.on('window-maximize', () => {
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.on('window-close', () => win.close());

ipcMain.on('toggle-fullscreen', () => {
  win.setFullScreen(!win.isFullScreen());
});
