import { api } from './api.js';
import { esc, icon, toast, dialogo, avatar, BOTON_TEMA, watchImages, settleImages, skKpis, skBlocks, skHead } from './ui.js';

// Un solo menú para todos los roles. Las pantallas reales se muestran según PERMISOS; las "pronto", según rol.
const NAV = [
  { r: 'dashboard', t: 'Inicio', i: 'home', perm: 'dashboard.ver' },
  { r: 'inventario', t: 'Inventario', i: 'box', perm: 'inventario.ver' },
  { r: 'proveedores', t: 'Proveedores', i: 'truck', perm: 'proveedores.ver' },
  { r: 'usuarios', t: 'Usuarios', i: 'users', perm: 'usuarios.admin' },
  { r: 'permisos', t: 'Permisos', i: 'shield', perm: 'permisos.admin' },
  { r: 'parametros', t: 'Parámetros', i: 'settings', perm: 'parametros.admin' },
  { r: 'ordenes', t: 'Órdenes de compra', i: 'cart', soon: 1, roles: ['administrador', 'gerente'] },
  { r: 'ordenes', t: 'Recepción de pedidos', i: 'cart', soon: 1, roles: ['empleado'] },
  { r: 'empleados', t: 'Empleados', i: 'users', soon: 1, roles: ['administrador', 'gerente'] },
  { r: 'auditoria', t: 'Auditoría', i: 'clipboard', soon: 1, roles: ['administrador', 'gerente'] },
  { r: 'pedidos', t: 'Mis pedidos', i: 'cart', soon: 1, roles: ['proveedor'] },
  { r: 'cotizaciones', t: 'Cotizaciones', i: 'file', soon: 1, roles: ['proveedor'] },
  { r: 'desempeno', t: 'Mi desempeño', i: 'star', soon: 1, roles: ['proveedor'] },
];
const PAGES = {
  dashboard: () => import('./pages/dashboard.js'),
  inventario: () => import('./pages/inventario.js'),
  proveedores: () => import('./pages/proveedores.js'),
  usuarios: () => import('./pages/usuarios.js'),
  permisos: () => import('./pages/permisos.js'),
  parametros: () => import('./pages/parametros.js'),
  perfil: () => import('./pages/perfil.js'),       // Mi perfil: lo ve cualquier usuario con sesión
};
const SOON = {
  ordenes: ['Órdenes de compra', 'Un solo flujo reemplaza los cuatro listados del prototipo: solicitar, cotizar con varios proveedores, comparar, aceptar, recibir y validar, y calificar. Cada orden cambia de estado en vez de copiarse a otra lista.'],
  empleados: ['Empleados', 'Alta, edición y baja lógica del personal, con su hoja de vida y sus permisos por rol.'],
  auditoria: ['Auditoría', 'Quién cambió qué y cuándo, con un catálogo corto de acciones (crear, editar, cotizar, aceptar, validar, calificar).'],
  pedidos: ['Mis pedidos', 'Las órdenes que te asignó el vivero, con su estado, fecha de entrega y la confirmación de despacho.'],
  cotizaciones: ['Cotizaciones', 'Responde las solicitudes del vivero con precios y plazos, y consulta cuáles fueron aceptadas o rechazadas y por qué.'],
  desempeno: ['Mi desempeño', 'Tu puntaje de puntualidad, calidad y cumplimiento, calculado a partir de las calificaciones reales de cada entrega.'],
};
const ROL = { administrador: 'Administrador', gerente: 'Gerente', empleado: 'Empleado', proveedor: 'Proveedor' };

const $ = s => document.querySelector(s);
const main = $('#main');
let token = 0, user, visibles = [];

const calcularVisibles = () => NAV.filter(n => (n.perm ? user.permisos.includes(n.perm) : n.roles.includes(user.rol)));

async function salir() { try { await api('/auth/logout', { method: 'POST' }); } finally { location.replace('/login.html'); } }

function shell() {
  $('#sidebar').innerHTML = `
    <div class="brand"><img src="/img/logo.png" alt=""><span>Vivero Las Magnolias<small>Gestión de proveedores</small></span></div>
    <nav class="nav" aria-label="Principal">${visibles.map(n =>
      `<a href="#/${n.r}" data-r="${n.r}">${icon(n.i)}<span>${esc(n.t)}</span>${n.soon ? '<span class="soon">Pronto</span>' : ''}</a>`).join('')}</nav>`;
}

// ── Encabezado: campana de notificaciones, tema y menú de usuario ──
const cerrarMenus = () => document.querySelectorAll('.dd-panel').forEach(p => { p.hidden = true; document.getElementById(p.dataset.btn)?.setAttribute('aria-expanded', 'false'); });
function menu(btnId, panelId, alAbrir) {
  const b = document.getElementById(btnId), p = document.getElementById(panelId);
  p.dataset.btn = btnId;
  b.onclick = e => {
    e.stopPropagation();
    const abrir = p.hidden; cerrarMenus();
    if (abrir) { p.hidden = false; b.setAttribute('aria-expanded', 'true'); alAbrir?.(); }
  };
}
function cabecera() {
  const rol = ROL[user.rol] || user.rol;
  $('#appbar-actions').innerHTML = `
    <div class="dd"><button class="btn icon" id="btn-notif" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Notificaciones">${icon('bell')}<span class="dot" id="notif-n" hidden></span></button>
      <div class="dd-panel" id="panel-notif" hidden><div class="dd-head"><strong>Notificaciones</strong></div><div id="notif-lista"></div></div></div>
    ${BOTON_TEMA}
    <div class="dd"><button class="user-btn" id="btn-user" type="button" aria-haspopup="true" aria-expanded="false">${avatar(user.nombreCorto, user.fotoUrl)}
        <span class="user-btn-txt"><strong>${esc(user.nombreCorto)}</strong><small>${esc(rol)}</small></span>${icon('chevron')}</button>
      <div class="dd-panel" id="panel-user" hidden>
        <div class="dd-head"><strong>${esc(user.nombreCorto)}</strong><small class="muted" style="display:block">${esc(user.email)}</small></div>
        <a class="dd-item" href="#/perfil">Mi perfil</a>
        <button class="dd-item dd-sep" id="logout" type="button">Cerrar sesión</button></div></div>`;
  menu('btn-user', 'panel-user'); menu('btn-notif', 'panel-notif', notificaciones);
  $('#logout').onclick = salir;
  document.querySelectorAll('#panel-user a').forEach(a => a.addEventListener('click', cerrarMenus));
}
async function notificaciones() {
  try {
    const n = await api('/notificaciones'), dot = $('#notif-n'), lista = $('#notif-lista');
    if (!dot) return;
    dot.hidden = n.total === 0; dot.textContent = n.total;
    lista.innerHTML = n.items.length
      ? n.items.map(i => `<a class="dd-item" href="${esc(i.enlace)}"><span><strong>${esc(i.titulo)}</strong><small>${esc(i.detalle)}</small></span></a>`).join('')
      : '<div class="notif-vacia">Todo al día ✓</div>';
    lista.querySelectorAll('a').forEach(a => a.addEventListener('click', cerrarMenus));
  } catch { /* la campana no debe romper la pantalla */ }
}

// Cuentas nuevas o restablecidas: no se puede usar la app hasta cambiar la clave temporal
function exigirCambioDeClave() {
  return new Promise(resolve => {
    const d = dialogo(`<h2>Crea tu contraseña</h2>
      <p class="muted" style="margin:.4rem 0 1rem">Entraste con una clave temporal. Define una propia para continuar.</p>
      <form id="f-clave" class="form-grid" novalidate>
        <div class="form-error" id="e-clave" role="alert" hidden></div>
        <div class="field"><label for="c-act">Clave temporal</label><input class="input" id="c-act" type="password" autocomplete="current-password" required></div>
        <div class="field"><label for="c-new">Nueva contraseña (mínimo 10 caracteres)</label><input class="input" id="c-new" type="password" autocomplete="new-password" required></div>
        <div class="field"><label for="c-rep">Repite la nueva contraseña</label><input class="input" id="c-rep" type="password" autocomplete="new-password" required></div>
        <div class="dlg-actions"><button class="btn" type="button" id="c-salir">Cerrar sesión</button><button class="btn primary" type="submit">Guardar contraseña</button></div>
      </form>`, { cerrable: false });
    const err = d.querySelector('#e-clave');
    d.querySelector('#c-salir').onclick = salir;
    d.querySelector('#f-clave').addEventListener('submit', async e => {
      e.preventDefault(); err.hidden = true;
      const nueva = d.querySelector('#c-new').value;
      if (nueva !== d.querySelector('#c-rep').value) { err.textContent = 'Las contraseñas nuevas no coinciden'; err.hidden = false; return; }
      try {
        await api('/auth/cambiar-clave', { method: 'POST', body: { actual: d.querySelector('#c-act').value, nueva } });
        user = await api('/me'); d.close(); toast('Contraseña actualizada'); resolve();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });
  });
}

async function route() {
  const my = ++token;
  document.body.classList.remove('nav-open');
  const [raw, qs] = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?');
  const permitidas = [...visibles.map(n => n.r), 'perfil'];
  const name = permitidas.includes(raw) ? raw : (permitidas.includes('dashboard') ? 'dashboard' : permitidas[0]);
  document.querySelectorAll('.nav a').forEach(a => (a.dataset.r === name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));

  if (!PAGES[name]) {
    const [t, d] = SOON[name] || [name, ''];
    document.title = `${t} · Vivero Las Magnolias`;
    main.innerHTML = `<div class="page-head"><div><h1>${esc(t)}</h1></div></div>
      <div class="card empty"><h2>Este módulo llega en la siguiente fase</h2><p>${esc(d)}</p></div>`;
    return;
  }
  main.innerHTML = skHead() + (name === 'dashboard' ? skKpis() + skBlocks() : '<div class="sk sk-block"></div>');
  try {
    const mod = await PAGES[name]();
    if (my !== token) return;
    document.title = `${mod.title} · Vivero Las Magnolias`;
    await mod.render(main, { user, params: new URLSearchParams(qs || ''), alive: () => my === token });
    if (my === token) settleImages(main);
  } catch (e) {
    if (my !== token) return;
    main.innerHTML = `<div class="card empty"><h2>No pudimos cargar esta pantalla</h2><p>${esc(e.message)}</p>
      <p style="margin-top:1rem"><button class="btn primary" id="retry" type="button">Reintentar</button></p></div>`;
    $('#retry').onclick = route;
  }
  main.focus({ preventScroll: true });
}

(async () => {
  watchImages();
  $('#menu').onclick = () => document.body.classList.toggle('nav-open');
  document.addEventListener('click', e => {
    if (!e.target.closest('.dd')) cerrarMenus();
    if (document.body.classList.contains('nav-open') && !e.target.closest('.sidebar, #menu')) document.body.classList.remove('nav-open');
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { cerrarMenus(); document.body.classList.remove('nav-open'); } });
  // Las pantallas avisan cuando cambia el perfil (foto, nombre) para repintar el encabezado
  window.addEventListener('perfil:cambio', async () => { try { user = await api('/me'); cabecera(); } catch { /* se reintenta en la siguiente acción */ } });
  try { user = await api('/me'); } catch { return; }   // 401 ya redirige al inicio de sesión
  visibles = calcularVisibles();
  shell(); cabecera(); notificaciones(); setInterval(notificaciones, 5 * 60 * 1000);
  if (user.debeCambiarClave) await exigirCambioDeClave();
  window.addEventListener('hashchange', route);
  route();
})();
