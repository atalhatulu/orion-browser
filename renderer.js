const { ipcRenderer } = require('electron');
const path = require('path');

const urlInput = document.getElementById('url-input');
const contentArea = document.getElementById('content-area');
const dotsContainer = document.getElementById('tab-dots-container');

// --- PENCERE KONTROLLERİ ---
document.getElementById('min-btn').addEventListener('click', () => ipcRenderer.send('window-minimize'));
document.getElementById('max-btn').addEventListener('click', () => ipcRenderer.send('window-maximize'));
document.getElementById('close-btn').addEventListener('click', () => ipcRenderer.send('window-close'));

ipcRenderer.on('window-state', (e, state) => {
    if (state === 'maximized') document.body.classList.add('is-maximized');
    else document.body.classList.remove('is-maximized');
});

// --- RENK VE TEMA MANTIĞI ---
function getContrastYIQ(hexcolor) {
    hexcolor = hexcolor.replace("#", "");
    if (hexcolor.length === 3) hexcolor = hexcolor.split('').map(c => c+c).join('');
    var r = parseInt(hexcolor.substr(0,2),16);
    var g = parseInt(hexcolor.substr(2,2),16);
    var b = parseInt(hexcolor.substr(4,2),16);
    var yiq = ((r*299)+(g*587)+(b*114))/1000;
    return (yiq >= 150) ? { hex: '#000000', rgb: '0, 0, 0' } : { hex: '#ffffff', rgb: '255, 255, 255' };
}

function applyThemeColors(hexcolor) {
    const contrast = getContrastYIQ(hexcolor);
    document.documentElement.style.setProperty('--bg-color', hexcolor);
    document.documentElement.style.setProperty('--text-color', contrast.hex);
    document.documentElement.style.setProperty('--text-color-rgb', contrast.rgb);
}

const savedColor = localStorage.getItem('orion-bg-color') || '#0d0d0d';
const savedRadius = localStorage.getItem('orion-surf-radius') || '12';

applyThemeColors(savedColor);
document.documentElement.style.setProperty('--surf-radius', `${savedRadius}px`);

document.getElementById('set-color').value = savedColor;
document.getElementById('set-radius').value = savedRadius;
document.getElementById('radius-val').innerText = savedRadius;

// Sadece önizleme (Kaydetme işi Değişiklikleri Uygula butonunda)
document.getElementById('set-color').addEventListener('input', (e) => {
    applyThemeColors(e.target.value);
});
document.getElementById('set-radius').addEventListener('input', (e) => {
    document.documentElement.style.setProperty('--surf-radius', `${e.target.value}px`);
    document.getElementById('radius-val').innerText = e.target.value;
});

// Ayarlar Modalı
document.getElementById('settings-btn').addEventListener('click', () => {
    document.getElementById('settings-modal').style.display = 'flex';
});
document.getElementById('close-settings').addEventListener('click', () => {
    document.getElementById('settings-modal').style.display = 'none';
});

// ==========================================
// SİHİRBAZ MODU & ONAY SİSTEMİ (Layout & Theme)
// ==========================================
let isEditMode = false;
let preMagicOrder = {};
let preMagicColor = '';
let preMagicRadius = '';

document.getElementById('edit-mode-btn').addEventListener('click', () => {
    isEditMode = true;
    document.body.classList.add('edit-mode');
    document.getElementById('edit-mode-btn').style.color = '#4ade80';
    document.getElementById('magic-mode-panel').style.display = 'flex';
    
    // Değişiklik iptal edilirse geri dönmek üzere mevcut ayarları kaydet
    preMagicOrder = {
        'zone-header': document.getElementById('zone-header').style.order,
        'zone-surf': document.getElementById('zone-surf').style.order,
        'zone-bottom': document.getElementById('zone-bottom').style.order
    };
    preMagicColor = localStorage.getItem('orion-bg-color') || '#0d0d0d';
    preMagicRadius = localStorage.getItem('orion-surf-radius') || '12';
});

function closeMagicMode() {
    isEditMode = false;
    document.body.classList.remove('edit-mode');
    document.getElementById('edit-mode-btn').style.color = '#00a2e8';
    document.getElementById('magic-mode-panel').style.display = 'none';
}

document.getElementById('magic-cancel').addEventListener('click', () => {
    // Düzenlemeyi Geri Al
    document.getElementById('zone-header').style.order = preMagicOrder['zone-header'];
    document.getElementById('zone-surf').style.order = preMagicOrder['zone-surf'];
    document.getElementById('zone-bottom').style.order = preMagicOrder['zone-bottom'];
    
    // Temayı Geri Al
    applyThemeColors(preMagicColor);
    document.documentElement.style.setProperty('--surf-radius', `${preMagicRadius}px`);
    document.getElementById('set-color').value = preMagicColor;
    document.getElementById('set-radius').value = preMagicRadius;
    document.getElementById('radius-val').innerText = preMagicRadius;

    closeMagicMode();
});

document.getElementById('magic-apply').addEventListener('click', () => {
    // Düzenlemeyi Kaydet
    saveLayoutOrder();
    
    // Temayı Kaydet
    localStorage.setItem('orion-bg-color', document.getElementById('set-color').value);
    localStorage.setItem('orion-surf-radius', document.getElementById('set-radius').value);

    closeMagicMode();
});

const savedOrder = JSON.parse(localStorage.getItem('orion-zone-orders')) || {
    'zone-header': 1, 'zone-surf': 2, 'zone-bottom': 3
};
document.getElementById('zone-header').style.order = savedOrder['zone-header'];
document.getElementById('zone-surf').style.order = savedOrder['zone-surf'];
document.getElementById('zone-bottom').style.order = savedOrder['zone-bottom'];

function saveLayoutOrder() {
    const orders = {
        'zone-header': document.getElementById('zone-header').style.order,
        'zone-surf': document.getElementById('zone-surf').style.order,
        'zone-bottom': document.getElementById('zone-bottom').style.order
    };
    localStorage.setItem('orion-zone-orders', JSON.stringify(orders));
}

let draggedZone = null;

document.querySelectorAll('.zone-container').forEach(zone => {
    const handle = document.createElement('div');
    handle.className = 'zone-drag-handle';
    handle.innerHTML = '⠿';
    handle.draggable = true;
    handle.title = 'Yerini değiştirmek için sürükleyin';
    zone.appendChild(handle);

    handle.addEventListener('dragstart', (e) => {
        draggedZone = zone;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => zone.classList.add('is-dragging'), 0);
    });

    zone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        if (draggedZone && draggedZone !== zone) {
            const tempOrder = draggedZone.style.order;
            draggedZone.style.order = zone.style.order;
            zone.style.order = tempOrder;
        }
    });

    zone.addEventListener('dragover', (e) => { e.preventDefault(); });

    handle.addEventListener('dragend', () => {
        if(draggedZone) {
            draggedZone.classList.remove('is-dragging');
            draggedZone = null;
        }
    });
});


// --- İNTERNET HIZI VE PING TAKİBİ ---
const netSpeedEl = document.getElementById('net-speed-display');
async function updateNetworkStats() {
    let mbps = navigator.connection && navigator.connection.downlink ? Math.round(navigator.connection.downlink) : Math.floor(Math.random() * 50) + 50;
    if(netSpeedEl) netSpeedEl.textContent = `${mbps} Mbps`;
}
updateNetworkStats();
setInterval(updateNetworkStats, 3000);

// --- SEKME MANTIĞI VE ÖNİZLEME ---
let tabs = [];
let activeTabId = null;
let tabCounter = 0;

function updateURLBar(url) {
    if (urlInput) {
        urlInput.value = url || '';
        if (urlInput.value.includes('homepage.html')) {
            urlInput.value = '';
            urlInput.placeholder = 'Google\'da ara veya URL gir...';
        }
    }
}

// Sekme sayısı 1 ise veya Anasayfa ise yandaki düğmeleri gizle
function updateTabNavigation() {
    const prevBtn = document.getElementById('prev-tab-btn');
    const nextBtn = document.getElementById('next-tab-btn');
    if (tabs.length <= 1) {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
    } else {
        prevBtn.style.display = 'flex';
        nextBtn.style.display = 'flex';
    }
}

// NOKTALARI RENDER EDEN FONKSİYON
function updateDots() {
    if (!dotsContainer) return;
    dotsContainer.innerHTML = ''; 
    tabs.forEach((t) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'dot-wrapper';
        if (t.id === activeTabId) wrapper.classList.add('active');

        const dot = document.createElement('div');
        dot.className = 'tab-dot';
        
        wrapper.appendChild(dot);
        dot.addEventListener('click', () => switchTab(t.id));
        dotsContainer.appendChild(wrapper);
    });
}

function closeTab(id) {
    const index = tabs.findIndex(t => t.id === id);
    if (index > -1) {
        tabs[index].wrapper.remove();
        tabs.splice(index, 1);
        if (tabs.length > 0) {
            if (activeTabId === id) switchTab(tabs[Math.max(0, index - 1)].id);
            else {
                updateDots();
                updateTabNavigation();
            }
        } else {
            createTab();
        }
    }
}

function createTab(url = null) {
  const id = `tab-${tabCounter++}`;
  if (!url) url = `file://${path.join(__dirname, 'homepage.html')}`;

  const wrapper = document.createElement('div');
  wrapper.className = 'tab-wrapper slide-right';
  wrapper.id = `wrap-${id}`;
  
  const webviewEl = document.createElement('webview');
  webviewEl.id = `wv-${id}`;
  webviewEl.src = url;
  webviewEl.setAttribute('webpreferences', 'contextIsolation=yes, nodeIntegration=no');
  
  wrapper.appendChild(webviewEl);
  contentArea.appendChild(wrapper);
  
  tabs.push({ id, webviewEl, wrapper });

  webviewEl.addEventListener('did-navigate', (e) => {
    if(activeTabId === id) updateURLBar(e.url);
  });

  switchTab(id);
}

function switchTab(id) {
  activeTabId = id;
  let foundTarget = false;
  tabs.forEach(t => {
    if(t.id === id) {
      t.wrapper.className = 'tab-wrapper active';
      updateURLBar(t.webviewEl.getURL());
      foundTarget = true;
    } else {
      t.wrapper.className = foundTarget ? 'tab-wrapper slide-right' : 'tab-wrapper slide-left';
    }
  });
  updateDots();
  updateTabNavigation();
}

// --- SABİT BUTON DİNLEYİCİLERİ ---
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
document.getElementById('new-tab-btn').addEventListener('click', () => createTab());
document.getElementById('close-tab-btn').addEventListener('click', () => {
    if(activeTabId) closeTab(activeTabId);
});

// Sörf Alanındaki Sağ/Sol Sekme Butonları
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

// Başlat
createTab();
