const { ipcRenderer } = require('electron');
const path = require('path');

const urlInput = document.getElementById('url-input');
const contentArea = document.getElementById('content-area');
const dotsContainer = document.getElementById('tab-dots-container');

// --- PENCERE KONTROLLERİ ---
document.getElementById('min-btn').addEventListener('click', () => ipcRenderer.send('window-minimize'));
document.getElementById('max-btn').addEventListener('click', () => ipcRenderer.send('window-maximize'));
document.getElementById('close-btn').addEventListener('click', () => ipcRenderer.send('window-close'));

// --- AYARLAR MODALI & ÖZELLEŞTİRME (TEMA MOTORU) ---
const settingsModal = document.getElementById('settings-modal');
document.getElementById('settings-btn').addEventListener('click', () => settingsModal.style.display = 'flex');
document.getElementById('close-settings').addEventListener('click', () => settingsModal.style.display = 'none');

const colorPicker = document.getElementById('set-color');
const radiusSlider = document.getElementById('set-radius');
const layoutSelector = document.getElementById('set-layout');

// Kayıtlı Ayarları Yükle
const savedColor = localStorage.getItem('orion-bg-color') || '#0d0d0d';
const savedRadius = localStorage.getItem('orion-surf-radius') || '12';
const savedLayout = localStorage.getItem('orion-layout') || 'top';

document.documentElement.style.setProperty('--bg-color', savedColor);
document.documentElement.style.setProperty('--surf-radius', `${savedRadius}px`);
if(savedLayout === 'bottom') document.body.classList.add('layout-url-bottom');

colorPicker.value = savedColor;
radiusSlider.value = savedRadius;
layoutSelector.value = savedLayout;

// Ayarlar Değiştiğinde Canlı Uygula ve Kaydet
colorPicker.addEventListener('input', (e) => {
    document.documentElement.style.setProperty('--bg-color', e.target.value);
    localStorage.setItem('orion-bg-color', e.target.value);
});
radiusSlider.addEventListener('input', (e) => {
    document.documentElement.style.setProperty('--surf-radius', `${e.target.value}px`);
    localStorage.setItem('orion-surf-radius', e.target.value);
});
layoutSelector.addEventListener('change', (e) => {
    if(e.target.value === 'bottom') document.body.classList.add('layout-url-bottom');
    else document.body.classList.remove('layout-url-bottom');
    localStorage.setItem('orion-layout', e.target.value);
});

// --- F11 VE CTRL+W ---
window.addEventListener('keydown', (e) => {
    if (e.key === 'F11') ipcRenderer.send('toggle-fullscreen');
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') if(activeTabId) closeTab(activeTabId);
});

// --- GEZİNME ---
document.getElementById('nav-back').addEventListener('click', () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if(activeTab && activeTab.webviewEl.canGoBack()) activeTab.webviewEl.goBack();
});
document.getElementById('nav-fwd').addEventListener('click', () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if(activeTab && activeTab.webviewEl.canGoForward()) activeTab.webviewEl.goForward();
});
document.getElementById('nav-reload').addEventListener('click', () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if(activeTab) activeTab.webviewEl.reload();
});

// --- GÜVENLİK VE ADBLOCKER (İzleyici Engellendi Sayacı) ---
ipcRenderer.on('tracker-blocked', (e, count) => {
    document.getElementById('tracker-count').textContent = `${count} İzleyici Engellendi`;
});

// --- İNDİRME YÖNETİCİSİ ---
const dlStatus = document.getElementById('download-status');
const dlSep = document.getElementById('download-sep');
ipcRenderer.on('download-started', (e, data) => {
    dlStatus.style.display = 'inline'; dlSep.style.display = 'inline';
    dlStatus.textContent = `📥 ${data.filename} (%0)`;
    dlStatus.style.color = '#3b82f6';
});
ipcRenderer.on('download-progress', (e, data) => {
    dlStatus.textContent = `📥 ${data.filename} (%${data.progress})`;
});
ipcRenderer.on('download-done', (e, data) => {
    if(data.state === 'completed') {
        dlStatus.textContent = `✅ İndirildi: ${data.filename}`; dlStatus.style.color = '#4ade80';
    } else {
        dlStatus.textContent = `❌ İptal: ${data.filename}`; dlStatus.style.color = '#ff5f56';
    }
    setTimeout(() => { dlStatus.style.display = 'none'; dlSep.style.display = 'none'; }, 4000);
});

// --- İNTERNET HIZI VE PING TAKİBİ ---
const netSpeedEl = document.querySelector('.net-speed');
setInterval(async () => {
    let mbps = navigator.connection && navigator.connection.downlink ? Math.round(navigator.connection.downlink * 8) : '--';
    let ms = 0;
    try {
        const start = performance.now();
        await fetch('https://1.1.1.1', { mode: 'no-cors', cache: 'no-store' });
        ms = Math.round(performance.now() - start);
    } catch (e) {
        ms = 'Hata';
    }
    netSpeedEl.textContent = `${mbps} Mbps • ${ms} ms 🟢`;
}, 5000);

// Sağ Tık Sekme Açma İsteği
ipcRenderer.on('new-tab-url', (e, url) => {
    createTab(url);
});

// --- SEKME MANTIĞI VE ÖNİZLEME ---
let tabs = [];
let activeTabId = null;
let tabCounter = 0;

function closeTab(id) {
    const index = tabs.findIndex(t => t.id === id);
    if (index > -1) {
        const t = tabs[index];
        t.wrapper.remove();
        tabs.splice(index, 1);
        
        if (tabs.length > 0) {
            if (activeTabId === id) switchTab(tabs[Math.max(0, index - 1)].id);
            else updateDots();
        } else {
            createTab();
        }
    }
}

function updateDots() {
    dotsContainer.innerHTML = ''; 
    tabs.forEach((t, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'dot-wrapper';
        if (t.id === activeTabId) wrapper.classList.add('active');

        const dot = document.createElement('div');
        dot.className = 'tab-dot';
        
        const preview = document.createElement('div');
        preview.className = 'dot-preview';

        const previewImg = document.createElement('div');
        previewImg.className = 'preview-img';
        if (t.previewDataURL) previewImg.style.backgroundImage = `url(${t.previewDataURL})`;

        const previewFooter = document.createElement('div');
        previewFooter.className = 'preview-footer';
        
        const titleSpan = document.createElement('span');
        titleSpan.className = 'preview-title';
        titleSpan.textContent = t.webviewEl.getTitle() || t.webviewEl.getURL() || `Sekme ${index + 1}`;

        const closeSpan = document.createElement('span');
        closeSpan.className = 'preview-close';
        closeSpan.innerHTML = '&times;';
        closeSpan.addEventListener('click', (e) => { e.stopPropagation(); closeTab(t.id); });

        previewFooter.appendChild(titleSpan); previewFooter.appendChild(closeSpan);
        preview.appendChild(previewImg); preview.appendChild(previewFooter);
        wrapper.appendChild(dot); wrapper.appendChild(preview);

        wrapper.addEventListener('mouseenter', async () => {
            if (t.id === activeTabId) {
                try {
                    const img = await t.webviewEl.capturePage();
                    t.previewDataURL = img.toDataURL();
                    previewImg.style.backgroundImage = `url(${t.previewDataURL})`;
                } catch (err) {}
            }
        });
        
        dot.addEventListener('click', () => switchTab(t.id));
        dotsContainer.appendChild(wrapper);
    });
}

// YENİ ANA SAYFAYI VARSAYILAN URL YAP
function createTab(url = null) {
  const id = `tab-${tabCounter++}`;
  
  if (!url) {
      url = `file://${path.join(__dirname, 'homepage.html')}`;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'tab-wrapper slide-right';
  wrapper.id = `wrap-${id}`;
  
  const webviewEl = document.createElement('webview');
  webviewEl.id = `wv-${id}`;
  webviewEl.src = url;
  
  // GÜVENLİK: İçerik izole edilir ve node integrasyonu engellenir
  webviewEl.setAttribute('webpreferences', 'contextIsolation=yes, nodeIntegration=no');

  webviewEl.addEventListener('context-menu', (e) => {
      e.preventDefault();
      ipcRenderer.send('show-context-menu', e.params);
  });
  
  wrapper.appendChild(webviewEl);
  contentArea.appendChild(wrapper);
  
  const tabData = { id, webviewEl, wrapper, previewDataURL: null };
  tabs.push(tabData);

  webviewEl.addEventListener('did-navigate', (e) => {
    if(activeTabId === id) urlInput.value = e.url;
    updateDots();
  });

  webviewEl.addEventListener('page-title-updated', (e) => { updateDots(); });

  switchTab(id);
}

async function switchTab(id) {
  const currentTab = tabs.find(t => t.id === activeTabId);
  if (currentTab) {
      try {
          const img = await currentTab.webviewEl.capturePage();
          currentTab.previewDataURL = img.toDataURL();
      } catch (e) {}
  }

  activeTabId = id;
  let foundTarget = false;
  
  tabs.forEach(t => {
    if(t.id === id) {
      t.wrapper.className = 'tab-wrapper active';
      urlInput.value = t.webviewEl.getURL() || '';
      if (urlInput.value.includes('homepage.html')) {
          urlInput.value = '';
          urlInput.placeholder = 'Google\'da ara veya URL gir...';
      }
      foundTarget = true;
    } else {
      if(foundTarget) t.wrapper.className = 'tab-wrapper slide-right';
      else t.wrapper.className = 'tab-wrapper slide-left';
    }
  });
  
  updateDots();
}

document.getElementById('prev-tab-btn').addEventListener('click', () => {
    if(tabs.length <= 1) return;
    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    if(currentIndex > 0) switchTab(tabs[currentIndex - 1].id);
    else switchTab(tabs[tabs.length - 1].id);
});

document.getElementById('next-tab-btn').addEventListener('click', () => {
    if(tabs.length <= 1) return;
    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    if(currentIndex < tabs.length - 1) switchTab(tabs[currentIndex + 1].id);
    else switchTab(tabs[0].id);
});

document.getElementById('new-tab-btn').addEventListener('click', () => createTab());
document.getElementById('close-tab-btn').addEventListener('click', () => {
    if(activeTabId) closeTab(activeTabId);
});

urlInput.addEventListener('keydown', (e) => {
  if(e.key === 'Enter') {
    let url = urlInput.value.trim();
    if (url) {
        if(!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
          if(url.includes('.')) url = 'https://' + url;
          else url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
        }
        const activeTab = tabs.find(t => t.id === activeTabId);
        if(activeTab) activeTab.webviewEl.loadURL(url);
        else createTab(url);
    }
    urlInput.blur();
  }
});

// İlk sekme olarak anasayfayı oluştur
createTab();
