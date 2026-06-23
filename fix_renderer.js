const fs = require('fs');
let code = fs.readFileSync('renderer.js', 'utf8');

const dragBlockStart = code.indexOf('// ==========================================');
const dragBlockEnd = code.indexOf('// ---- Rest of the original code (tab management, etc.) ----');

const replacement = `// ==========================================
  // PANEL DİZİLİM MANTIĞI (YUKARI/AŞAĞI BUTONLARI)
  // ==========================================
  const zoneContainer = document.querySelector('.orion-browser');
  let originalZoneOrder = [];

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

  `;

if (dragBlockStart !== -1 && dragBlockEnd !== -1) {
    code = code.substring(0, dragBlockStart) + replacement + code.substring(dragBlockEnd);
} else {
    console.log("Could not find blocks");
}

// remove draggable logic
code = code.replace(/document\.querySelectorAll\('\.zone-container'\)\.forEach\(z => z\.setAttribute\('draggable', 'true'\)\);/g, '');
code = code.replace(/const zones = Array\.from\(document\.querySelectorAll\('\.zone-container'\)\);/g, '');
code = code.replace(/originalZoneOrder = zones\.map\(z => z\.id\);/g, '');
code = code.replace(/document\.querySelectorAll\('\.zone-container'\)\.forEach\(z => z\.removeAttribute\('draggable'\)\);/g, '');


fs.writeFileSync('renderer.js', code);
console.log("renderer.js updated successfully.");
