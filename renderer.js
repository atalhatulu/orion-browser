document.addEventListener('DOMContentLoaded', () => {
  // Exposed APIs from preload.js
  const ipc = window.ipc;
  const utils = window.utils;

  if (!ipc || !utils) {
    console.error('Required APIs not exposed. Check preload.js');
    return;
  }

  const urlInput = document.getElementById('url-input');
  const contentArea = document.getElementById('content-area');
  const dotsContainer = document.getElementById('tab-dots-container');
  const homepageEl = document.getElementById('homepage-container');

  // Ana sayfa her zaman hazır, ilk dot'u ekle
  // tabs aşağıda let ile tanımlanıyor (259), bu yüzden setTimeout ile erteliyoruz
  setTimeout(() => {
      try {
          const savedSession = localStorage.getItem('orion-saved-session');
          if (savedSession) {
              const urls = JSON.parse(savedSession);
              if (urls && urls.length > 0) {
                  const modal = document.getElementById('session-restore-modal');
                  const desc = document.getElementById('session-restore-desc');
                  const btnYes = document.getElementById('session-restore-yes');
                  const btnNo = document.getElementById('session-restore-no');
                  
                  if (modal) {
                      desc.innerText = `Tarayıcı beklenmedik şekilde kapandı veya açık sekmelerle kapatıldı. (${urls.length} açık sekme bulundu.)`;
                      modal.style.display = 'flex';
                      
                      btnYes.onclick = () => {
                          modal.style.display = 'none';
                          localStorage.removeItem('orion-saved-session');
                          urls.forEach(u => createTab(u));
                      };
                      
                      btnNo.onclick = () => {
                          modal.style.display = 'none';
                          localStorage.removeItem('orion-saved-session');
                          createTab('about:blank');
                      };
                  } else {
                      createTab('about:blank');
                  }
              } else {
                  createTab('about:blank');
              }
          } else {
              createTab('about:blank');
          }
      } catch(e) {}
  }, 5);

  let originalZoneOrder = [];

  // --- WINDOW CONTROLS ---
  document.getElementById('min-btn').addEventListener('click', () => ipc.send('window-minimize'));
  document.getElementById('max-btn').addEventListener('click', () => ipc.send('window-maximize'));
  document.getElementById('close-btn').addEventListener('click', () => ipc.send('window-close'));

  ipc.on('window-state', (event, state) => {
      if (state === 'maximized') document.body.classList.add('is-maximized');
      else document.body.classList.remove('is-maximized');
  });

  ipc.on('update-theme', (event, colors) => {
      applyThemeColors(colors.bg, colors.text);
  });

  // İndirme yöneticisi
  let activeDownloads = {};
  let downloadSpeeds = {};

  ipc.on('download-started', (event, data) => {
      activeDownloads[data.filename] = { progress: 0, filename: data.filename, receivedBytes: 0, totalBytes: 0, startTime: Date.now() };
      downloadSpeeds[data.filename] = [];
      updateDownloadUI();
  });

  ipc.on('download-progress', (event, data) => {
      if (activeDownloads[data.filename]) {
          const dl = activeDownloads[data.filename];
          dl.progress = data.progress;
          dl.receivedBytes = data.receivedBytes || 0;
          dl.totalBytes = data.totalBytes || 0;
          // Hız hesapla (son 3 saniyenin ortalaması)
          const now = Date.now();
          if (!dl.speedSamples) dl.speedSamples = [];
          dl.speedSamples.push({ time: now, bytes: dl.receivedBytes });
          // 3 saniyeden eski örnekleri temizle
          dl.speedSamples = dl.speedSamples.filter(s => now - s.time < 3000);
          updateDownloadUI();
      }
  });

  ipc.on('download-done', (event, data) => {
      if (activeDownloads[data.filename]) {
          delete activeDownloads[data.filename];
          delete downloadSpeeds[data.filename];
          updateDownloadUI();
      }
  });

  function formatSpeed(bytesPerSec) {
      if (bytesPerSec > 1024 * 1024) return (bytesPerSec / 1024 / 1024).toFixed(1) + ' MB/s';
      if (bytesPerSec > 1024) return (bytesPerSec / 1024).toFixed(0) + ' KB/s';
      return bytesPerSec.toFixed(0) + ' B/s';
  }

  function updateDownloadUI() {
      const statusEl = document.getElementById('download-status');
      const sepEl = document.getElementById('download-sep');
      if (!statusEl) return;
      const names = Object.keys(activeDownloads);
      if (names.length === 0) {
          statusEl.style.display = 'none';
          if (sepEl) sepEl.style.display = 'none';
          return;
      }
      statusEl.style.display = 'flex';
      if (sepEl) sepEl.style.display = 'flex';
      const first = activeDownloads[names[0]];
      // Hız hesapla
      let speed = 0;
      if (first.speedSamples && first.speedSamples.length > 1) {
          const oldest = first.speedSamples[0];
          const newest = first.speedSamples[first.speedSamples.length - 1];
          const dt = (newest.time - oldest.time) / 1000;
          if (dt > 0) speed = (newest.bytes - oldest.bytes) / dt;
      }
      if (names.length === 1) {
          statusEl.textContent = `📥 ${first.filename} %${first.progress} · ${formatSpeed(speed)}`;
      } else {
          statusEl.textContent = `📥 ${names.length} dosya · ${formatSpeed(speed)}`;
      }
  }

  // Incognito Check
  const isIncognitoMode = new URLSearchParams(window.location.search).get('incognito') === 'true';
  if (isIncognitoMode) {
      document.body.classList.add('incognito-theme');
      const badge = document.querySelector('.status-badge');
      if (badge) badge.innerHTML = '🕵️ Gizli Sekme';
  }

  // --- COLOR AND THEME LOGIC ---
  function hexToRgbStr(hex) {
      if(!hex) return '255, 255, 255';
      if(hex.startsWith('#')) hex = hex.slice(1);
      var r = parseInt(hex.substr(0,2),16); if(isNaN(r)) r = 255;
      var g = parseInt(hex.substr(2,2),16); if(isNaN(g)) g = 255;
      var b = parseInt(hex.substr(4,2),16); if(isNaN(b)) b = 255;
      return `${r}, ${g}, ${b}`;
  }

  function applyThemeColors(hexcolor, textcolor) {
      document.body.style.setProperty('--bg-color', hexcolor);
      document.body.style.setProperty('--text-color', textcolor);
      const textRgb = hexToRgbStr(textcolor);
      document.body.style.setProperty('--text-color-rgb', textRgb);
      const bgRgb = hexToRgbStr(hexcolor);
      document.body.style.setProperty('--bg-color-rgb', bgRgb);

      // Update theme in all webviews (if any)
      if (typeof tabs !== 'undefined') {
          tabs.forEach(t => {
              try {
                  let url = t.webviewEl.getURL();
                  if(url.includes('settings.html')) {
                      t.webviewEl.executeJavaScript(`
                          document.documentElement.style.setProperty('--text-color', '${textcolor}');
                          document.documentElement.style.setProperty('--text-color-rgb', '${rgb}');
                          document.body.style.color = '${textcolor}';
                      `);
                  }
              } catch(e) {}
          });
      }
  }

  // Magic Mode (Otomatik renk yönetimi)
  function toggleMagicMode(enabled) {
      if(enabled) {
          document.body.classList.add('magic-mode');
      } else {
          document.body.classList.remove('magic-mode');
      }
  }

  // Tema ayarı artık sayfanın en altında, tabs tanımlandıktan sonra çağrılacak

  // ==========================================
  // PANEL DİZİLİM MANTIĞI (SÜRÜKLE BIRAK)
  // ==========================================
  const zoneContainer = document.querySelector('.browser-main-view');
  let draggedZone = null;
  let dragPlaceholder = null;

  function saveLayoutOrder() {
      if (!zoneContainer) return;
      const orders = {};
      Array.from(zoneContainer.children).filter(el => el.classList.contains('zone-container')).forEach((z, i) => {
          orders[z.id] = i + 1;
      });
      localStorage.setItem('orion-zone-orders', JSON.stringify(orders));
  }

  function updateZoneOrderFromDOM() {
      if (!zoneContainer) return;
      const zones = Array.from(zoneContainer.children).filter(el => el.classList.contains('zone-container'));
      zones.forEach((z, i) => {
          z.style.order = i + 1;
      });
  }

  function showPlaceholder(index) {
      if (!dragPlaceholder) {
          dragPlaceholder = document.createElement('div');
          dragPlaceholder.style.cssText = 'height: 5px; background: #00a2e8; border-radius: 3px; margin: 3px 0; box-shadow: 0 0 12px rgba(0,162,232,0.5); transition: all 0.15s;';
      }
      const zones = Array.from(zoneContainer.children).filter(el => el.classList.contains('zone-container'));
      dragPlaceholder.remove();
      if (index < zones.length) {
          zoneContainer.insertBefore(dragPlaceholder, zones[index]);
      } else {
          zoneContainer.appendChild(dragPlaceholder);
      }
  }

  function hidePlaceholder() {
      if (dragPlaceholder) dragPlaceholder.remove();
  }

  function enableDragDrop() {
      // Sadece header ve bottom'ın drag handle'ları sürüklenebilir
      document.querySelectorAll('#zone-header .drag-handle, #zone-bottom .drag-handle').forEach(handle => {
          handle.setAttribute('draggable', 'true');
          handle.addEventListener('dragstart', onDragStart);
          handle.addEventListener('dragend', onDragEnd);
          const zone = handle.closest('.zone-container');
          if (zone) zone.classList.add('zone-draggable');
      });
      zoneContainer.addEventListener('dragover', onDragOver);
      zoneContainer.addEventListener('dragleave', onDragLeave);
      zoneContainer.addEventListener('drop', onDrop);
  }

  function disableDragDrop() {
      document.querySelectorAll('.drag-handle').forEach(handle => {
          handle.removeAttribute('draggable');
          handle.removeEventListener('dragstart', onDragStart);
          handle.removeEventListener('dragend', onDragEnd);
          const zone = handle.closest('.zone-container');
          if (zone) zone.classList.remove('zone-draggable');
      });
      zoneContainer.removeEventListener('dragover', onDragOver);
      zoneContainer.removeEventListener('dragleave', onDragLeave);
      zoneContainer.removeEventListener('drop', onDrop);
      hidePlaceholder();
  }

  function onDragStart(e) {
      draggedZone = e.target.closest('.zone-container');
      if (!draggedZone) return;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedZone.id);
      setTimeout(() => draggedZone.style.opacity = '0.4', 0);
  }

  function onDragEnd() {
      if (draggedZone) draggedZone.style.opacity = '';
      draggedZone = null;
      hidePlaceholder();
  }

  function onDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!draggedZone) return;
      const zones = Array.from(zoneContainer.children).filter(el => el.classList.contains('zone-container'));
      let dropIndex = zones.length;
      for (let i = 0; i < zones.length; i++) {
          const rect = zones[i].getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          if (e.clientY < mid) { dropIndex = i; break; }
      }
      showPlaceholder(dropIndex);
  }

  function onDragLeave(e) {
      if (!zoneContainer.contains(e.relatedTarget)) {
          hidePlaceholder();
      }
  }

  function onDrop(e) {
      e.preventDefault();
      hidePlaceholder();
      const draggedId = e.dataTransfer.getData('text/plain');
      if (!draggedId) return;

      const draggedEl = document.getElementById(draggedId);
      if (!draggedEl) return;

      // Drop pozisyonunu hesapla
      const zones = Array.from(zoneContainer.children).filter(el => el.classList.contains('zone-container') && el !== draggedEl);
      let dropIndex = zones.length;
      for (let i = 0; i < zones.length; i++) {
          const rect = zones[i].getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          if (e.clientY < mid) { dropIndex = i; break; }
      }
      zones.splice(dropIndex, 0, draggedEl);

      // DOM'u yeniden sırala
      zones.forEach(z => zoneContainer.appendChild(z));
      updateZoneOrderFromDOM();
      saveLayoutOrder();
      if (draggedZone) draggedZone.style.opacity = '';
      draggedZone = null;
  }

  // Edit mode değişimini izle
  const editObserver = new MutationObserver(() => {
      if (document.body.classList.contains('edit-mode')) {
          enableDragDrop();
      } else {
          disableDragDrop();
      }
  });
  editObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // Başlangıçta eğer edit-mode aktifse DnD'yi etkinleştir
  if (document.body.classList.contains('edit-mode')) {
      enableDragDrop();
  }

  // Initialize order from saved layout
  const savedOrder = JSON.parse(localStorage.getItem('orion-zone-orders')) || {
      'zone-header': 1,
      'zone-surf': 2,
      'zone-bottom': 3
  };
  Object.keys(savedOrder).forEach(id => {
      const el = document.getElementById(id);
      if (el) {
          el.style.order = savedOrder[id];
      }
  });
  
  const zoneEls = Array.from(document.querySelectorAll('.zone-container')).sort((a, b) => {
      const oa = parseInt(a.style.order) || 0;
      const ob = parseInt(b.style.order) || 0;
      return oa - ob;
  });
  zoneEls.forEach(el => zoneContainer.appendChild(el));

  // ---- Rest of the original code (tab management, etc.) ----
  let tabs = [];
  let activeTabId = null;
  let tabCounter = 0;
  let isUrlBarHovered = false;

  function updateURLBar() {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (!activeTab || !urlInput) {
          // Homepage veya boş durum
          if (urlInput) {
              urlInput.value = '';
              urlInput.placeholder = "Google'da ara veya URL gir...";
          }
          return;
      }

      let url = '';
      try { url = activeTab.webviewEl.getURL(); } catch(e){}
      let title = activeTab.title || url;

      // data URI'leri (homepage) temiz göster
      if (!url || url.startsWith('data:') || url === 'about:blank') {
          urlInput.value = '';
          urlInput.placeholder = "Google'da ara veya URL gir...";
          if (homepageEl) homepageEl.classList.remove('hidden');
          return;
      }
      if (homepageEl) homepageEl.classList.add('hidden');
      if (url.includes('settings.html')) {
          urlInput.value = '';
          urlInput.placeholder = '⚙️ Ayarlar';
          return;
      }

      // Input hover edildiğinde veya odaklandığında gerçek URL'yi göster, yoksa Başlığı göster
      if (isUrlBarHovered || document.activeElement === urlInput) {
          urlInput.value = url;
      } else {
          urlInput.value = title;
      }
  }

  // URL Çubuğu etkileşimlerini dinle
  urlInput.addEventListener('mouseenter', () => { isUrlBarHovered = true; updateURLBar(); });
  urlInput.addEventListener('mouseleave', () => { isUrlBarHovered = false; updateURLBar(); });
  urlInput.addEventListener('focus', () => { updateURLBar(); urlInput.select(); });
  urlInput.addEventListener('blur', () => { updateURLBar(); });

  // --- OTURUM KURTARMA ---
  function saveSession() {
      const urls = tabs.map(t => {
          try { return t.webviewEl.getURL(); }
          catch(e) { return null; }
      }).filter(u => u && !u.startsWith('data:') && u !== 'about:blank');
      localStorage.setItem('orion-saved-session', JSON.stringify(urls));
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

  // NOKTALARI RENDER ET
  function updateDots() {
      saveSession();
      if (!dotsContainer) return;

      if (tabs.length === 0) {
          dotsContainer.innerHTML = '';
          const hw = document.createElement('div');
          hw.className = 'dot-wrapper active';
          const hd = document.createElement('div');
          hd.className = 'tab-dot';
          hd.title = 'Sekme';
          hw.appendChild(hd);
          dotsContainer.appendChild(hw);
          return;
      }

      // Mevcut wrapper'ları map'te tutarak DOM'u yeniden yaratmaktan kaçınalım
      const existingWrappers = Array.from(dotsContainer.querySelectorAll('.dot-wrapper'));
      const existingMap = new Map();
      existingWrappers.forEach(w => {
          if (w.dataset.tabId) existingMap.set(w.dataset.tabId, w);
      });

      dotsContainer.innerHTML = ''; // Temizleyip doğru sırayla ekleyeceğiz ama elementler aynı kalacak

      tabs.forEach((t) => {
          let wrapper = existingMap.get(t.id);
          if (!wrapper) {
              wrapper = document.createElement('div');
              wrapper.dataset.tabId = t.id;
              wrapper.className = 'dot-wrapper';

              wrapper.addEventListener('dragstart', (e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', t.id);
                  setTimeout(() => wrapper.classList.add('is-dragging-dot'), 0);
              });
              wrapper.addEventListener('dragend', () => wrapper.classList.remove('is-dragging-dot'));
              wrapper.addEventListener('dragenter', (e) => e.preventDefault());
              wrapper.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
              wrapper.addEventListener('drop', (e) => {
                  e.preventDefault(); wrapper.classList.remove('is-dragging-dot');
                  const draggedId = e.dataTransfer.getData('text/plain');
                  if (draggedId && draggedId !== t.id) {
                      const di = tabs.findIndex(tab => tab.id === draggedId);
                      const ti = tabs.findIndex(tab => tab.id === t.id);
                      if (di !== -1 && ti !== -1) {
                          const [d] = tabs.splice(di, 1);
                          tabs.splice(ti, 0, d);
                          updateDots();
                      }
                  }
              });

              const dot = document.createElement('div');
              dot.className = 'tab-dot';
              wrapper.appendChild(dot);

              const closeBtn = document.createElement('div');
              closeBtn.className = 'dot-close-btn';
              closeBtn.innerHTML = '&times;';
              closeBtn.title = 'Sekmeyi Kapat';
              closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeTab(t.id); });
              wrapper.appendChild(closeBtn);

              // Tıklama event'i sadece noktada değil tüm wrapper üzerinde olmalı ki kolay tıklansın
              wrapper.addEventListener('click', () => switchTab(t.id));
          }

          // Durumları güncelle
          wrapper.className = 'dot-wrapper' + (t.id === activeTabId ? ' active' : '');
          wrapper.draggable = tabs.length > 1;
          const dot = wrapper.querySelector('.tab-dot');
          if (dot) dot.title = t.title || 'Sekme';

          const closeBtn = wrapper.querySelector('.dot-close-btn');
          if (closeBtn) {
              let isOnlyHomepage = false;
              if (tabs.length === 1) {
                  try {
                      const u = t.webviewEl.getURL();
                      if (!u || u === '' || u.startsWith('data:text/html')) {
                          isOnlyHomepage = true;
                      }
                  } catch(e) {
                      isOnlyHomepage = true; 
                  }
              }
              closeBtn.style.display = isOnlyHomepage ? 'none' : 'flex';
          }

          dotsContainer.appendChild(wrapper);
      });

      setTimeout(() => {
          const activeNode = dotsContainer.querySelector('.dot-wrapper.active');
          if (activeNode) activeNode.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }, 50);
  }

  function closeTab(id) {
      const index = tabs.findIndex(t => t.id === id);
      if (index > -1) {
          tabs[index].webviewEl.remove();
          tabs[index].wrapper.remove();
          tabs.splice(index, 1);
          if (tabs.length > 0) {
              if (activeTabId === id) switchTab(tabs[Math.max(0, index - 1)].id);
              else { updateDots(); updateTabNavigation(); }
          } else {
              // Son sekme kapanınca tarayıcıyı tamamen kapat
              ipc.send('window-close');
          }
      }
  }

  // Ana sayfayı göster (tüm webview sekmelerini gizle)
  function showHomepage() {
      if (homepageEl) homepageEl.classList.remove('hidden');
      tabs.forEach(t => {
          t.wrapper.style.display = 'none';
          if (t.webviewEl) t.webviewEl.style.display = 'none';
      });
      activeTabId = null;
      currentWebviewTabId = null;
      urlInput.value = '';
      urlInput.placeholder = "Google'da ara veya URL gir...";
      updateDots();
      updateNavButtons();
      updateTabNavigation();
  }

  // Homepage'den tıklanan link/settings aynı görünümde açılsın
  let currentWebviewTabId = null;

  function openInCurrentView(url) {
      if (!url) { showHomepage(); return; }
      if (homepageEl) homepageEl.classList.add('hidden');

      // Varsa mevcut current webview'ı kullan
      if (currentWebviewTabId) {
          const existing = tabs.find(t => t.id === currentWebviewTabId);
          if (existing && existing.webviewEl) {
              existing.webviewEl.loadURL(url);
              switchTab(existing.id);
              urlInput.focus();
              return;
          }
      }

      // Yoksa yeni webview oluştur (current olarak işaretle)
      const id = `tab-${tabCounter++}`;
      currentWebviewTabId = id;
      const wrapper = document.createElement('div');
      wrapper.className = 'tab-wrapper slide-right';
      wrapper.id = `wrap-${id}`;
      const webviewEl = document.createElement('webview');
      webviewEl.id = `wv-${id}`;
      webviewEl.setAttribute('src', url);
      
      const isIncognito = new URLSearchParams(window.location.search).get('incognito') === 'true';
      if (isIncognito) {
          webviewEl.setAttribute('partition', 'incognito_win');
      }
      
      webviewEl.setAttribute('webpreferences', 'contextIsolation=yes, sandbox=no, webSecurity=no');
      webviewEl.setAttribute('allowpopups', '');
      webviewEl.addEventListener('did-finish-load', () => {
          let cu = webviewEl.getURL();
          if (cu.includes('settings.html')) {
              const bg = localStorage.getItem('orion-bg-color')||'#0d0d0d';
              const txt = localStorage.getItem('orion-text-color')||'#ffffff';
              webviewEl.executeJavaScript(`document.documentElement.style.setProperty('--text-color','${txt}');document.documentElement.style.setProperty('--text-color-rgb','${hexToRgbStr(txt)}');document.body.style.color='${txt}';document.body.style.background='transparent';if(document.querySelector('.sidebar'))document.querySelector('.sidebar').style.background='transparent';`);
          }
      });
      webviewEl.addEventListener('did-navigate', () => { updateURLBar(); updateDots(); updateNavButtons(); });
      webviewEl.addEventListener('context-menu', (e) => { e.preventDefault(); ipc.send('show-context-menu', {mediaType:e.params.mediaType||'',srcURL:e.params.srcURL||'',linkURL:e.params.linkURL||''}); });
      webviewEl.addEventListener('did-navigate-in-page', () => { updateURLBar(); updateNavButtons(); });
      webviewEl.addEventListener('page-title-updated', (e) => { const t = tabs.find(t=>t.id===id); if(t) t.title=e.title; if(activeTabId===id) updateURLBar(); updateDots(); });
      webviewEl.addEventListener('console-message', (e) => {
          if(e.message && e.message.startsWith('ORION_IPC:')) {
              const p = e.message.split(':'); const action = p[1]; const data = p.slice(2).join(':');
              if (action === 'update-bg-color') { const t=localStorage.getItem('orion-text-color')||'#ffffff'; applyThemeColors(data,t); localStorage.setItem('orion-bg-color',data); }
              else if (action === 'update-text-color') { const b=localStorage.getItem('orion-bg-color')||'#0d0d0d'; applyThemeColors(b,data); localStorage.setItem('orion-text-color',data); }
              else if (action === 'update-radius') { document.documentElement.style.setProperty('--surf-radius',`${data}px`); localStorage.setItem('orion-surf-radius',data); }
              else if (action === 'update-theme-mode') { 
                  localStorage.setItem('orion-theme-mode', data); 
                  if(data==='light') {
                      document.body.classList.add('light-theme'); 
                      localStorage.setItem('orion-bg-color', '#f2f2f2');
                      localStorage.setItem('orion-text-color', '#1a1a1a');
                      applyThemeColors('#f2f2f2', '#1a1a1a');
                  } else {
                      document.body.classList.remove('light-theme'); 
                      localStorage.setItem('orion-bg-color', '#0d0d0d');
                      localStorage.setItem('orion-text-color', '#ffffff');
                      applyThemeColors('#0d0d0d', '#ffffff');
                  }
              }
              else if (ch === 'update-wallpaper') { 
                  localStorage.setItem('orion-wallpaper', d); 
                  if(d) document.body.style.backgroundImage = `url('${d}')`;
                  else document.body.style.backgroundImage = 'none';
              }
              else if (ch === 'update-custom-css') { 
                  try {
                      const css = atob(d);
                      localStorage.setItem('orion-custom-css', css); 
                      let styleEl = document.getElementById('orion-custom-css-style');
                      if(!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'orion-custom-css-style'; document.head.appendChild(styleEl); }
                      styleEl.textContent = css;
                      alert('Özel CSS uygulandı!');
                  } catch(e) {}
              }
              else if (ch === 'toggle-magic-mode') { if(d==='true') document.body.classList.add('edit-mode'); else document.body.classList.remove('edit-mode'); }
              else if (ch === 'clear-cookies') { ipc.invoke('clear-cookies').then(()=>alert('Çerezler temizlendi!')); }
              else if (ch === 'save-adblock') { 
                  localStorage.setItem('orion-adblock-list', d); 
                  try { const arr = JSON.parse(d); ipc.send('update-adblock-list', arr); } catch(e){}
                  alert('Reklam engelleyici listesi güncellendi!'); 
              }
              else if (ch === 'save-permissions') { 
                  localStorage.setItem('orion-site-permissions', d); 
                  try { const p = JSON.parse(d); ipc.send('update-permissions', p); } catch(e){}
                  alert('Site izinleri kaydedildi!'); 
              }
          }
      });
      wrapper.appendChild(webviewEl);
      contentArea.appendChild(wrapper);
      tabs.push({ id, webviewEl, wrapper, isCurrent: true });
      switchTab(id); updateTabNavigation(); updateDots();
      urlInput.focus();
  }

  // Homepage arama
  function setupHomepageSearch() {
      const searchInput = document.getElementById('hp-search');
      if (!searchInput) return;
      searchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && e.target.value.trim()) {
              const query = 'https://www.google.com/search?q=' + encodeURIComponent(e.target.value.trim());
              const activeTab = tabs.find(t => t.id === activeTabId);
              if (activeTab && activeTab.webviewEl) {
                  try {
                      const url = activeTab.webviewEl.getURL();
                      if (!url || url.startsWith('data:') || url === 'about:blank') {
                          activeTab.webviewEl.loadURL(query);
                      } else {
                          createTab(query);
                      }
                  } catch(e) { createTab(query); }
              } else {
                  createTab(query);
              }
              e.target.value = '';
          }
      });
  }
  setupHomepageSearch();

  // Homepage kısayol linkleri
  function setupHomepageLinks() {
      document.querySelectorAll('.hp-shortcut').forEach(link => {
          link.addEventListener('click', (e) => {
              e.preventDefault();
              const href = link.getAttribute('href');
              let targetUrl = href;
              if (href && href !== '#' && !href.startsWith('javascript:')) {
                  targetUrl = href;
              } else if (link.id === 'hp-settings-link') {
                  targetUrl = utils.getAssetPath('settings.html');
              } else {
                  return;
              }
              
              const activeTab = tabs.find(t => t.id === activeTabId);
              if (activeTab && activeTab.webviewEl) {
                  try {
                      const url = activeTab.webviewEl.getURL();
                      if (!url || url.startsWith('data:') || url === 'about:blank') {
                          activeTab.webviewEl.loadURL(targetUrl);
                      } else {
                          createTab(targetUrl);
                      }
                  } catch(e) { createTab(targetUrl); }
              } else {
                  createTab(targetUrl);
              }
          });
      });
  }
  setupHomepageLinks();

  // Homepage saat
  function updateHomepageClock() {
      const clock = document.getElementById('hp-clock');
      const dateEl = document.getElementById('hp-date');
      if (!clock || !dateEl) return;
      const now = new Date();
      clock.textContent = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      dateEl.textContent = now.toLocaleDateString('tr-TR', { weekday: 'long', month: 'long', day: 'numeric' });
  }
  updateHomepageClock();
  setInterval(updateHomepageClock, 1000);

  function createTab(url = null) {
      if (!url) url = 'about:blank';

      const id = `tab-${tabCounter++}`;

      if (homepageEl) homepageEl.classList.add('hidden');

      const wrapper = document.createElement('div');
      wrapper.className = 'tab-wrapper';
      wrapper.id = `wrap-${id}`;

      const webviewEl = document.createElement('webview');
      webviewEl.id = `wv-${id}`;
      webviewEl.setAttribute('src', url);
      
      const isIncognito = new URLSearchParams(window.location.search).get('incognito') === 'true';
      if (isIncognito) {
          webviewEl.setAttribute('partition', 'incognito_win');
      }
      
      webviewEl.setAttribute('webpreferences', 'contextIsolation=yes, sandbox=no, webSecurity=no');
      webviewEl.setAttribute('allowpopups', '');

      webviewEl.addEventListener('did-finish-load', () => {
          let cu = webviewEl.getURL();
          if (cu.includes('settings.html')) {
              const bg = localStorage.getItem('orion-bg-color') || '#0d0d0d';
              const txt = localStorage.getItem('orion-text-color') || '#ffffff';
              const rgb = hexToRgbStr(txt);
              const theme = localStorage.getItem('orion-theme-mode') || 'dark';
              const themeClass = theme === 'light' ? 'document.body.classList.add("light-theme");' : 'document.body.classList.remove("light-theme");';
              webviewEl.executeJavaScript(themeClass + 'document.documentElement.style.setProperty("--text-color","'+txt+'");document.documentElement.style.setProperty("--text-color-rgb","'+rgb+'");document.body.style.color="'+txt+'";document.body.style.background="transparent";if(document.querySelector(".sidebar"))document.querySelector(".sidebar").style.background="transparent"');
          }
      });
      
      webviewEl.addEventListener('crashed', () => { alert('Olamaz! Bu sayfa çöktü. Lütfen sayfayı yenileyin.'); });
      webviewEl.addEventListener('plugin-crashed', () => { alert('Eklenti çöktü!'); });
      webviewEl.addEventListener('unresponsive', () => { if(confirm('Bu sayfa yanıt vermiyor. Kapatılsın mı?')) closeTab(id); });

      webviewEl.addEventListener('did-navigate', () => { updateURLBar(); updateDots(); updateNavButtons(); });
      webviewEl.addEventListener('context-menu', (e) => { e.preventDefault(); ipc.send('show-context-menu', {mediaType:e.params.mediaType||'',srcURL:e.params.srcURL||'',linkURL:e.params.linkURL||''}); });
      webviewEl.addEventListener('did-navigate-in-page', () => { updateURLBar(); updateNavButtons(); });
      webviewEl.addEventListener('page-title-updated', (e) => { const tab=tabs.find(t=>t.id===id); if(tab) tab.title=e.title; if(activeTabId===id) updateURLBar(); updateDots(); });
      // Geçmiş kaydı
      webviewEl.addEventListener('did-navigate', () => {
          try { const u=webviewEl.getURL(); if(u&&!u.startsWith('data:')&&!u.includes('settings.html')){ const t=tabs.find(t=>t.id===id); ipc.invoke('history-write',{url:u,title:t?.title||u,timestamp:Date.now()}).catch(()=>{}); } } catch(e){}
      });
      webviewEl.addEventListener('console-message', (event) => {
          if(event.message && event.message.startsWith('ORION_IPC:')) {
              const p = event.message.split(':'); const ch = p[1]; const d = p.slice(2).join(':');
              if (ch === 'update-bg-color') { const t=localStorage.getItem('orion-text-color')||'#ffffff'; applyThemeColors(d,t); localStorage.setItem('orion-bg-color',d); }
              else if (ch === 'update-text-color') { const b=localStorage.getItem('orion-bg-color')||'#0d0d0d'; applyThemeColors(b,d); localStorage.setItem('orion-text-color',d); }
              else if (ch === 'update-radius') { document.documentElement.style.setProperty('--surf-radius',`${d}px`); localStorage.setItem('orion-surf-radius',d); }
              else if (ch === 'update-theme-mode') { 
                  localStorage.setItem('orion-theme-mode', d); 
                  if(d==='light') {
                      document.body.classList.add('light-theme'); 
                      localStorage.setItem('orion-bg-color', '#f2f2f2');
                      localStorage.setItem('orion-text-color', '#1a1a1a');
                      applyThemeColors('#f2f2f2', '#1a1a1a');
                  } else {
                      document.body.classList.remove('light-theme'); 
                      localStorage.setItem('orion-bg-color', '#0d0d0d');
                      localStorage.setItem('orion-text-color', '#ffffff');
                      applyThemeColors('#0d0d0d', '#ffffff');
                  }
              }
              else if (ch === 'update-wallpaper') { 
                  localStorage.setItem('orion-wallpaper', d); 
                  if(d) document.body.style.backgroundImage = `url('${d}')`;
                  else document.body.style.backgroundImage = 'none';
              }
              else if (ch === 'update-custom-css') { 
                  try {
                      const css = atob(d);
                      localStorage.setItem('orion-custom-css', css); 
                      let styleEl = document.getElementById('orion-custom-css-style');
                      if(!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'orion-custom-css-style'; document.head.appendChild(styleEl); }
                      styleEl.textContent = css;
                      alert('Özel CSS uygulandı!');
                  } catch(e) {}
              }
              else if (ch === 'toggle-magic-mode') { if(d==='true') document.body.classList.add('edit-mode'); else document.body.classList.remove('edit-mode'); }
              else if (ch === 'clear-cookies') { ipc.invoke('clear-cookies').then(()=>alert('Çerezler temizlendi!')); }
              else if (ch === 'save-adblock') { 
                  localStorage.setItem('orion-adblock-list', d); 
                  try { const arr = JSON.parse(d); ipc.send('update-adblock-list', arr); } catch(e){}
                  alert('Reklam engelleyici listesi güncellendi!'); 
              }
              else if (ch === 'save-permissions') { 
                  localStorage.setItem('orion-site-permissions', d); 
                  try { const p = JSON.parse(d); ipc.send('update-permissions', p); } catch(e){}
                  alert('Site izinleri kaydedildi!'); 
              }
          }
      });

      wrapper.appendChild(webviewEl);
      contentArea.appendChild(wrapper);
      tabs.push({ id, webviewEl, wrapper });

      switchTab(id);
      updateTabNavigation();
      updateDots();
      if (url === 'about:blank' && urlInput) setTimeout(() => urlInput.focus(), 50);
  }

  function switchTab(id) {
      if (activeTabId === id) return;

      if (homepageEl) homepageEl.classList.add('hidden');

      const oldActive = tabs.find(t => t.id === activeTabId);
      const newActive = tabs.find(t => t.id === id);
      if (!newActive) return;

      if (oldActive) oldActive.wrapper.classList.remove('active');
      newActive.wrapper.classList.add('active');
      activeTabId = id;

      updateURLBar();
      updateTabNavigation();
      updateDots();
      updateNavButtons();
      if (typeof updateBookmarkBtn === 'function') updateBookmarkBtn();
  }

  // Navigasyon (İleri/Geri) Butonları Durumunu Güncelleme
  function updateNavButtons() {
      const activeTab = tabs.find(t => t.id === activeTabId);
      const navBack = document.getElementById('nav-back');
      const navFwd = document.getElementById('nav-fwd');
      if (!activeTab || !activeTab.webviewEl) {
          navBack.style.opacity = '0.3'; navBack.style.pointerEvents = 'none';
          navFwd.style.opacity = '0.3'; navFwd.style.pointerEvents = 'none';
          return;
      }
      try {
          const canGoBack = activeTab.webviewEl.canGoBack();
          const canGoForward = activeTab.webviewEl.canGoForward();
          navBack.style.opacity = canGoBack ? '1' : '0.3';
          navBack.style.pointerEvents = canGoBack ? 'auto' : 'none';
          navFwd.style.opacity = canGoForward ? '1' : '0.3';
          navFwd.style.pointerEvents = canGoForward ? 'auto' : 'none';
      } catch(e) {}
  }

  // --- KENAR ÇUBUĞU (SIDEBAR) ---
  const sidebar = document.getElementById('browser-sidebar');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  if (sidebarToggle && sidebar) {
      const isSbOpen = localStorage.getItem('orion-sidebar') === 'true';
      if (isSbOpen) sidebar.style.display = 'flex';
      
      sidebarToggle.addEventListener('click', () => {
          if (sidebar.style.display === 'none') {
              sidebar.style.display = 'flex';
              localStorage.setItem('orion-sidebar', 'true');
          } else {
              sidebar.style.display = 'none';
              localStorage.setItem('orion-sidebar', 'false');
          }
      });
  }
  document.querySelectorAll('.sb-btn').forEach(btn => {
      btn.addEventListener('click', () => {
          const action = btn.dataset.action;
          if(action === 'bookmarks') createTab(utils.getAssetPath('bookmarks.html'));
          if(action === 'history') createTab(utils.getAssetPath('history.html'));
          if(action === 'downloads') createTab(utils.getAssetPath('downloads.html'));
          if(action === 'settings') createTab(utils.getAssetPath('settings.html'));
      });
  });

  document.getElementById('nav-back').addEventListener('click', () => {
      const tab = tabs.find(t => t.id === activeTabId);
      if(tab) tab.webviewEl.goBack();
  });

  document.getElementById('nav-fwd').addEventListener('click', () => {
      const tab = tabs.find(t => t.id === activeTabId);
      if(tab) tab.webviewEl.goForward();
  });

  document.getElementById('nav-reload').addEventListener('click', () => {
      const tab = tabs.find(t => t.id === activeTabId);
      if(tab) tab.webviewEl.reload();
  });
  function getBookmarks() {
      try { return JSON.parse(localStorage.getItem('orion-bookmarks')) || []; }
      catch(e) { return []; }
  }

  document.getElementById('new-tab-btn').addEventListener('click', () => {
      createTab('about:blank');
  });

  // Hamburger menü
  const menuBtn = document.getElementById('menu-btn');
  const dropdown = document.getElementById('dropdown-menu');
  if (menuBtn && dropdown) {
      menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.classList.toggle('open');
      });
      // Menü dışına tıklayınca kapat
      document.addEventListener('click', (e) => {
          if (!e.target.closest('.menu-container')) {
              dropdown.classList.remove('open');
          }
      });
      // Menü öğeleri
      dropdown.querySelectorAll('.menu-item').forEach(item => {
          item.addEventListener('click', () => {
              dropdown.classList.remove('open');
              const action = item.dataset.action;
              if (action === 'settings') {
                  createTab(utils.getAssetPath('settings.html'));
              } else if (action === 'extensions') {
                  createTab(utils.getAssetPath('settings.html'));
              } else if (action === 'appearance') {
                  createTab(utils.getAssetPath('settings.html'));
              } else if (action === 'downloads') {
                  createTab(utils.getAssetPath('downloads.html'));
              } else if (action === 'history') {
                  createTab(utils.getAssetPath('history.html'));
              } else if (action === 'about') {
                  createTabAbout();
              } else if (action === 'bookmarks') {
                  createTab(utils.getAssetPath('bookmarks.html'));
              } else if (action === 'profile') {
                  createTab(utils.getAssetPath('settings.html'));
              } else if (action === 'new-window') {
                  ipc.send('new-window');
              } else if (action === 'incognito') {
                  ipc.send('new-incognito-window');
              } else if (action === 'print') {
                  const t = tabs.find(t => t.id === activeTabId);
                  if (t && t.webviewEl) t.webviewEl.print();
              } else if (action === 'find') {
                  const t = tabs.find(t => t.id === activeTabId);
                  if (t && t.webviewEl) t.webviewEl.openDevTools();
              }
          });
      });
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

  // Doküman seviyesinde sağ tık menüsü (webview dışı alanlar)
  document.addEventListener('contextmenu', (e) => {
      const target = e.target;
      // Webview içinden gelen event'leri engelleme (onlar zaten handle ediliyor)
      if (target.closest('webview')) return;
      e.preventDefault();
      ipc.send('show-context-menu', {
          mediaType: '',
          srcURL: '',
          linkURL: ''
      });
  });

  urlInput.addEventListener('keydown', (e) => {
      if(e.key === 'Enter') {
          let url = urlInput.value.trim();
          if (url) {
              if(!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
                if (url.startsWith('localhost')) {
                    url = 'http://' + url;
                } else if(url.includes('.')) {
                    url = 'https://' + url;
                } else {
                    url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
                }
              }
              const activeTab = tabs.find(t => t.id === activeTabId);
              if(activeTab) {
                  activeTab.webviewEl.loadURL(url);
              } else {
                  createTab(url);
              }
          }
          urlInput.blur();
      }
  });

  // Context menu'den gelen yeni sekme URL'lerini dinle
  ipc.on('new-tab-url', (event, url) => {
      createTab(url);
  });

  // F11 ile tam ekran
  document.addEventListener('keydown', (e) => {
      if (e.key === 'F11') {
          e.preventDefault();
          ipc.send('toggle-fullscreen');
      }
      if (e.key === 'w' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          const activeTab = tabs.find(t => t.id === activeTabId);
          if (activeTab) closeTab(activeTab.id);
      }
      // Ctrl+S: Zen Modu (Üst ve Alt barları gizle)
      if (e.key.toLowerCase() === 's' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          document.body.classList.toggle('zen-mode');
      }
      // Ctrl+Shift+D: Debug modu (element sınırlarını göster)
      if (e.key === 'D' && e.ctrlKey && e.shiftKey) {
          e.preventDefault();
          document.body.classList.toggle('orion-debug');
      }
  });


  function createTabAbout() {
      const aboutHtml = '<html><body style="background:#0d0d0d;color:white;font-family:sans-serif;padding:40px;text-align:center">' +
          '<h1 style="font-weight:300;font-size:36px">🌌 Orion Browser</h1>' +
          '<p style="color:rgba(255,255,255,0.5);margin:20px 0">v1.0.0 — Electron tabanlı minimal tarayıcı</p>' +
          '<div style="margin:40px 0;display:flex;gap:20px;justify-content:center">' +
          '<a href="https://atalhatulu.com" style="color:#00a2e8;text-decoration:none;padding:10px 20px;border:1px solid rgba(255,255,255,0.1);border-radius:8px">🌐 Web Sitem</a>' +
          '<a href="https://github.com/teha1" style="color:#00a2e8;text-decoration:none;padding:10px 20px;border:1px solid rgba(255,255,255,0.1);border-radius:8px">🐙 GitHub</a>' +
          '<a href="https://github.com/teha1/orion-browser" style="color:#00a2e8;text-decoration:none;padding:10px 20px;border:1px solid rgba(255,255,255,0.1);border-radius:8px">📦 Proje Repo</a>' +
          '</div>' +
          '<p style="color:rgba(255,255,255,0.3);font-size:12px">Made with ❤️ by Teha</p>' +
          '</body></html>';
      const id = 'tab-' + (tabCounter++);
      const wrapper = document.createElement('div');
      wrapper.className = 'tab-wrapper';
      wrapper.innerHTML = aboutHtml;
      if (homepageEl) homepageEl.classList.add('hidden');
      contentArea.prepend(wrapper);
      tabs.push({ id, wrapper, title: 'Hakkında' });
      switchTab(id); updateTabNavigation(); updateDots();
  }

  // === KISAYOL YÖNETİMİ ===
  const defaultShortcuts = [
      { name: 'GitHub', url: 'https://github.com', icon: '🐙' },
      { name: 'YouTube', url: 'https://youtube.com', icon: '▶️' },
      { name: 'Ayarlar', url: '#settings', icon: '⚙️' }
  ];
  function getShortcuts() {
      try { return JSON.parse(localStorage.getItem('orion-shortcuts')) || defaultShortcuts; }
      catch(e) { return defaultShortcuts; }
  }
  function saveShortcuts(list) { localStorage.setItem('orion-shortcuts', JSON.stringify(list)); }

  function renderShortcuts(container, tabId) {
      if (!container) return;
      const shortcuts = getShortcuts();
      container.innerHTML = '';
      shortcuts.forEach((s, i) => {
          const el = document.createElement('div');
          el.className = 'hp-shortcut';
          el.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;color:rgba(255,255,255,0.5);transition:0.3s;padding:10px;position:relative';
          el.innerHTML = '<div style="width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;font-size:20px">'+s.icon+'</div><span style="font-size:12px">'+s.name+'</span>';
          const del = document.createElement('div');
          del.style.cssText = 'position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:#ff5f56;color:white;font-size:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:0.2s';
          del.textContent = '×';
          el.appendChild(del);
          el.addEventListener('mouseenter', () => del.style.opacity = '1');
          el.addEventListener('mouseleave', () => del.style.opacity = '0');
          del.addEventListener('click', (e) => { e.stopPropagation(); const sc=getShortcuts(); sc.splice(i,1); saveShortcuts(sc); renderShortcuts(container,tabId); });
          el.addEventListener('click', (e) => {
              if (e.target === del) return;
              if (s.url === '#settings') createTab(utils.getAssetPath('settings.html'));
              else createTab(s.url);
          });
          container.appendChild(el);
      });
      const addBtn = document.createElement('div');
      addBtn.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;color:rgba(255,255,255,0.5);transition:0.3s;padding:10px';
      addBtn.innerHTML = '<div style="width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,0.08);border:1px dashed rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:20px">+</div><span style="font-size:12px">Ekle</span>';
      addBtn.addEventListener('click', () => {
          const overlay = document.createElement('div');
          overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:999999;display:flex;align-items:center;justify-content:center';
          const modal = document.createElement('div');
          modal.style.cssText = 'background:#1a1a1a;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:30px;width:380px;color:white;font-family:Inter,sans-serif';
          modal.innerHTML = '<h3 style="margin:0 0 20px;font-weight:500">➕ Yeni Kısayol</h3>';
          const addField = (label, ph, key) => {
              const l = document.createElement('div'); l.style.cssText = 'font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:4px;margin-top:12px'; l.textContent = label; modal.appendChild(l);
              const inp = document.createElement('input'); inp.style.cssText = 'width:100%;padding:10px 14px;border-radius:8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:white;font-size:14px;outline:none;box-sizing:border-box'; inp.placeholder = ph; modal.appendChild(inp);
              return inp;
          };
          const nameInp = addField('Site Adı', 'GitHub', 'name');
          const urlInp = addField('URL', 'https://github.com', 'url');
          const iconInp = addField('Emoji', '🐙', 'icon');
          const br = document.createElement('div'); br.style.cssText = 'display:flex;gap:10px;margin-top:20px;justify-content:flex-end';
          const cancel = document.createElement('button'); cancel.textContent = 'İptal'; cancel.style.cssText = 'padding:8px 20px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:rgba(255,255,255,0.7);cursor:pointer;font-size:14px';
          const save = document.createElement('button'); save.textContent = 'Ekle'; save.style.cssText = 'padding:8px 20px;border-radius:8px;border:none;background:#00a2e8;color:white;cursor:pointer;font-size:14px;font-weight:500';
          br.appendChild(cancel); br.appendChild(save);
          modal.appendChild(br); overlay.appendChild(modal); document.body.appendChild(overlay);
          cancel.addEventListener('click', () => overlay.remove());
          overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
          save.addEventListener('click', () => {
              const name = nameInp.value.trim() || 'Site';
              const url = urlInp.value.trim(); if (!url) return;
              const icon = iconInp.value.trim() || '🌐';
              if (!url.startsWith('http://') && !url.startsWith('https://') && url !== '#settings') return;
              const sc = getShortcuts(); sc.push({ name, url, icon }); saveShortcuts(sc);
              renderShortcuts(container, tabId); overlay.remove();
          });
          nameInp.focus();
      });
      container.appendChild(addBtn);
  }

  // === ARKAPLAN RENGİ ===
  function applyHomepageBg() {
      const c = localStorage.getItem('orion-homepage-bg-color') || '#0d0d0d';
      document.querySelectorAll('.homepage-container').forEach(el => {
          el.style.background = c || 'var(--bg-color)';
      });
  }
  applyHomepageBg();

  // === HOMEPAGE KISAYOLLARI + ARAMA ===
  setTimeout(() => {
      const c = document.querySelector('#homepage-container .hp-shortcuts');
      if (c) renderShortcuts(c, null);
      window.addEventListener('storage', (e) => { if (e.key === 'orion-homepage-bg-color') applyHomepageBg(); });
  }, 100);

  // applyThemeColors'ı arkaplan rengi ile güçlendir
  // Ana sayfa ve ayarlar teması ayrıldığı için bu kancaya artık gerek yok.

  // Ana sayfa özelleştirme sidebar
  setTimeout(() => {
      const custBtn = document.getElementById('hp-customize-btn');
      const sidebar = document.getElementById('hp-sidebar');
      const closeBtn = document.getElementById('hp-sidebar-close');
      const bgPicker = document.getElementById('hp-bg-picker');
      const settingsBtn = document.getElementById('hp-sidebar-settings');
      if (custBtn && sidebar) {
          custBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
          if (closeBtn) closeBtn.addEventListener('click', () => sidebar.classList.remove('open'));
      }
      if (bgPicker) {
          bgPicker.value = localStorage.getItem('orion-homepage-bg-color') || '#0d0d0d';
          bgPicker.addEventListener('input', (e) => {
              localStorage.setItem('orion-homepage-bg-color', e.target.value);
              const c = e.target.value;
              document.querySelectorAll('.homepage-container').forEach(el => el.style.background = c);
              tabs.forEach(t => {
                  if (t.webviewEl && t.webviewEl.getURL().startsWith('data:text/html')) {
                      t.webviewEl.executeJavaScript(`document.body.style.background="${c}"`).catch(()=>{});
                  }
              });
          });
      }
      if (settingsBtn) settingsBtn.addEventListener('click', () => { sidebar.classList.remove('open'); createTab(utils.getAssetPath('settings.html')); });
      // Widget toggle
      const ct = document.getElementById('hp-widget-clock');
      const st = document.getElementById('hp-widget-search');
      const sct = document.getElementById('hp-widget-shortcuts');
      if (ct) ct.addEventListener('change', (e) => { const el=document.getElementById('hp-clock'); if(el) el.style.display=e.target.checked?'':'none'; });
      if (st) st.addEventListener('change', (e) => { const el=document.querySelector('#homepage-container .hp-search-box'); if(el) el.style.display=e.target.checked?'':'none'; });
      if (sct) sct.addEventListener('change', (e) => { const el=document.getElementById('hp-shortcuts-root'); if(el) el.style.display=e.target.checked?'':'none'; });
  }, 150);

  // --- BAŞLANGIÇTA GİZLİLİK VE TEMA YÜKLEME ---
  try {
      // Gizlilik
      const savedAdblock = localStorage.getItem('orion-adblock-list');
      if (savedAdblock) ipc.send('update-adblock-list', JSON.parse(savedAdblock));
      const savedPerms = localStorage.getItem('orion-site-permissions');
      if (savedPerms) ipc.send('update-permissions', JSON.parse(savedPerms));

      // Tema ve CSS
      const mode = localStorage.getItem('orion-theme-mode') || 'dark';
      if(mode === 'light') document.body.classList.add('light-theme');
      else document.body.classList.remove('light-theme');

      const wp = localStorage.getItem('orion-wallpaper');
      if(wp) {
          document.body.style.backgroundImage = `url('${wp}')`;
          document.body.style.backgroundSize = 'cover';
          document.body.style.backgroundPosition = 'center';
      } else {
          document.body.style.backgroundImage = 'none';
      }

      const css = localStorage.getItem('orion-custom-css');
      if(css) {
          let styleEl = document.createElement('style');
          styleEl.id = 'orion-custom-css-style';
          styleEl.textContent = css;
          document.head.appendChild(styleEl);
      }
  } catch(e) { console.error(e); }

  // --- BELLEK GÖSTERGESİ ---
  const ramBadge = document.getElementById('ram-usage');
  if (ramBadge) {
      ipc.on('memory-usage', (memBytes) => {
          const mb = (memBytes / 1024).toFixed(1);
          ramBadge.innerText = `⚡ ${mb} MB`;
      });
  }

  }); // DOMContentLoaded
