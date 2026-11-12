import { api } from '../api.js';
import { esc, money, icon, img, stars, estadoBadge, ESTADOS } from '../ui.js';
export const title = 'Inicio';

const saludo = () => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; };
const fecha = (s => s[0].toUpperCase() + s.slice(1))(new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }));
const kpi = (ico, valor, label, cls = '', href = '') =>
  `<${href ? `a href="${href}" style="text-decoration:none;color:inherit"` : 'div'} class="card kpi ${cls}"><span class="ico">${icon(ico)}</span><div><b>${valor}</b><span class="l">${esc(label)}</span></div></${href ? 'a' : 'div'}>`;

function pipeline(rows) {
  const max = Math.max(1, ...rows.map(r => r.n));
  const orden = Object.keys(ESTADOS);
  const sorted = [...rows].sort((a, b) => orden.indexOf(a.estado) - orden.indexOf(b.estado));
  if (!sorted.length) return '<p class="muted" style="padding:0 1.25rem 1.25rem">Aún no hay órdenes.</p>';
  return `<div class="pipeline">${sorted.map(r => `<div class="row"><span>${esc(ESTADOS[r.estado]?.[0] || r.estado)}</span>
    <div class="bar"><i style="width:${(r.n / max) * 100}%"></i></div><b>${r.n}</b></div>`).join('')}</div>`;
}

export async function render(root, { user, alive }) {
  const d = await api('/dashboard');
  if (!alive()) return;
  const nombre = user.primerNombre;
  const head = `<div class="page-head"><div><h1>${saludo()}${nombre ? ', ' + esc(nombre) : ''}</h1><p>${fecha}</p></div></div>`;

  if (d.rol === 'proveedor') {
    if (!d.proveedor) { root.innerHTML = head + '<div class="card empty"><h2>Tu cuenta aún no está vinculada a un proveedor</h2><p>Pide al gerente que la asocie para ver tus pedidos.</p></div>'; return; }
    const k = d.kpis;
    root.innerHTML = head + `<div class="notice">Portal de <b>${esc(d.proveedor)}</b></div>
      <div class="grid kpis">${kpi('cart', k.abiertas, 'Pedidos abiertos')}${kpi('box', k.completadas, 'Pedidos completados')}
        <div class="card kpi"><span class="ico">${icon('star')}</span><div><b>${k.promedio ?? '—'}</b><span class="l">${k.calificaciones} calificaciones</span></div></div></div>
      <div class="grid two">
        <section class="card"><div class="card-head"><h2>Pedidos por estado</h2></div>${pipeline(d.ordenesPorEstado)}</section>
        <section class="card"><div class="card-head"><h2>Entregas recientes</h2></div><div class="list">${d.recientes.map(o =>
          `<div class="item"><div class="grow"><strong>${esc(o.nombre)}</strong><small class="muted">Entrega: ${esc(o.fecha_entrega || '—')}</small></div>${estadoBadge(o.estado)}</div>`).join('')}</div></section>
      </div>`;
    return;
  }

  const k = d.kpis;
  root.innerHTML = head + `
    <section class="hero">${img('/img/hero-3.webp', '', '')}<div class="txt"><h2 style="font-size:1.35rem">Resumen de hoy</h2>
      <p>${k.bajoStock ? `${k.bajoStock} productos están en o por debajo de su stock mínimo.` : 'Todo el inventario está por encima del mínimo.'}</p></div></section>
    <div class="grid kpis">
      ${kpi('box', k.productos, 'Productos en inventario', '', '#/inventario')}
      ${kpi('alert', k.bajoStock, 'Con stock bajo', k.bajoStock ? 'alert' : '', '#/inventario?bajo=1')}
      ${kpi('truck', k.proveedores, 'Proveedores activos', '', user.rol === 'gerente' ? '#/proveedores' : '')}
      ${kpi('cart', k.ordenesAbiertas, 'Órdenes en curso')}
    </div>
    <div class="grid two">
      <section class="card"><div class="card-head"><h2>Órdenes por estado</h2></div>${pipeline(d.ordenesPorEstado)}</section>
      ${user.rol === 'gerente' ? `<section class="card"><div class="card-head"><h2>Mejores proveedores</h2><a href="#/proveedores">Ver todos</a></div><div class="list">${d.topProveedores.map(p =>
        `<div class="item"><span class="avatar">${esc(p.nombre.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase())}</span><div class="grow"><strong>${esc(p.nombre)}</strong><small class="muted">${esc(p.categoria || '')}</small></div>${stars(p.promedio, p.n)}</div>`).join('') || '<p class="empty">Sin calificaciones todavía.</p>'}</div></section>` : ''}
    </div>
    <section class="card" style="margin-top:1rem"><div class="card-head"><h2>Productos por reponer</h2><a href="#/inventario?bajo=1">Ver todos</a></div>
      <div class="table-wrap"><table><thead><tr><th>Producto</th><th>Proveedor habitual</th><th class="num">Stock</th><th class="num">Mínimo</th></tr></thead><tbody>${d.bajoStock.map(p =>
        `<tr><td><div class="prod">${img(p.imagen_url, '')}<strong>${esc(p.nombre)}</strong></div></td><td>${esc(p.proveedor || '—')}</td>
        <td class="num"><span class="badge warn">${p.stock}</span></td><td class="num">${p.stock_minimo}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nada por reponer.</td></tr>'}</tbody></table></div></section>`;
}
