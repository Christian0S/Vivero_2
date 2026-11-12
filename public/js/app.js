import { api } from './api.js';
import { esc, initials, icon, toast, watchImages, settleImages, skKpis, skBlocks, skHead } from './ui.js';

// [ruta, etiqueta, icono, ¿próximamente?]  — una sola definición de menú para los tres roles
const NAV = {
  gerente: [['dashboard', 'Inicio', 'home'], ['inventario', 'Inventario', 'box'], ['proveedores', 'Proveedores', 'truck'],
    ['ordenes', 'Órdenes de compra', 'cart', 1], ['empleados', 'Empleados', 'users', 1], ['auditoria', 'Auditoría', 'clipboard', 1]],
  empleado: [['dashboard', 'Inicio', 'home'], ['inventario', 'Inventario', 'box'], ['ordenes', 'Recepción de pedidos', 'cart', 1]],
  proveedor: [['dashboard', 'Inicio', 'home'], ['pedidos', 'Mis pedidos', 'cart', 1], ['cotizaciones', 'Cotizaciones', 'file', 1], ['desempeno', 'Mi desempeño', 'star', 1]],
};
const PAGES = {
  dashboard: () => import('./pages/dashboard.js'),
  inventario: () => import('./pages/inventario.js'),
  proveedores: () => import('./pages/proveedores.js'),
};
const SOON = {
  ordenes: ['Órdenes de compra', 'Un solo flujo reemplaza los cuatro listados del prototipo: solicitar, cotizar con varios proveedores, comparar, aceptar, recibir y validar, y calificar. Cada orden cambia de estado en vez de copiarse a otra lista.'],
  empleados: ['Empleados', 'Alta, edición y baja lógica del personal, con su hoja de vida y sus permisos por rol.'],
  auditoria: ['Auditoría', 'Quién cambió qué y cuándo, con un catálogo corto de acciones (crear, editar, cotizar, aceptar, validar, calificar).'],
  pedidos: ['Mis pedidos', 'Las órdenes que te asignó el vivero, con su estado, fecha de entrega y la confirmación de despacho.'],
  cotizaciones: ['Cotizaciones', 'Responde las solicitudes del vivero con precios y plazos, y consulta cuáles fueron aceptadas o rechazadas y por qué.'],
  desempeno: ['Mi desempeño', 'Tu puntaje de puntualidad, calidad y cumplimiento, calculado a partir de las calificaciones reales de cada entrega.'],
};

const ROL = { gerente: 'Gerente', empleado: 'Empleado', proveedor: 'Proveedor' };
const $ = s => document.querySelector(s);
const main = $('#main');
let token = 0, user;

function shell() {
  const items = NAV[user.rol] || [];
  $('#sidebar').innerHTML = `
    <div class="brand"><img src="/img/logo.png" alt=""><span>Vivero Las Magnolias<small>Gestión de proveedores</small></span></div>
    <nav class="nav" aria-label="Principal">${items.map(([r, t, i, soon]) =>
      `<a href="#/${r}" data-r="${r}">${icon(i)}<span>${esc(t)}</span>${soon ? '<span class="soon">Pronto</span>' : ''}</a>`).join('')}</nav>
    <button class="theme-row" type="button" data-tema-toggle>${icon('moon')}<span>Modo oscuro</span><span class="toggle"><i></i></span></button>
    <div class="usercard"><span class="avatar">${esc(initials(user.nombreCorto))}</span>
      <div class="who"><strong>${esc(user.nombreCorto)}</strong><small>${esc(ROL[user.rol] || user.rol)}</small></div>
      <button class="btn" id="logout" type="button">Salir</button></div>`;
  $('#topuser').innerHTML = `<strong>${esc(user.nombreCorto)}</strong><small>${esc(ROL[user.rol] || user.rol)}</small>`;
  $('#logout').onclick = async () => { try { await api('/auth/logout', { method: 'POST' }); } finally { location.replace('/login.html'); } };
}

async function route() {
  const my = ++token;
  document.body.classList.remove('nav-open');
  const [raw, qs] = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?');
  const allowed = (NAV[user.rol] || []).map(i => i[0]);
  const name = allowed.includes(raw) ? raw : 'dashboard';
  document.querySelectorAll('.nav a').forEach(a => a.dataset.r === name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));

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
  try { user = await api('/auth/me'); } catch { return; }   // 401 ya redirige al inicio de sesión
  shell();
  window.addEventListener('hashchange', route);
  route();
})();
