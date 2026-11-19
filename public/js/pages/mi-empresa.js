// "Mi empresa": el proveedor mantiene al día su contacto sin depender del administrador.
import { api, ApiError } from '../api.js';
import { esc, fmtTel, urlWhatsapp, copiar } from '../ui.js';
import { formularioProveedor } from '../proveedor-form.js';
export const title = 'Mi empresa';

export async function render(root, { alive }) {
  let p;
  try { p = await api('/mi-proveedor'); }
  catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) throw e;
    root.innerHTML = `<div class="page-head"><div><h1>Mi empresa</h1></div></div><div class="card empty"><h2>Tu cuenta aún no está vinculada a un proveedor</h2><p>${esc(e.message)}</p></div>`;
    return;
  }
  if (!alive()) return;
  const fila = (k, v) => `<div><dt>${k}</dt><dd>${v || '<span class="muted">Sin registrar</span>'}</dd></div>`;
  const pintar = () => {
    root.innerHTML = `<div class="page-head"><div><h1>Mi empresa</h1><p>Mantén tus datos de contacto al día: así el vivero puede escribirte sin perder tiempo.</p></div>
      <button class="btn primary" id="editar" type="button">Actualizar mis datos</button></div>
      <section class="card card-pad"><h2 style="margin-bottom:1rem">${esc(p.nombre)}</h2>
        <dl class="datos-lista">
          ${fila('Categoría', esc(p.categoria || ''))}${fila('Documento', p.numero_doc ? esc(`${p.tipo_doc || ''} ${p.numero_doc}`.trim()) : '')}
          ${fila('Ciudad', esc([p.ciudad, p.pais].filter(Boolean).join(', ')))}${fila('Dirección', esc(p.direccion || ''))}
          ${fila('Teléfono', p.telefono ? `<button class="copiable" type="button" data-copiar="${esc(p.telefono)}" title="Copiar teléfono">${esc(fmtTel(p.telefono))}</button>` : '')}
          ${fila('WhatsApp', p.whatsapp ? `<a href="${esc(urlWhatsapp(p.whatsapp))}" target="_blank" rel="noopener noreferrer">${esc(fmtTel(p.whatsapp))}</a>` : '')}
          ${fila('Correo', esc(p.correo || ''))}
        </dl></section>`;
    root.querySelector('#editar').onclick = () => formularioProveedor({ p, opciones: null, propio: true, alGuardar: fila2 => { p = fila2; pintar(); } });
    root.querySelector('[data-copiar]')?.addEventListener('click', e => copiar(e.currentTarget.dataset.copiar, 'Teléfono copiado exitosamente'));
  };
  pintar();
}
