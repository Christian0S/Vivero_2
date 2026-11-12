import { api } from '../api.js';
import { esc, money, img, norm, debounce, skRows, settleImages } from '../ui.js';
export const title = 'Inventario';

export async function render(root, { params, alive }) {
  const data = await api('/productos');
  if (!alive()) return;
  const cats = [...new Set(data.map(p => p.categoria).filter(Boolean))].sort();
  const st = { q: '', cat: '', bajo: params.get('bajo') === '1' };

  root.innerHTML = `<div class="page-head"><div><h1>Inventario</h1><p id="count"></p></div></div>
    <div class="toolbar">
      <input class="input" id="q" type="search" placeholder="Buscar producto o proveedor…" aria-label="Buscar">
      <label class="switch"><input type="checkbox" id="bajo" ${st.bajo ? 'checked' : ''}> Solo stock bajo</label>
    </div>
    <div class="chips" id="chips" style="margin-bottom:1rem">${['', ...cats].map(c => `<button class="chip" type="button" data-c="${esc(c)}" aria-pressed="${c === ''}">${esc(c || 'Todas')}</button>`).join('')}</div>
    <div class="card"><div class="table-wrap"><table><thead><tr><th>Producto</th><th>Categoría</th><th>Proveedor</th><th>Stock</th><th class="num">Precio venta</th></tr></thead><tbody id="rows"></tbody></table></div></div>`;

  const rows = root.querySelector('#rows'), count = root.querySelector('#count');
  function draw() {
    const q = norm(st.q);
    const list = data.filter(p => (!st.cat || p.categoria === st.cat) && (!st.bajo || p.stock <= p.stock_minimo)
      && (!q || norm(p.nombre + ' ' + (p.proveedor || '')).includes(q)));
    count.textContent = `${list.length} de ${data.length} productos`;
    rows.innerHTML = list.map(p => {
      const bajo = p.stock <= p.stock_minimo, pct = Math.min(100, Math.round(p.stock / Math.max(p.stock_minimo * 2, 1) * 100));
      return `<tr><td><div class="prod">${img(p.imagen_url, '')}<strong>${esc(p.nombre)}</strong></div></td>
        <td>${esc(p.categoria || '—')}</td><td>${esc(p.proveedor || '—')}</td>
        <td><div style="display:flex;align-items:center;gap:.6rem"><div class="meter ${bajo ? 'low' : ''}"><i style="width:${pct}%"></i></div><b>${p.stock}</b>
          ${bajo ? '<span class="badge warn">Bajo</span>' : ''}</div></td><td class="num">${money(p.precio_venta)}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="empty">No hay productos con esos filtros.</td></tr>';
    settleImages(rows);
  }
  root.querySelector('#q').addEventListener('input', debounce(e => { st.q = e.target.value; draw(); }));
  root.querySelector('#bajo').addEventListener('change', e => { st.bajo = e.target.checked; draw(); });
  root.querySelector('#chips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    st.cat = b.dataset.c;
    root.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === b)));
    draw();
  });
  draw();
}
