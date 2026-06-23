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
  // PANEL DİZİLİM MANTIĞI (YUKARI/AŞAĞI BUTONLARI)
  // ==========================================
  const zoneContainer = document.querySelector('.orion-browser');

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

  // YUKARI/AŞAĞI BUTONLARI İÇİN EVENT LISTENERLAR
  document.querySelectorAll('.zone-up-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
          const zone = e.target.closest('.zone-container');
          if (!zone) return;
          const prev = zone.previousElementSibling;
          if (prev && prev.classList.contains('zone-container')) {
              zone.parentNode.insertBefore(zone, prev);
              updateZoneOrderFromDOM();
          }
      });
  });

  document.querySelectorAll('.zone-down-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
          const zone = e.target.closest('.zone-container');
          if (!zone) return;
          const next = zone.nextElementSibling;
          if (next && next.classList.contains('zone-container')) {
              // Aşağı taşımak için next objesini zone objesinden ÖNCEYE taşıyoruz (swap)
              zone.parentNode.insertBefore(next, zone);
              updateZoneOrderFromDOM();
          }
      });
  });

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
  zoneEls.forEach(el => zoneContainer.appendChild(el)); // Reorder DOM

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
      if (!activeTab || !urlInput) return;

      let url = '';
      try { url = activeTab.webviewEl.getURL(); } catch(e){}
      let title = activeTab.title || url; // Başlık yoksa URL kullan

      if (url.includes('homepage.html') || url.includes('settings.html')) {
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

      // Eğer sadece 1 sekme varsa ve o da anasayfaysa kapatma butonunu gizle
      let isSingleHomepage = false;
      if (tabs.length === 1) {
          let url = '';
          try { url = tabs[0].webviewEl.getURL(); } catch(e){}
          if (!url || url.includes('homepage.html')) {
              isSingleHomepage = true;
          }
      }

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

          if (isSingleHomepage) {
              closeBtn.style.display = 'none'; // Sadece 1 sekme ve anasayfaysa X çıkmaz
          }

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
          tabs[index].webviewEl.remove();
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
      if (!url) url = utils.getAssetPath('homepage.html');

      const wrapper = document.createElement('div');
      wrapper.className = 'tab-wrapper slide-right';
      wrapper.id = `wrap-${id}`;

      const webviewEl = document.createElement('webview');
      webviewEl.id = `wv-${id}`;
      webviewEl.setAttribute('src', url);

      // SADECE AYARLAR SAYFASI İÇİN NODE İZNİ
      if (url.includes('settings.html')) {
          webviewEl.setAttribute('webpreferences', 'contextIsolation=yes, sandbox=no');
      } else {
          webviewEl.setAttribute('webpreferences', 'contextIsolation=yes');
      }

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
          updateURLBar(); // Dinamik URL/Başlık kontrolü
          updateDots(); // Anasayfadan normal sayfaya geçişte X butonunun çıkması için
          updateNavButtons();
      });

      webviewEl.addEventListener('did-navigate-in-page', (e) => {
          updateURLBar();
          updateNavButtons();
      });

      // Sayfa başlığını (Title) yakala
      webviewEl.addEventListener('page-title-updated', (e) => {
          const tab = tabs.find(t => t.id === id);
          if(tab) tab.title = e.title;
          if(activeTabId === id) updateURLBar();
          updateDots(); // Noktaların üzerine gelindiğinde title'ı göstermek için yenile
      });

      // Ayarlar sayfası console-message üzerinden IPC işlemleri
      webviewEl.addEventListener('console-message', (event) => {
          if(event.message && event.message.startsWith('ORION_IPC:')) {
              const parts = event.message.split(':');
              const channel = parts[1];
              const data = parts.slice(2).join(':');

              if (channel === 'update-bg-color') {
                  const txt = localStorage.getItem('orion-text-color') || '#ffffff';
                  applyThemeColors(data, txt);
                  localStorage.setItem('orion-bg-color', data);
              }
              else if (channel === 'update-text-color') {
                  const bg = localStorage.getItem('orion-bg-color') || '#0d0d0d';
                  applyThemeColors(bg, data);
                  localStorage.setItem('orion-text-color', data);
              }
              else if (channel === 'update-radius') {
                  document.documentElement.style.setProperty('--surf-radius', `${data}px`);
                  localStorage.setItem('orion-surf-radius', data);
              }
              else if (channel === 'toggle-magic-mode') {
                  if (data === 'true') {
                      document.body.classList.add('edit-mode');
                      
                      
                      
                  } else {
                      document.body.classList.remove('edit-mode');
                      
                  }
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
      if (activeTabId === id) return; // Zaten aktifse çık

      const oldActive = tabs.find(t => t.id === activeTabId);
      const newActive = tabs.find(t => t.id === id);
      if (!newActive) return;

      if (oldActive) {
          oldActive.wrapper.classList.remove('active');
      }

      // Yeni sekmeyi aktif yap
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

      if (!activeTab || !activeTab.webviewEl) return;
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

  document.getElementById('new-tab-btn').addEventListener('click', () => createTab());

  document.getElementById('settings-btn').addEventListener('click', () => {
      // 1. Ayarlar zaten açıksa oraya git
      const existing = tabs.find(t => {
          try { return t.webviewEl.getURL().includes('settings.html'); } catch(e){ return false; }
      });
      if (existing) {
          switchTab(existing.id);
          return;
      }

      // 2. Sadece boş anasayfadaysak yeni sekme açma, mevcut sekmeyi ayarlara çevir
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab) {
          let isHome = false;
          try { isHome = activeTab.webviewEl.getURL().includes('homepage.html'); } catch(e){}
          if (isHome) {
              activeTab.webviewEl.loadURL(utils.getAssetPath('settings.html'));
              return;
          }
      }

      // 3. Değilse yeni sekme aç
      const id = Date.now().toString();
      const url = utils.getAssetPath('settings.html');

      const wrapper = document.createElement('div');
      wrapper.className = 'tab-wrapper slide-right';
      const webviewEl = document.createElement('webview');
      webviewEl.setAttribute('webpreferences', 'contextIsolation=yes, sandbox=no');
      webviewEl.setAttribute('src', url);

      webviewEl.addEventListener('console-message', (event) => {
          if(event.message && event.message.startsWith('ORION_IPC:')) {
              const parts = event.message.split(':');
              const channel = parts[1];
              const data = parts.slice(2).join(':');

              if (channel === 'update-bg-color') {
                  const txt = localStorage.getItem('orion-text-color') || '#ffffff';
                  applyThemeColors(data, txt);
                  localStorage.setItem('orion-bg-color', data);
              }
              else if (channel === 'update-text-color') {
                  const bg = localStorage.getItem('orion-bg-color') || '#0d0d0d';
                  applyThemeColors(bg, data);
                  localStorage.setItem('orion-text-color', data);
              }
              else if (channel === 'update-radius') {
                  document.documentElement.style.setProperty('--surf-radius', `${data}px`);
                  localStorage.setItem('orion-surf-radius', data);
              }
              else if (channel === 'toggle-magic-mode') {
                  if (data === 'true') {
                      document.body.classList.add('edit-mode');
                      
                      
                      
                  } else {
                      document.body.classList.remove('edit-mode');
                      
                  }
              }
          }
      });

      wrapper.appendChild(webviewEl);
      contentArea.appendChild(wrapper);
      tabs.push({ id, webviewEl, wrapper });

      webviewEl.addEventListener('did-navigate', () => { updateURLBar(); updateDots(); updateNavButtons(); });
      webviewEl.addEventListener('page-title-updated', (e) => {
          const tab = tabs.find(t => t.id === id);
          if(tab) tab.title = e.title;
          if(activeTabId === id) updateURLBar();
          updateDots();
      });

      switchTab(id);
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

  document.getElementById('close-all-tabs-btn').addEventListener('click', () => {
      tabs.forEach(t => t.wrapper.remove()); // Tüm webview'ları DOM'dan sil
      tabs = []; // Diziyi sıfırla
      activeTabId = null;
      createTab(); // Tertemiz bir anasayfa aç
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
                  // Güvenlik: Eğer nodeintegration açıksa (Ayar sayfası) ve dışarıya gidiliyorsa mevcut sekmeyi kapatıp yenisini aç
                  if (activeTab.webviewEl.getAttribute('nodeintegration') === 'yes' || activeTab.webviewEl.getAttribute('nodeintegration') === 'true') {
                      const currentId = activeTab.id;
                      createTab(url);
                      closeTab(currentId);
                  } else {
                      activeTab.webviewEl.loadURL(url);
                  }
              } else {
                  createTab(url);
              }
          }
          urlInput.blur();
      }
  });

  // İlk sekme olarak anasayfayı oluştur
  createTab();

  });
});
