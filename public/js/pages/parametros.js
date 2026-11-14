import { api } from '../api.js';
import { esc, toast, fechaHora } from '../ui.js';
export const title = 'Parámetros';

const AYUDA = { telefono: 'Ej. 607 123 4567', whatsapp: 'Con indicativo: +57 300 123 4567', correo: 'nombre@dominio.com', texto: '', entero: '', decimal: '' };

export async function render(root, { alive }) {
  const lista = await api('/parametros');
  if (!alive()) return;
  const grupos = [...new Set(lista.map(p => p.grupo))];
  const rango = p => (p.minimo !== null || p.maximo !== null ? `Entre ${p.minimo ?? '…'} y ${p.maximo ?? '…'}` : AYUDA[p.tipo]);

  root.innerHTML = `<div class="page-head"><div><h1>Parámetros</h1><p>Ajustes del sistema. Los marcados como públicos se muestran en el catálogo.</p></div></div>
    <div class="grid" style="gap:1rem">${grupos.map(g => `
      <section class="card card-pad"><h2 style="margin-bottom:1rem">${esc(g)}</h2>
        <form class="form-grid" data-grupo="${esc(g)}" novalidate>
          <div class="param-grid">${lista.filter(p => p.grupo === g).map(p => `
            <div class="field"><label for="p-${esc(p.clave)}">${esc(p.descripcion)}${p.publico ? ' <span class="badge info">Público</span>' : ''}</label>
              <input class="input" id="p-${esc(p.clave)}" data-clave="${esc(p.clave)}" data-orig="${esc(p.valor)}" value="${esc(p.valor)}" maxlength="120" ${p.tipo === 'entero' || p.tipo === 'decimal' ? 'inputmode="decimal"' : ''}>
              <span class="hint">${esc(rango(p))}</span><span class="field-error" data-err hidden></span></div>`).join('')}</div>
          <div class="dlg-actions"><button class="btn primary" type="submit">Guardar ${esc(g.toLowerCase())}</button></div>
        </form></section>`).join('')}</div>
    <p class="muted" style="margin-top:1rem;font-size:.85rem">Última modificación: ${esc(fechaHora(lista.map(p => p.actualizado_en).sort().pop()))}</p>`;

  root.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target.closest('form'), btn = e.submitter;
    const campos = [...form.querySelectorAll('input[data-clave]')].filter(i => i.value.trim() !== i.dataset.orig);
    if (!campos.length) { toast('No hay cambios para guardar'); return; }
    btn.disabled = true; let ok = 0;
    for (const i of campos) {
      const err = i.parentElement.querySelector('[data-err]'); err.hidden = true;
      try { const r = await api(`/parametros/${encodeURIComponent(i.dataset.clave)}`, { method: 'PUT', body: { valor: i.value } }); i.value = i.dataset.orig = r.valor; ok++; }
      catch (ex) { err.textContent = ex.message; err.hidden = false; }
    }
    btn.disabled = false;
    if (ok) toast(ok === campos.length ? 'Parámetros guardados' : `Se guardaron ${ok} de ${campos.length}; revisa los marcados`, ok === campos.length ? '' : 'error');
  });
}
