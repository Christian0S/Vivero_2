import { api } from '../api.js';
import { esc, initials, norm, debounce, stars } from '../ui.js';
export const title = 'Proveedores';

export async function render(root, { alive }) {
  const data = await api('/proveedores');
  if (!alive()) return;
  const cats = [...new Set(data.map(p => p.categoria).filter(Boolean))].sort();
  const st = { q: '', cat: '' };
  root.innerHTML = `<div class="page-head"><div><h1>Proveedores</h1><p id="count"></p></div></div>
    <div class="toolbar"><input class="input" id="q" type="search" placeholder="Buscar por nombre o ciudad…" aria-label="Buscar"></div>
    <div class="chips" style="margin-bottom:1rem" id="chips">${['', ...cats].map(c => `<button class="chip" type="button" data-c="${esc(c)}" aria-pressed="${c === ''}">${esc(c || 'Todas')}</button>`).join('')}</div>
    <div class="grid cards" id="list"></div>`;
  const list = root.querySelector('#list'), count = root.querySelector('#count');
  function draw() {
    const q = norm(st.q);
    const rows = data.filter(p => (!st.cat || p.categoria === st.cat) && (!q || norm(p.nombre + ' ' + (p.ciudad || '')).includes(q)));
    count.textContent = `${rows.length} de ${data.length} proveedores`;
    list.innerHTML = rows.map(p => `<article class="card prov-card">
      <header><span class="avatar">${esc(initials(p.nombre))}</span><div><h3>${esc(p.nombre)}</h3><span class="badge">${esc(p.categoria || 'Sin categoría')}</span></div></header>
      <div>${stars(p.promedio, p.calificaciones)}</div>
      <dl><div>${esc(p.ciudad || '—')}</div>${p.telefono ? `<div><a href="tel:${esc(p.telefono)}">${esc(p.telefono)}</a></div>` : ''}${p.correo ? `<div><a href="mailto:${esc(p.correo)}">${esc(p.correo)}</a></div>` : ''}</dl></article>`).join('')
      || '<div class="card empty" style="grid-column:1/-1"><h2>Sin resultados</h2><p>Prueba con otra búsqueda o categoría.</p></div>';
  }
  root.querySelector('#q').addEventListener('input', debounce(e => { st.q = e.target.value; draw(); }));
  root.querySelector('#chips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    st.cat = b.dataset.c; root.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === b))); draw();
  });
  draw();
}
