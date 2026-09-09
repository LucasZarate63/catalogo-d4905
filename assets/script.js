// ---------------------------------------------------------------
// Configuración de la API
// ---------------------------------------------------------------
// Pegá acá la URL que te da Google Apps Script al implementar el
// Web App (ver instrucciones en apps-script-code.gs / SETUP.md).
// Tiene esta pinta: https://script.google.com/macros/s/AKfycb.../exec
const API_URL = 'https://script.google.com/macros/s/AKfycbyUGSXQRudtS-kF7WBoqZEj10b6kb6zprwm6mLKcj-oXypmEgUK53zF1tr0-MpZ5axA/exec';

// ---------------------------------------------------------------
// Estado
// ---------------------------------------------------------------
let PRODUCTS = [];
let CLUBS = [];
let activeCategory = 'Todos';

// ---------------------------------------------------------------
// Carga de datos desde el Google Form / Sheet
// ---------------------------------------------------------------
async function loadProducts() {
  const gridEl = document.getElementById('grid');
  const countEl = document.getElementById('countLabel');
  countEl.textContent = 'Cargando productos…';
  gridEl.innerHTML = '';

  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    // Normalizamos cada fila del formulario a la forma que usa la UI.
    // Probamos varios nombres de columna posibles por campo, porque
    // el texto exacto de la pregunta del Form es lo que define el
    // encabezado en la Sheet (y puede variar).
    PRODUCTS = data.map((row) => {
      const rawImage = pickField_(row, ['image', 'Foto del producto', 'Imagen (URL)', 'Imagen', 'Foto']);
      return {
        name: pickField_(row, ['name', 'Nombre del producto', 'Producto']),
        category: pickField_(row, ['category', 'Club']) || 'Sin club',
        desc: pickField_(row, ['desc', 'Descripción del producto', 'Descripción']),
        price: Number(pickField_(row, ['price', 'Precio'])) || 0,
        stock: Number(pickField_(row, ['stock', 'Stock'])) || 0,
        image: toDirectImageUrl(rawImage),
        driveId: extractDriveId(rawImage),
      };
    });

    // Las categorías (clubes) salen solas de los datos reales
    CLUBS = [...new Set(PRODUCTS.map((p) => p.category))].sort();

    // Ayuda para diagnosticar: abrí la consola del navegador (F12)
    // y mirá esta tabla. Si "image" sale vacío para un producto que
    // sí tiene foto cargada, el problema está en el nombre de la
    // columna del Sheet (no coincide con "Imagen (URL)").
    console.log('Encabezados que devolvió la API:', data[0] ? Object.keys(data[0]) : '(sin datos)');
    console.table(PRODUCTS.map((p) => ({ nombre: p.name, imagen_original: p.image, driveId: p.driveId })));

    render();
  } catch (err) {
    countEl.textContent = '';
    gridEl.innerHTML = `<p style="grid-column:1/-1;color:#b34a2a;font-weight:600;">
      No se pudieron cargar los productos. Revisá la URL de la API en script.js.<br>
      <span style="font-weight:400;color:#6b7186;">(${err.message})</span>
    </p>`;
  }
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
// Prueba una lista de nombres de columna posibles para un mismo
// campo y devuelve el primero que venga con valor.
function pickField_(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== '') return row[k];
  }
  return '';
}

function formatPrice(n) {
  return '$' + n.toLocaleString('es-AR');
}

// Un link "para compartir" de Drive (.../view?usp=sharing) NO sirve
// como src de <img>. Esta función extrae el ID del archivo y arma
// la URL que Google sí deja "hotlinkear". Si la URL ya es de otro
// hosting (imgur, un CDN, etc.) la deja como está.
function toDirectImageUrl(url) {
  const id = extractDriveId(url);
  if (id) return driveThumbUrl(id);
  return url || '';
}

function extractDriveId(url) {
  if (!url) return null;
  const m = url.match(/\/d\/([a-zA-Z0-9_-]{20,})/) || url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : null;
}

function driveThumbUrl(id) {
  return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
}

function driveLh3Url(id) {
  return `https://lh3.googleusercontent.com/d/${id}=w1000`;
}

// Si la primera URL de Drive falla (a veces "thumbnail" no anda pero
// el formato lh3 sí, o viceversa), probamos la alternativa antes de
// rendirnos y mostrar el placeholder. Queda expuesta en window para
// poder usarla desde el atributo onerror del <img>.
window.handleImgError = function (img, driveId) {
  const stage = img.dataset.stage || '0';
  if (stage === '0' && driveId) {
    console.warn('Falló esta URL de imagen, probando formato alternativo:', img.src);
    img.dataset.stage = '1';
    img.src = driveLh3Url(driveId);
    return;
  }
  console.warn('No se pudo cargar la imagen para:', img.alt, '— URL:', img.src);
  const span = document.createElement('span');
  span.className = 'card-img-label';
  span.textContent = 'sin foto';
  img.replaceWith(span);
};

// ---------------------------------------------------------------
// Render
// ---------------------------------------------------------------
function renderChips() {
  const chipsEl = document.getElementById('chips');
  chipsEl.innerHTML = '';

  const categories = ['Todos', ...CLUBS];
  categories.forEach((name) => {
    const btn = document.createElement('button');
    btn.className = 'chip' + (name === activeCategory ? ' active' : '');
    btn.textContent = name;
    btn.addEventListener('click', () => {
      activeCategory = name;
      render();
    });
    chipsEl.appendChild(btn);
  });
}

function renderGrid() {
  const gridEl = document.getElementById('grid');
  const countEl = document.getElementById('countLabel');

  const filtered = activeCategory === 'Todos'
    ? PRODUCTS
    : PRODUCTS.filter((p) => p.category === activeCategory);

  countEl.textContent = filtered.length + (filtered.length === 1 ? ' producto' : ' productos');

  gridEl.innerHTML = '';
  filtered.forEach((p) => {
    const out = p.stock <= 0;

    const card = document.createElement('article');
    card.className = 'card';

    const imgBlock = p.image
      ? `<img src="${p.image}" alt="${p.name}" class="card-photo" loading="lazy"
           onerror="handleImgError(this, '${p.driveId || ''}')">`
      : `<span class="card-img-label${out ? ' out' : ''}">sin foto</span>`;

    card.innerHTML = `
      <div class="card-img">
        ${imgBlock}
        <div class="badge${out ? ' out' : ''}">
          <span class="badge-dot${out ? ' out' : ''}"></span>
          ${out ? 'Agotado' : 'Disponible'}
        </div>
      </div>
      <div class="card-body">
        <div class="card-category">${p.category}</div>
        <h3 class="card-name">${p.name}</h3>
        <p class="card-desc">${p.desc}</p>
        <div class="card-footer">
          <span class="card-price">${formatPrice(p.price)}</span>
          <span class="card-stock">${out ? 'Sin stock' : p.stock + ' en stock'}</span>
        </div>
      </div>
    `;

       card.addEventListener('click', () => openModal(p));

    gridEl.appendChild(card);
  });
}

// ---------------------------------------------------------------
// Modal de detalle
// ---------------------------------------------------------------
function openModal(p) {
  const img = document.getElementById('modalImg');

  document.getElementById('modalCategory').textContent = p.category;
  document.getElementById('modalName').textContent = p.name;
  document.getElementById('modalDesc').textContent = p.desc || 'Sin descripción disponible.';
  document.getElementById('modalPrice').textContent = formatPrice(p.price);
  document.getElementById('modalStock').textContent = p.stock > 0 ? p.stock + ' en stock' : 'Sin stock';

 if (p.image) {
    img.style.display = '';
    img.style.opacity = '0';
    img.alt = p.name;
    img.onload = () => { img.style.opacity = '1'; };
    img.onerror = () => handleImgError(img, p.driveId || '');
    img.src = p.image;
  } else {
    img.style.display = 'none';
  }

  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.overflow = 'hidden';
  document.body.style.paddingRight = scrollbarWidth + 'px';
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
}

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

function render() {
  renderChips();
  renderGrid();
}

loadProducts();
