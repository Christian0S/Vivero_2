// Catálogo público: no requiere sesión. Consume GET /api/catalogo
import { api } from './api.js';
import { esc, money, img, norm, debounce, watchImages, settleImages } from './ui.js';

watchImages();
const DISP = { disponible: ['Disponible', 'ok'], pocas: ['Últimas unidades', 'warn'], agotado: ['Agotado', 'danger'] };
const list = document.getElementById('list'), count = document.getElementById('count'), chips = document.getElementById('chips');
const st = { q: '', cat: '' };

(async () => {
  let data;
  try { data = await api('/catalogo'); }
  catch (e) { list.innerHTML = `<div class="card empty" style="grid-column:1/-1"><h2>No pudimos cargar el catálogo</h2><p>${esc(e.message)}</p></div>`; return; }

  const cats = [...new Set(data.map(p => p.categoria).filter(Boolean))].sort();
  chips.innerHTML = ['', ...cats].map(c => `<button class="chip" type="button" data-c="${esc(c)}" aria-pressed="${c === ''}">${esc(c || 'Todo')}</button>`).join('');

  function draw() {
    const q = norm(st.q);
    const rows = data.filter(p => (!st.cat || p.categoria === st.cat) && (!q || norm(p.nombre + ' ' + (p.categoria || '')).includes(q)));
    count.textContent = `${rows.length} productos`;
    list.innerHTML = rows.map(p => { const [t, c] = DISP[p.disponibilidad] || ['', '']; return `<article class="card pcard">
      ${img(p.imagen_url, p.nombre)}<div class="body"><span class="muted" style="font-size:.8rem">${esc(p.categoria || '')}</span><h3>${esc(p.nombre)}</h3>
      <div class="row"><span class="price">${money(p.precio_venta)}</span><span class="badge ${c}">${esc(t)}</span></div></div></article>`; }).join('')
      || '<div class="card empty" style="grid-column:1/-1"><h2>Sin resultados</h2><p>Prueba con otra búsqueda o categoría.</p></div>';
    settleImages(list);
  }
  document.getElementById('q').addEventListener('input', debounce(e => { st.q = e.target.value; draw(); }));
  chips.addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    st.cat = b.dataset.c; chips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === b))); draw();
  });
  draw();
})();
