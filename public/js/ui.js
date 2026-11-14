// Utilidades de interfaz compartidas: formato, iconos, esqueletos, avisos.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = n => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
export const fechaCorta = s => s ? new Date(s + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const fechaHora = s => s ? new Date(s).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Nunca';
// Avatar: la foto si existe; si no (o si falla al cargar), las iniciales
export const avatar = (nombre, fotoUrl, extra = '') => {
  const ini = initials(nombre);
  return `<span class="avatar ${extra}" data-ini="${esc(ini)}">${fotoUrl ? `<img src="${esc(fotoUrl)}" alt="">` : esc(ini)}</span>`;
};
export const BOTON_TEMA = '<button class="theme-btn" type="button" data-tema-toggle aria-label="Cambiar entre modo claro y oscuro" title="Modo claro / oscuro"><svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/></svg><svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>';
export const norm = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
export const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export const ESTADOS = {
  solicitada: ['Solicitada', 'info'], cotizada: ['Cotizada', 'info'], aceptada: ['Aceptada', 'info'],
  en_entrega: ['En entrega', 'warn'], por_validar: ['Por validar', 'warn'],
  completada: ['Completada', 'ok'], calificada: ['Calificada', 'ok'], rechazada: ['Rechazada', 'danger'],
};
export const estadoBadge = e => { const [t, c] = ESTADOS[e] || [e, '']; return `<span class="badge ${c}">${esc(t)}</span>`; };

export const stars = (r, n) => {
  if (r == null) return '<span class="muted">Sin calificaciones</span>';
  const full = Math.round(r);
  return `<span class="stars" aria-label="${r} de 5">${'★'.repeat(full)}<span class="off">${'★'.repeat(5 - full)}</span></span> <small class="muted">${Number(r).toFixed(1)}${n ? ` (${n})` : ''}</small>`;
};

const P = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  truck: '<path d="M2 6h11v10H2z"/><path d="M13 9h5l3 3v4h-8"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11L21 7H6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.7a3.5 3.5 0 010 6.6M18 14.8c2 .7 3.2 2.5 3.5 5.2"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  bell: '<path d="M6 9a6 6 0 0112 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2 2 0 004 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9v0a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
};
export const icon = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

// Imagen con esqueleto: el bloque brilla hasta que la foto carga (ver watchImages)
export const img = (src, alt = '', cls = '') =>
  `<div class="media ${cls}"><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async"></div>`;
export function watchImages() {
  const done = e => { if (e.target.tagName === 'IMG') e.target.closest('.media')?.classList.add('done'); };
  document.addEventListener('load', done, true);
  document.addEventListener('error', e => {
    done(e);
    const av = e.target.tagName === 'IMG' && e.target.closest('.avatar');
    if (av) av.textContent = av.dataset.ini || '?';    // la foto no cargó: se muestran las iniciales
  }, true);
  settleImages(document);   // imágenes que ya cargaron antes de que corriera este script
}
export const settleImages = root => root.querySelectorAll('.media img').forEach(i => { if (i.complete) i.closest('.media').classList.add('done'); });

export const skKpis = (n = 4) => `<div class="grid kpis">${'<div class="sk sk-kpi"></div>'.repeat(n)}</div>`;
export const skBlocks = (n = 2) => `<div class="grid two">${'<div class="sk sk-block"></div>'.repeat(n)}</div>`;
export const skRows = (n = 6) => `<div class="card">${'<div class="sk sk-row"></div>'.repeat(n)}</div>`;
export const skCards = (n = 6) => `<div class="grid cards">${'<div class="sk sk-block"></div>'.repeat(n)}</div>`;
export const skHead = () => '<div class="sk sk-title"></div><div class="sk sk-line w40" style="margin-bottom:1.5rem"></div>';

export function toast(msg, type = '') {
  const box = document.getElementById('toasts'); if (!box) return;
  const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg; box.append(t);
  setTimeout(() => t.remove(), 4500);
}

// Ventana modal accesible (usa <dialog>: foco atrapado y Esc de serie). cerrable:false la hace obligatoria.
export function dialogo(html, { cerrable = true } = {}) {
  const d = document.createElement('dialog');
  d.className = 'dlg'; d.innerHTML = `<div class="dlg-in">${html}</div>`;
  if (!cerrable) d.addEventListener('cancel', e => e.preventDefault());
  d.addEventListener('click', e => { if (cerrable && e.target === d) d.close(); });
  d.addEventListener('close', () => d.remove());
  document.body.append(d); d.showModal();
  return d;
}
