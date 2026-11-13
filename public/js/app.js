import { api } from './api.js';
import { esc, initials, icon, toast, dialogo, watchImages, settleImages, skKpis, skBlocks, skHead } from './ui.js';

// Un solo menú para todos los roles. Las pantallas reales se muestran según PERMISOS; las "pronto", según rol.
const NAV = [
  { r: 'dashboard', t: 'Inicio', i: 'home', perm: 'dashboard.ver' },
  { r: 'inventario', t: 'Inventario', i: 'box', perm: 'inventario.ver' },
  { r: 'proveedores', t: 'Proveedores', i: 'truck', perm: 'proveedores.ver' },
  { r: 'usuarios', t: 'Usuarios', i: 'users', perm: 'usuarios.admin' },
  { r: 'permisos', t: 'Permisos', i: 'shield', perm: 'permisos.admin' },
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
      `<a href="#/${n.r}" data-r="${n.r}">${icon(n.i)}<span>${esc(n.t)}</span>${n.soon ? '<span class="soon">Pronto</span>' : ''}</a>`).join('')}</nav>
    <button class="theme-row" type="button" data-tema-toggle>${icon('moon')}<span>Modo oscuro</span><span class="toggle"><i></i></span></button>
    <div class="usercard"><span class="avatar">${esc(initials(user.nombreCorto))}</span>
      <div class="who"><strong>${esc(user.nombreCorto)}</strong><small>${esc(ROL[user.rol] || user.rol)}</small></div>
      <button class="btn" id="logout" type="button">Salir</button></div>`;
  $('#topuser').innerHTML = `<strong>${esc(user.nombreCorto)}</strong><small>${esc(ROL[user.rol] || user.rol)}</small>`;
  $('#logout').onclick = salir;
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
  const permitidas = visibles.map(n => n.r);
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
  document.addEventListener('click', e => { if (document.body.classList.contains('nav-open') && !e.target.closest('.sidebar, #menu')) document.body.classList.remove('nav-open'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.body.classList.remove('nav-open'); });
  try { user = await api('/me'); } catch { return; }   // 401 ya redirige al inicio de sesión
  visibles = calcularVisibles();
  shell();
  if (user.debeCambiarClave) await exigirCambioDeClave();
  window.addEventListener('hashchange', route);
  route();
})();
