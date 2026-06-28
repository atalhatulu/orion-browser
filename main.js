const { app, BrowserWindow, ipcMain, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');

app.disableHardwareAcceleration(); // Linux sistemlerdeki GPU crash (boş siyah ekran) sorununu çözer
let win;
let blockedCount = 0; 
let adblockEnabled = true;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    titleBarStyle: 'hidden',
    transparent: true,
    frame: false, 
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true
    }
  });

  win.loadFile('index.html');

  win.on('maximize', () => {
      if (win.webContents) win.webContents.send('window-state', 'maximized');
  });
  win.on('unmaximize', () => {
      if (win.webContents) win.webContents.send('window-state', 'unmaximized');
  });

  const adBlockList = [
      '*://*.doubleclick.net/*', '*://*.google-analytics.com/*', '*://*.googlesyndication.com/*',
      '*://*.facebook.net/*', '*://*.adnxs.com/*', '*://*.adsystem.com/*',
      '*://*.taboola.com/*', '*://*.outbrain.com/*'
  ];

  session.defaultSession.webRequest.onBeforeRequest({ urls: adBlockList }, (details, callback) => {
      if (!adblockEnabled) return callback({ cancel: false }); 
      
      blockedCount++;
      if (win && win.webContents) {
          win.webContents.send('tracker-blocked', blockedCount);
      }
      callback({ cancel: true }); 
  });

  win.webContents.session.on('will-download', (event, item, webContents) => {
      win.webContents.send('download-started', { filename: item.getFilename() });

      item.on('updated', (event, state) => {
          if (state === 'progressing') {
              const progress = Math.round((item.getReceivedBytes() / item.getTotalBytes()) * 100);
              win.webContents.send('download-progress', { filename: item.getFilename(), progress, receivedBytes: item.getReceivedBytes(), totalBytes: item.getTotalBytes() });
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

ipcMain.on('toggle-adblock', (e, state) => { adblockEnabled = state; });

ipcMain.on('show-context-menu', (event, params) => {
    const template = [];
    if (params.linkURL) {
        template.push({ label: 'Bağlantıyı Kopyala', role: 'copy' });
        template.push({ label: 'Bağlantıyı Yeni Sekmede Aç', click: () => { win.webContents.send('new-tab-url', params.linkURL); } });
        template.push({ type: 'separator' });
    }
    if (params.mediaType === 'image') {
        template.push({ label: 'Resmi Kopyala', role: 'copy' });
        template.push({ label: 'Resmi Farklı Kaydet', click: () => { win.webContents.downloadURL(params.srcURL); } });
        template.push({ label: 'Resmi Yeni Sekmede Aç', click: () => { win.webContents.send('new-tab-url', params.srcURL); } });
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
ipcMain.on('toggle-fullscreen', () => { win.setFullScreen(!win.isFullScreen()); });
// Yeni eklenen explicit fullscreen kontrolü
ipcMain.on('set-fullscreen', (e, state) => { win.setFullScreen(state); });

// Yeni pencere
ipcMain.on('new-window', () => {
  const { BrowserWindow } = require('electron');
  const newWin = new BrowserWindow({
    width: 1400, height: 900,
    titleBarStyle: 'hidden', transparent: true, frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, contextIsolation: true, sandbox: false, webviewTag: true
    }
  });
  newWin.loadFile('index.html');
});

// Gizli pencere
ipcMain.on('new-incognito-window', () => {
  const { BrowserWindow } = require('electron');
  const incogWin = new BrowserWindow({
    width: 1400, height: 900,
    titleBarStyle: 'hidden', transparent: true, frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, contextIsolation: true, sandbox: false, webviewTag: true
    }
  });
  incogWin.loadFile('index.html');
});
const historyDir = path.join(app.getPath('home'), '.orion');
const historyFile = path.join(historyDir, 'history.json');

function ensureHistoryDir() {
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }
}

function readHistory() {
  ensureHistoryDir();
  try {
    if (fs.existsSync(historyFile)) {
      const data = fs.readFileSync(historyFile, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('History read error:', e);
  }
  return [];
}

function writeHistory(entries) {
  ensureHistoryDir();
  try {
    fs.writeFileSync(historyFile, JSON.stringify(entries, null, 2), 'utf-8');
  } catch (e) {
    console.error('History write error:', e);
  }
}

ipcMain.handle('history-read', () => {
  return readHistory();
});

ipcMain.handle('history-write', (event, entry) => {
  const history = readHistory();
  const existing = history.find(h => h.url === entry.url);
  if (existing) {
    existing.timestamp = entry.timestamp;
    existing.title = entry.title;
    existing.visitCount = (existing.visitCount || 1) + 1;
  } else {
    entry.visitCount = 1;
    history.push(entry);
  }
  writeHistory(history);
  return history;
});

ipcMain.handle('history-clear', () => {
  writeHistory([]);
  return [];
});