import { api } from '../api.js';
import { esc, initials, norm, debounce, stars, fmtTel, urlWhatsapp, copiar, toast } from '../ui.js';
import { formularioProveedor } from '../proveedor-form.js';
export const title = 'Proveedores';

export async function render(root, { user, alive }) {
  const editor = user.permisos.includes('proveedores.editar');
  const [data, info] = await Promise.all([api('/proveedores'), api('/catalogo/info').catch(() => ({}))]);
  if (!alive()) return;
  const vivero = info.nombre || 'el vivero';
  const cats = [...new Set(data.map(p => p.categoria).filter(Boolean))].sort();
  const st = { q: '', cat: '' };
  root.innerHTML = `<div class="page-head"><div><h1>Proveedores</h1><p id="count"></p></div></div>
    <div class="toolbar"><input class="input" id="q" type="search" placeholder="Buscar por nombre o ciudad…" aria-label="Buscar"></div>
    <div class="chips" style="margin-bottom:1rem" id="chips">${['', ...cats].map(c => `<button class="chip" type="button" data-c="${esc(c)}" aria-pressed="${c === ''}">${esc(c || 'Todas')}</button>`).join('')}</div>
    <div class="grid cards" id="list"></div>`;
  const list = root.querySelector('#list'), count = root.querySelector('#count');

  // En el computador no existe "llamar": el número se muestra y, al pulsarlo, se copia
  const numero = p => p.telefono
    ? `<button class="copiable" type="button" data-copiar="${esc(p.telefono)}" title="Copiar teléfono">${esc(fmtTel(p.telefono))}</button>${!p.whatsapp ? ' <span class="badge">Sin WhatsApp</span>' : ''}`
    : '<span class="muted">Sin teléfono</span>';
  const acciones = p => {
    const b = [];
    if (p.whatsapp) b.push(`<a class="btn sm primary" href="${esc(urlWhatsapp(p.whatsapp, `Hola ${p.nombre}, le escribimos de ${vivero}.`))}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`);
    if (p.telefono) b.push(`<button class="btn sm" type="button" data-copiar="${esc(p.telefono)}">Copiar teléfono</button>`);
    if (p.correo) b.push(`<a class="btn sm" href="mailto:${esc(p.correo)}">Correo</a>`);
    if (editor) b.push(`<button class="btn sm" type="button" data-editar="${p.id}">Editar</button>`);
    return b.length ? `<div class="acts" style="justify-content:flex-start">${b.join('')}</div>` : '';
  };
  function draw() {
    const q = norm(st.q);
    const rows = data.filter(p => (!st.cat || p.categoria === st.cat) && (!q || norm(p.nombre + ' ' + (p.ciudad || '')).includes(q)));
    count.textContent = `${rows.length} de ${data.length} proveedores`;
    list.innerHTML = rows.map(p => `<article class="card prov-card">
      <header><span class="avatar">${esc(initials(p.nombre))}</span><div><h3>${esc(p.nombre)}</h3><span class="badge">${esc(p.categoria || 'Sin categoría')}</span></div></header>
      <div>${stars(p.promedio, p.calificaciones)}</div>
      <dl><div>${esc(p.ciudad || '—')}</div><div>${numero(p)}</div>${p.correo ? `<div>${esc(p.correo)}</div>` : ''}</dl>
      ${acciones(p)}</article>`).join('')
      || '<div class="card empty" style="grid-column:1/-1"><h2>Sin resultados</h2><p>Prueba con otra búsqueda o categoría.</p></div>';
  }
  list.addEventListener('click', async e => {
    const c = e.target.closest('[data-copiar]');
    if (c) return copiar(c.dataset.copiar, 'Teléfono copiado exitosamente');
    const ed = e.target.closest('[data-editar]');
    if (!ed) return;
    const p = data.find(x => x.id === Number(ed.dataset.editar));
    let opciones; try { opciones = await api('/proveedores/opciones'); } catch (ex) { toast(ex.message, 'error'); return; }
    formularioProveedor({ p, opciones, alGuardar: fila => { Object.assign(p, fila); draw(); } });
  });
  root.querySelector('#q').addEventListener('input', debounce(e => { st.q = e.target.value; draw(); }));
  root.querySelector('#chips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    st.cat = b.dataset.c; root.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === b))); draw();
  });
  draw();
}
