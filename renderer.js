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
  // tabs/activeTabId aşağıda let ile tanımlanıyor, sadece updateDots'u çağır
  setTimeout(() => updateDots(), 0);

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

  ipc.on('download-started', (event, data) => {
      activeDownloads[data.filename] = { progress: 0, filename: data.filename };
      updateDownloadUI();
  });

  ipc.on('download-progress', (event, data) => {
      if (activeDownloads[data.filename]) {
          activeDownloads[data.filename].progress = data.progress;
          updateDownloadUI();
      }
  });

  ipc.on('download-done', (event, data) => {
      if (activeDownloads[data.filename]) {
          delete activeDownloads[data.filename];
          updateDownloadUI();
      }
  });

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
      if (names.length === 1) {
          statusEl.textContent = `📥 ${first.filename} %${first.progress}`;
      } else {
          statusEl.textContent = `📥 ${names.length} dosya`;
      }
  }

  // --- COLOR AND THEME LOGIC ---
  function hexToRgbStr(hex) {
      if(!hex) return '255, 255, 255';
      if(hex.startsWith('#')) hex = hex.slice(1);
      var r = parseInt(hex.substr(0,2),16) || 255;
      var g = parseInt(hex.substr(2,2),16) || 255;
      var b = parseInt(hex.substr(4,2),16) || 255;
      return `${r}, ${g}, ${b}`;
  }

  function applyThemeColors(hexcolor, textcolor) {
      document.documentElement.style.setProperty('--bg-color', hexcolor);
      document.documentElement.style.setProperty('--text-color', textcolor);
      const rgb = hexToRgbStr(textcolor);
      document.documentElement.style.setProperty('--text-color-rgb', rgb);

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
  const zoneContainer = document.querySelector('.orion-browser');
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

  document.getElementById('magic-save-btn').addEventListener('click', () => {
      document.body.classList.remove('edit-mode');
      saveLayoutOrder();
  });

  document.getElementById('magic-cancel-btn').addEventListener('click', () => {
      document.body.classList.remove('edit-mode');
      window.location.reload();
  });

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

      if (!url || url.includes('homepage.html') || url.includes('settings.html')) {
          urlInput.value = '';
          urlInput.placeholder = url.includes('settings.html') ? '⚙️ Ayarlar' : "Google'da ara veya URL gir...";
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

      // Homepage dot'u (X butonu sadece başka sekme varsa)
      const homeDot = document.createElement('div');
      const isHomepageActive = (tabs.length === 0 || activeTabId === null);
      homeDot.className = 'dot-wrapper' + (isHomepageActive ? ' active' : '');
      const hDot = document.createElement('div');
      hDot.className = 'tab-dot';
      hDot.title = 'Ana Sayfa';
      homeDot.appendChild(hDot);

      // Homepage dot X butonu (sadece başka webview varsa)
      if (tabs.length > 0) {
          const closeBtn = document.createElement('div');
          closeBtn.className = 'dot-close-btn';
          closeBtn.innerHTML = '&times;';
          closeBtn.title = "Ana Sayfayı Kapat";
          closeBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              // Sonraki webview'e geç
              if (tabs.length > 0) switchTab(tabs[0].id);
          });
          homeDot.appendChild(closeBtn);
      }

      homeDot.addEventListener('click', () => showHomepage());
      dotsContainer.appendChild(homeDot);

      // Webview sekmeleri için dotlar (her zaman X butonlu)
      tabs.forEach((t) => {
          const wrapper = document.createElement('div');
          wrapper.className = 'dot-wrapper';
          if (t.id === activeTabId) wrapper.classList.add('active');

          // Sürükle ve Bırak (Drag & Drop) Özelliği
          wrapper.draggable = tabs.length > 1; // Tek sayfa varken sürükleme iptal

          wrapper.addEventListener('dragstart', (e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', t.id);
              setTimeout(() => wrapper.classList.add('is-dragging-dot'), 0);
          });
          wrapper.addEventListener('dragend', () => wrapper.classList.remove('is-dragging-dot'));
          wrapper.addEventListener('dragenter', (e) => e.preventDefault());
          wrapper.addEventListener('dragover', (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
          });
          wrapper.addEventListener('drop', (e) => {
              e.preventDefault();
              wrapper.classList.remove('is-dragging-dot');
              const draggedId = e.dataTransfer.getData('text/plain');
              if (draggedId && draggedId !== t.id) {
                  const draggedIndex = tabs.findIndex(tab => tab.id === draggedId);
                  const dropIndex = tabs.findIndex(tab => tab.id === t.id);
                  if (draggedIndex !== -1 && dropIndex !== -1) {
                      const [draggedTab] = tabs.splice(draggedIndex, 1);
                      tabs.splice(dropIndex, 0, draggedTab); // Sekme sırasını güncelle
                      updateDots(); // Arayüzü yenile
                  }
              }
          });

          const dot = document.createElement('div');
          dot.className = 'tab-dot';
          dot.title = t.title || "Sekme";

          // Nokta Kapatma Butonu X
          const closeBtn = document.createElement('div');
          closeBtn.className = 'dot-close-btn';
          closeBtn.innerHTML = '&times;';
          closeBtn.title = "Sekmeyi Kapat";

          wrapper.appendChild(dot);
          wrapper.appendChild(closeBtn);

          dot.addEventListener('click', () => switchTab(t.id));
          closeBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              closeTab(t.id);
          });

          dotsContainer.appendChild(wrapper);
      });

      // Sonsuz dotları önlemek için container kaydırılabilir oldu. Aktif olanı merkeze kaydır.
      setTimeout(() => {
          const activeNode = dotsContainer.querySelector('.dot-wrapper.active');
          if (activeNode) activeNode.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }, 50);
  }

  function closeTab(id) {
      const index = tabs.findIndex(t => t.id === id);
      if (index > -1) {
          const tab = tabs[index];
          if (tab.webviewEl) tab.webviewEl.remove();
          tab.wrapper.remove();
          tabs.splice(index, 1);
          if (tabs.length > 0) {
              if (activeTabId === id) switchTab(tabs[Math.max(0, index - 1)].id);
              else { updateDots(); updateTabNavigation(); }
          } else {
              // Son sekme kapanınca ana sayfaya dön
              showHomepage();
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
              const p = e.message.split(':'); const ch = p[1]; const d = p.slice(2).join(':');
              if (ch === 'update-bg-color') { const t=localStorage.getItem('orion-text-color')||'#ffffff'; applyThemeColors(d,t); localStorage.setItem('orion-bg-color',d); }
              else if (ch === 'update-text-color') { const b=localStorage.getItem('orion-bg-color')||'#0d0d0d'; applyThemeColors(b,d); localStorage.setItem('orion-text-color',d); }
              else if (ch === 'update-radius') { document.documentElement.style.setProperty('--surf-radius',`${d}px`); localStorage.setItem('orion-surf-radius',d); }
              else if (ch === 'toggle-magic-mode') { if(d==='true') document.body.classList.add('edit-mode'); else document.body.classList.remove('edit-mode'); }
          }
      });
      wrapper.appendChild(webviewEl);
      contentArea.appendChild(wrapper);
      tabs.push({ id, webviewEl, wrapper, isCurrent: true });
      switchTab(id); updateTabNavigation(); updateDots();
      urlInput.focus();
  }

  // Homepage arama (URL bar'a yönlendir)
  function setupHomepageSearch() {
      const searchInput = document.getElementById('hp-search');
      if (!searchInput) return;
      const oldHandler = searchInput._orionHandler;
      if (oldHandler) searchInput.removeEventListener('keydown', oldHandler);
      const handler = (e) => {
          if (e.key === 'Enter' && e.target.value.trim()) {
              const q = e.target.value.trim();
              const url = 'https://www.google.com/search?q=' + encodeURIComponent(q);
              openInCurrentView(url);
              e.target.value = '';
          }
      };
      searchInput.addEventListener('keydown', handler);
      searchInput._orionHandler = handler;
  }
  setupHomepageSearch();

  // Homepage kısayol linklerini webview'de aç
  function setupHomepageLinks() {
      document.querySelectorAll('.hp-shortcut').forEach(link => {
          link.addEventListener('click', (e) => {
              e.preventDefault();
              const href = link.getAttribute('href');
              if (href && href !== '#' && !href.startsWith('javascript:')) {
                  openInCurrentView(href);
              } else if (link.id === 'hp-settings-link') {
                  openInCurrentView(utils.getAssetPath('settings.html'));
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
      // Ana sayfa açıksa göster, değilse ekle
      if (!url) {
          showHomepage();
          return;
      }

      const id = `tab-${tabCounter++}`;

      // Homepage'i gizle
      if (homepageEl) homepageEl.classList.add('hidden');

      const wrapper = document.createElement('div');
      wrapper.className = 'tab-wrapper slide-right';
      wrapper.id = `wrap-${id}`;

      const webviewEl = document.createElement('webview');
      webviewEl.id = `wv-${id}`;
      webviewEl.setAttribute('src', url);
      webviewEl.setAttribute('webpreferences', 'contextIsolation=yes, sandbox=no, webSecurity=no');
      webviewEl.setAttribute('allowpopups', '');

      webviewEl.addEventListener('did-finish-load', () => {
          let currentUrl = webviewEl.getURL();
          if (currentUrl.includes('settings.html')) {
              const bg = localStorage.getItem('orion-bg-color') || '#0d0d0d';
              const txt = localStorage.getItem('orion-text-color') || '#ffffff';
              const rgb = hexToRgbStr(txt);
              webviewEl.executeJavaScript(`
                  document.documentElement.style.setProperty('--text-color', '${txt}');
                  document.documentElement.style.setProperty('--text-color-rgb', '${rgb}');
                  document.body.style.color = '${txt}';
                  document.body.style.background = 'transparent';
                  if(document.querySelector('.sidebar')) document.querySelector('.sidebar').style.background = 'transparent';
              `);
          }
      });

      webviewEl.addEventListener('did-navigate', (e) => {
          updateURLBar(); updateDots(); updateNavButtons();
      });

      webviewEl.addEventListener('context-menu', (e) => {
          e.preventDefault();
          ipc.send('show-context-menu', {
              mediaType: e.params.mediaType || '',
              srcURL: e.params.srcURL || '',
              linkURL: e.params.linkURL || ''
          });
      });

      webviewEl.addEventListener('did-navigate-in-page', () => {
          updateURLBar(); updateNavButtons();
      });

      webviewEl.addEventListener('page-title-updated', (e) => {
          const tab = tabs.find(t => t.id === id);
          if(tab) tab.title = e.title;
          if(activeTabId === id) updateURLBar();
          updateDots();
      });

      // Ayarlar sayfası console-message IPC
      webviewEl.addEventListener('console-message', (event) => {
          if(event.message && event.message.startsWith('ORION_IPC:')) {
              const parts = event.message.split(':');
              const channel = parts[1];
              const data = parts.slice(2).join(':');
              if (channel === 'update-bg-color') {
                  const txt = localStorage.getItem('orion-text-color') || '#ffffff';
                  applyThemeColors(data, txt); localStorage.setItem('orion-bg-color', data);
              } else if (channel === 'update-text-color') {
                  const bg = localStorage.getItem('orion-bg-color') || '#0d0d0d';
                  applyThemeColors(bg, data); localStorage.setItem('orion-text-color', data);
              } else if (channel === 'update-radius') {
                  document.documentElement.style.setProperty('--surf-radius', `${data}px`);
                  localStorage.setItem('orion-surf-radius', data);
              } else if (channel === 'toggle-magic-mode') {
                  if (data === 'true') document.body.classList.add('edit-mode');
                  else document.body.classList.remove('edit-mode');
              }
          }
      });

      wrapper.appendChild(webviewEl);
      contentArea.appendChild(wrapper);
      tabs.push({ id, webviewEl, wrapper });

      switchTab(id);
      updateTabNavigation();
      updateDots();
  }

  function switchTab(id) {
      if (activeTabId === id) return;

      // Homepage'i gizle, webview'i göster
      if (homepageEl) homepageEl.classList.add('hidden');
      tabs.forEach(t => { if (t.wrapper) t.wrapper.style.display = ''; });

      const oldActive = tabs.find(t => t.id === activeTabId);
      const newActive = tabs.find(t => t.id === id);
      if (!newActive) return;

      if (oldActive) {
          oldActive.wrapper.classList.remove('active');
      }

      newActive.wrapper.classList.remove('slide-left', 'slide-right');
      newActive.wrapper.classList.add('active');
      activeTabId = id;

      updateURLBar();
      updateTabNavigation();
      updateDots();
      updateNavButtons();
  }

  // Navigasyon (İleri/Geri) Butonları Durumunu Güncelleme
  function updateNavButtons() {
      const activeTab = tabs.find(t => t.id === activeTabId);
      const backBtn = document.getElementById('nav-back');
      const fwdBtn = document.getElementById('nav-fwd');

      if (!activeTab || !activeTab.webviewEl) {
          if (backBtn) { backBtn.style.opacity = '0.3'; backBtn.style.pointerEvents = 'none'; }
          if (fwdBtn) { fwdBtn.style.opacity = '0.3'; fwdBtn.style.pointerEvents = 'none'; }
          return;
      }
      try {
          const canGoBack = activeTab.webviewEl.canGoBack();
          const canGoForward = activeTab.webviewEl.canGoForward();

          backBtn.style.opacity = canGoBack ? '1' : '0.3';
          backBtn.style.pointerEvents = canGoBack ? 'auto' : 'none';

          fwdBtn.style.opacity = canGoForward ? '1' : '0.3';
          fwdBtn.style.pointerEvents = canGoForward ? 'auto' : 'none';
      } catch(e) {}
  }

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

  document.getElementById('new-tab-btn').addEventListener('click', () => {
      createTab();
      setTimeout(() => { if (urlInput) urlInput.focus(); }, 50);
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
                  if (tabs.length === 0 || !activeTabId) {
                      openInCurrentView(utils.getAssetPath('settings.html'));
                  } else {
                      createTab(utils.getAssetPath('settings.html'));
                  }
              } else if (action === 'downloads') {
                  if (tabs.length === 0 || !activeTabId) {
                      openInCurrentView('chrome://downloads');
                  } else {
                      createTab('chrome://downloads');
                  }
              } else if (action === 'about') {
                  createTab('about:blank');
              } else {
                  // Geçici: diğer menüler için placeholder
                  if (tabs.length === 0 || !activeTabId) {
                      openInCurrentView('about:blank');
                  } else {
                      createTab('about:blank');
                  }
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
                  if (activeTab.webviewEl.getAttribute('nodeintegration') === 'yes' || activeTab.webviewEl.getAttribute('nodeintegration') === 'true') {
                      const currentId = activeTab.id;
                      openInCurrentView(url);
                  } else {
                      activeTab.webviewEl.loadURL(url);
                  }
              } else {
                  openInCurrentView(url);
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
      // Ctrl+Shift+D: Debug modu (element sınırlarını göster)
      if (e.key === 'D' && e.ctrlKey && e.shiftKey) {
          e.preventDefault();
          document.body.classList.toggle('orion-debug');
      }
  });

  }); // DOMContentLoaded
