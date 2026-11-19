import { api } from '../api.js';
import { esc, money, img, norm, debounce, dialogo, toast, settleImages } from '../ui.js';
import { calcularPrecioVenta } from '../precios.js';
export const title = 'Inventario';

export async function render(root, { user, params, alive }) {
  const editor = user.permisos.includes('inventario.editar');
  const st = { q: '', cat: '', bajo: params.get('bajo') === '1', inactivos: false };
  let data = await api('/productos');
  if (!alive()) return;
  const cats = [...new Set(data.map(p => p.categoria).filter(Boolean))].sort();

  root.innerHTML = `<div class="page-head"><div><h1>Inventario</h1><p id="count"></p></div>${editor ? '<button class="btn primary" id="nuevo" type="button">Nuevo producto</button>' : ''}</div>
    <div class="toolbar">
      <input class="input" id="q" type="search" placeholder="Buscar producto o proveedor…" aria-label="Buscar">
      <label class="switch"><input type="checkbox" id="bajo" ${st.bajo ? 'checked' : ''}> Solo stock bajo</label>
      ${editor ? '<label class="switch"><input type="checkbox" id="inactivos"> Mostrar inactivos</label>' : ''}
    </div>
    <div class="chips" id="chips" style="margin-bottom:1rem">${['', ...cats].map(c => `<button class="chip" type="button" data-c="${esc(c)}" aria-pressed="${c === ''}">${esc(c || 'Todas')}</button>`).join('')}</div>
    <div class="card"><div class="table-wrap"><table><thead><tr><th>Producto</th><th>Categoría</th><th>Proveedor</th><th>Stock</th><th class="num">Precio venta</th>${editor ? '<th class="num">Acciones</th>' : ''}</tr></thead><tbody id="rows"></tbody></table></div></div>`;

  const rows = root.querySelector('#rows'), count = root.querySelector('#count');
  function draw() {
    const q = norm(st.q);
    const list = data.filter(p => (!st.cat || p.categoria === st.cat) && (!st.bajo || p.stock <= p.stock_minimo) && (!q || norm(p.nombre + ' ' + (p.proveedor || '')).includes(q)));
    count.textContent = `${list.length} de ${data.length} productos`;
    rows.innerHTML = list.map(p => {
      const bajo = p.stock <= p.stock_minimo, pct = Math.min(100, Math.round(p.stock / Math.max(p.stock_minimo * 2, 1) * 100)), off = p.activo === false;
      return `<tr class="${off ? 'row-off' : ''}" data-id="${p.id}"><td><div class="prod">${img(p.imagen_url, '')}<strong>${esc(p.nombre)}</strong>${off ? ' <span class="badge">Inactivo</span>' : ''}</div></td>
        <td>${esc(p.categoria || '—')}</td><td>${esc(p.proveedor || '—')}</td>
        <td><div style="display:flex;align-items:center;gap:.6rem"><div class="meter ${bajo ? 'low' : ''}"><i style="width:${pct}%"></i></div><b>${p.stock}</b>
          ${bajo && !off ? '<span class="badge warn">Bajo</span>' : ''}</div></td><td class="num">${money(p.precio_venta)}</td>
        ${editor ? `<td><div class="acts"><button class="btn sm" data-acc="editar" type="button">Editar</button><button class="btn sm" data-acc="activo" type="button">${off ? 'Activar' : 'Desactivar'}</button></div></td>` : ''}</tr>`;
    }).join('') || `<tr><td colspan="${editor ? 6 : 5}" class="empty">No hay productos con esos filtros.</td></tr>`;
    settleImages(rows);
  }
  const cargar = async () => { data = await api('/productos' + (st.inactivos ? '?inactivos=1' : '')); draw(); };

  // ── Formulario de producto (crear y editar) ──
  async function formulario(p) {
    let op;
    try { op = await api('/productos/opciones'); } catch (ex) { toast(ex.message, 'error'); return; }
    const v = p || { nombre: '', descripcion: '', categoria_id: '', proveedor_id: '', precio_base: '', pct_ganancia: 20, pct_iva: op.defaults.iva, stock: 0, stock_minimo: op.defaults.stock_minimo };
    const sel = (valor, items, vacio) => `<option value="">${vacio}</option>${items.map(i => `<option value="${i.id}" ${i.id === valor ? 'selected' : ''}>${esc(i.etiqueta)}</option>`).join('')}`;
    const d = dialogo(`<h2>${p ? `Editar ${esc(p.nombre)}` : 'Nuevo producto'}</h2>
      <form class="form-grid" novalidate style="margin-top:1rem">
        <div class="form-error" role="alert" hidden></div>
        <div class="field"><label for="f-nom">Nombre</label><input class="input" id="f-nom" maxlength="120" value="${esc(v.nombre)}" required></div>
        <div class="form-2">
          <div class="field"><label for="f-cat">Categoría</label><select class="input" id="f-cat">${sel(v.categoria_id, op.categorias.map(c => ({ id: c.id, etiqueta: c.nombre })), 'Elige una categoría…')}</select></div>
          <div class="field"><label for="f-prov">Proveedor habitual</label><select class="input" id="f-prov"></select><span class="hint" id="f-prov-nota"></span></div>
        </div>
        <div class="field"><label for="f-des">Descripción <span class="muted">(opcional)</span></label><textarea class="input" id="f-des" maxlength="500">${esc(v.descripcion || '')}</textarea></div>
        <div class="form-2">
          <div class="field"><label for="f-base">Costo (pesos)</label><input class="input" id="f-base" type="number" inputmode="numeric" min="0" step="1" value="${esc(v.precio_base)}"></div>
          <div class="field"><label for="f-gan">Ganancia (%)</label><input class="input" id="f-gan" type="number" inputmode="decimal" min="0" max="1000" step="0.01" value="${esc(v.pct_ganancia)}"></div>
          <div class="field"><label for="f-iva">IVA (%)</label><input class="input" id="f-iva" type="number" inputmode="decimal" min="0" max="100" step="0.01" value="${esc(v.pct_iva)}"></div>
          <div class="field"><label>Precio de venta</label><div class="preview"><span class="muted">Se calcula solo</span><strong id="f-precio">—</strong></div></div>
          <div class="field"><label for="f-stock">Stock actual</label><input class="input" id="f-stock" type="number" inputmode="numeric" min="0" step="1" value="${esc(v.stock)}"></div>
          <div class="field"><label for="f-min">Stock mínimo (avisa al llegar aquí)</label><input class="input" id="f-min" type="number" inputmode="numeric" min="0" step="1" value="${esc(v.stock_minimo)}"></div>
        </div>
        <div class="dlg-actions"><button class="btn" type="button" data-cancel>Cancelar</button><button class="btn primary" type="submit">${p ? 'Guardar cambios' : 'Crear producto'}</button></div>
      </form>`, { clase: 'wide' });
    const $ = s => d.querySelector(s), err = $('.form-error');
    const num = id => { const t = $(id).value.trim(); return t === '' ? null : Number(t); };
    const vista = () => {
      const a = num('#f-base'), g = num('#f-gan'), i = num('#f-iva');
      $('#f-precio').textContent = [a, g, i].every(x => x !== null && Number.isFinite(x)) ? money(calcularPrecioVenta(a, g, i)) : '—';
    };
    // El proveedor se elige entre los de LA categoría del producto (activos); si cambia la categoría, la lista cambia
    const pintarProveedores = () => {
      const cat = Number($('#f-cat').value) || null, actual = Number($('#f-prov').value) || v.proveedor_id || null;
      const lista = cat ? op.proveedores.filter(x => x.categoria_id === cat) : [];
      const items = lista.map(x => ({ id: x.id, etiqueta: x.nombre }));
      if (p && p.categoria_id === cat && p.proveedor_id && !lista.some(x => x.id === p.proveedor_id)) items.unshift({ id: p.proveedor_id, etiqueta: `${p.proveedor} (inactivo)` });   // el que ya tenía, aunque esté inactivo
      $('#f-prov').innerHTML = `<option value="">${cat ? 'Elige un proveedor…' : 'Elige primero una categoría'}</option>${items.map(x => `<option value="${x.id}" ${x.id === actual ? 'selected' : ''}>${esc(x.etiqueta)}</option>`).join('')}`;
      $('#f-prov').disabled = !cat;
      $('#f-prov-nota').textContent = cat && !items.length ? 'No hay proveedores activos de esta categoría. Crea o activa uno primero.' : '';
    };
    $('#f-cat').addEventListener('change', () => { $('#f-prov').value = ''; pintarProveedores(); });
    pintarProveedores();
    ['#f-base', '#f-gan', '#f-iva'].forEach(id => $(id).addEventListener('input', vista)); vista();
    $('form').addEventListener('input', () => { err.hidden = true; });   // el aviso se va apenas empiezas a corregir
    $('[data-cancel]').onclick = () => d.close();
    $('form').addEventListener('submit', async e => {
      e.preventDefault(); err.hidden = true; const btn = e.submitter; btn.disabled = true;
      const body = { nombre: $('#f-nom').value, descripcion: $('#f-des').value, categoria_id: Number($('#f-cat').value) || null, proveedor_id: Number($('#f-prov').value) || null,
        precio_base: num('#f-base'), pct_ganancia: num('#f-gan'), pct_iva: num('#f-iva'), stock: num('#f-stock'), stock_minimo: num('#f-min') };
      try { await api(p ? `/productos/${p.id}` : '/productos', { method: p ? 'PUT' : 'POST', body }); d.close(); toast(p ? 'Producto actualizado' : 'Producto creado'); await cargar(); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; }
    });
    $('#f-nom').focus();
  }

  function confirmarDesactivar(p) {
    const d = dialogo(`<h2>¿Desactivar ${esc(p.nombre)}?</h2><p class="muted" style="margin:.4rem 0 1rem">Dejará de verse en el catálogo y en las alertas. No se borra: puedes activarlo de nuevo cuando quieras.</p>
      <div class="dlg-actions"><button class="btn" data-cancel type="button">Cancelar</button><button class="btn primary" id="ok" type="button">Desactivar</button></div>`);
    d.querySelector('[data-cancel]').onclick = () => d.close();
    d.querySelector('#ok').onclick = async () => {
      try { await api(`/productos/${p.id}/activo`, { method: 'PATCH', body: { activo: false } }); d.close(); toast('Producto desactivado'); await cargar(); }
      catch (ex) { d.close(); toast(ex.message, 'error'); }
    };
  }

  root.querySelector('#q').addEventListener('input', debounce(e => { st.q = e.target.value; draw(); }));
  root.querySelector('#bajo').addEventListener('change', e => { st.bajo = e.target.checked; draw(); });
  root.querySelector('#chips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    st.cat = b.dataset.c; root.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === b))); draw();
  });
  if (editor) {
    root.querySelector('#nuevo').onclick = () => formulario();
    root.querySelector('#inactivos').addEventListener('change', async e => { st.inactivos = e.target.checked; try { await cargar(); } catch (ex) { toast(ex.message, 'error'); } });
    rows.addEventListener('click', async e => {
      const b = e.target.closest('[data-acc]'); if (!b) return;
      const p = data.find(x => x.id === Number(b.closest('tr').dataset.id)); if (!p) return;
      if (b.dataset.acc === 'editar') return formulario(p);
      if (p.activo === false) { try { await api(`/productos/${p.id}/activo`, { method: 'PATCH', body: { activo: true } }); toast('Producto activado'); await cargar(); } catch (ex) { toast(ex.message, 'error'); } }
      else confirmarDesactivar(p);
    });
  }
  draw();
}
