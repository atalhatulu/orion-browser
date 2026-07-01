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

  let adBlockList = [
      '*://*.doubleclick.net/*', '*://*.google-analytics.com/*', '*://*.googlesyndication.com/*',
      '*://*.facebook.net/*', '*://*.adnxs.com/*', '*://*.adsystem.com/*',
      '*://*.taboola.com/*', '*://*.outbrain.com/*'
  ];

  function applyAdBlocker() {
      session.defaultSession.webRequest.onBeforeRequest({ urls: adBlockList }, (details, callback) => {
          if (!adblockEnabled) return callback({ cancel: false }); 
          
          blockedCount++;
          if (win && win.webContents) {
              win.webContents.send('tracker-blocked', blockedCount);
          }
          callback({ cancel: true }); 
      });
  }
  applyAdBlocker();
  
  ipcMain.on('update-adblock-list', (e, newList) => {
      if(Array.isArray(newList)) {
          adBlockList = newList;
          applyAdBlocker();
      }
  });

  ipcMain.handle('clear-cookies', async () => {
      await session.defaultSession.clearStorageData({storages: ['cookies']});
      return true;
  });

  let sitePermissions = { media: 'ask', location: 'ask', notifications: 'ask' };
  ipcMain.on('update-permissions', (e, perms) => {
      sitePermissions = Object.assign(sitePermissions, perms);
  });
  
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'media') {
          if (sitePermissions.media === 'allow') return callback(true);
          if (sitePermissions.media === 'deny') return callback(false);
      }
      if (permission === 'geolocation') {
          if (sitePermissions.location === 'allow') return callback(true);
          if (sitePermissions.location === 'deny') return callback(false);
      }
      if (permission === 'notifications') {
          if (sitePermissions.notifications === 'allow') return callback(true);
          if (sitePermissions.notifications === 'deny') return callback(false);
      }
      // Varsayılan olarak izin ver veya reddet (ask için dialog gereklidir, basitlik için false)
      callback(false);
  });

  win.webContents.session.on('will-download', (event, item, webContents) => {
      const id = Date.now().toString() + '-' + Math.floor(Math.random() * 1000);
      activeDownloadsItems[id] = item;
      
      const fileUrl = item.getURL();
      const filename = item.getFilename();
      const savePath = item.getSavePath();
      const totalBytes = item.getTotalBytes();
      
      win.webContents.send('download-started', { id, filename, url: fileUrl, totalBytes });

      item.on('updated', (event, state) => {
          if (state === 'progressing') {
              const progress = Math.round((item.getReceivedBytes() / item.getTotalBytes()) * 100);
              win.webContents.send('download-progress', { 
                  id, 
                  filename, 
                  progress, 
                  receivedBytes: item.getReceivedBytes(), 
                  totalBytes: item.getTotalBytes(),
                  state: item.isPaused() ? 'paused' : 'progressing'
              });
          }
      });

      item.once('done', (event, state) => {
          delete activeDownloadsItems[id];
          win.webContents.send('download-done', { id, filename, state });
          
          // İndirme geçmişine ekle
          if (state === 'completed') {
              const dlHistory = readDownloadsHistory();
              dlHistory.push({ id, filename, url: fileUrl, path: item.getSavePath(), size: item.getTotalBytes(), timestamp: Date.now() });
              writeDownloadsHistory(dlHistory);
          }
      });
  });
}

// Download History Management
const downloadsHistoryFile = path.join(app.getPath('userData'), 'orion_downloads.json');
function readDownloadsHistory() {
  try {
    if (fs.existsSync(downloadsHistoryFile)) {
      return JSON.parse(fs.readFileSync(downloadsHistoryFile, 'utf-8'));
    }
  } catch (e) {}
  return [];
}
function writeDownloadsHistory(data) {
  try {
    fs.writeFileSync(downloadsHistoryFile, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {}
}

const activeDownloadsItems = {};

ipcMain.handle('downloads-read', () => readDownloadsHistory());
ipcMain.handle('downloads-clear', () => { writeDownloadsHistory([]); return true; });

// Download Actions
ipcMain.on('download-pause', (e, id) => {
    if (activeDownloadsItems[id]) activeDownloadsItems[id].pause();
});
ipcMain.on('download-resume', (e, id) => {
    if (activeDownloadsItems[id]) activeDownloadsItems[id].resume();
});
ipcMain.on('download-cancel', (e, id) => {
    if (activeDownloadsItems[id]) activeDownloadsItems[id].cancel();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

setInterval(() => {
    if (win && !win.isDestroyed() && win.webContents) {
        try {
            const metrics = app.getAppMetrics();
            let totalMem = 0;
            metrics.forEach(m => { totalMem += (m.memory.workingSetSize || 0); });
            win.webContents.send('memory-usage', totalMem);
        } catch(e) {}
    }
}, 2000);

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

ipcMain.on('window-minimize', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (w) w.minimize();
});
ipcMain.on('window-maximize', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (w) {
        if (w.isMaximized()) w.unmaximize();
        else w.maximize();
    }
});
ipcMain.on('window-close', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (w) w.close();
});
ipcMain.on('toggle-fullscreen', (event) => { 
    const w = BrowserWindow.fromWebContents(event.sender);
    if (w) w.setFullScreen(!w.isFullScreen()); 
});
// Yeni eklenen explicit fullscreen kontrolü
ipcMain.on('set-fullscreen', (event, state) => { 
    const w = BrowserWindow.fromWebContents(event.sender);
    if (w) w.setFullScreen(state); 
});

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
      nodeIntegration: false, contextIsolation: true, sandbox: false, webviewTag: true,
      partition: 'incognito_win'
    }
  });
  incogWin.loadFile('index.html', { query: { incognito: 'true' } });
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