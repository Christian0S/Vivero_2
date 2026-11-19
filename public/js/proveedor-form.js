// Formulario de proveedor, compartido: el gerente y el administrador lo usan completo; el propio proveedor solo ve su contacto.
import { api } from './api.js';
import { esc, dialogo, toast, fmtTel } from './ui.js';

export function formularioProveedor({ p, opciones, propio = false, alGuardar }) {
  const v = k => esc(p[k] ?? '');
  const opts = (items, sel, vacio) => `<option value="">${vacio}</option>${items.map(i => `<option value="${esc(i.valor)}" ${String(i.valor) === String(sel ?? '') ? 'selected' : ''}>${esc(i.texto)}</option>`).join('')}`;
  const mismoNumero = !!p.telefono && p.whatsapp === p.telefono;
  const d = dialogo(`<h2>${propio ? 'Actualizar mis datos de contacto' : `Editar ${esc(p.nombre)}`}</h2>
    <form class="form-grid" novalidate style="margin-top:1rem">
      <div class="form-error" role="alert" hidden></div>
      ${propio ? `<p class="muted" style="font-size:.9rem">Empresa: <b>${esc(p.nombre)}</b>${p.categoria ? ` · ${esc(p.categoria)}` : ''}. El nombre, el documento y la categoría los cambia el vivero.</p>` : `
      <p class="form-section">Empresa</p>
      <div class="field"><label for="v-nom">Nombre</label><input class="input" id="v-nom" maxlength="120" value="${v('nombre')}" required></div>
      <div class="form-2">
        <div class="field"><label for="v-tdoc">Tipo de documento</label><select class="input" id="v-tdoc">${opts(opciones.tiposDoc.map(t => ({ valor: t, texto: t })), p.tipo_doc, 'Sin especificar')}</select></div>
        <div class="field"><label for="v-ndoc">Número de documento</label><input class="input" id="v-ndoc" maxlength="30" value="${v('numero_doc')}"></div>
      </div>
      <div class="field"><label for="v-cat">Categoría</label><select class="input" id="v-cat">${opts(opciones.categorias.map(c => ({ valor: c.id, texto: c.nombre })), p.categoria_id, 'Elige una categoría…')}</select>
        <span class="hint">Solo se puede cambiar si el proveedor no tiene productos asociados.</span></div>`}
      <p class="form-section">Ubicación</p>
      <div class="form-2">
        ${propio ? '' : `<div class="field"><label for="v-pais">País</label><input class="input" id="v-pais" maxlength="60" value="${v('pais')}"></div>`}
        <div class="field"><label for="v-ciu">Ciudad</label><input class="input" id="v-ciu" maxlength="80" value="${v('ciudad')}"></div>
      </div>
      <div class="field"><label for="v-dir">Dirección</label><input class="input" id="v-dir" maxlength="160" value="${v('direccion')}"></div>
      <p class="form-section">Contacto</p>
      <div class="field"><label for="v-tel">Teléfono <span class="muted">(para llamar)</span></label><input class="input" id="v-tel" type="tel" maxlength="24" value="${esc(fmtTel(p.telefono))}" placeholder="+57 300 123 4567">
        <span class="hint">Con o sin el +57. Un fijo necesita el indicativo de la ciudad (601, 602…).</span></div>
      <label class="check"><input type="checkbox" id="v-mismo" ${mismoNumero ? 'checked' : ''}> El WhatsApp es el mismo número</label>
      <div class="field" id="v-wa-campo"><label for="v-wa">WhatsApp <span class="muted">(para escribir; debe ser un celular)</span></label><input class="input" id="v-wa" type="tel" maxlength="24" value="${esc(fmtTel(p.whatsapp))}" placeholder="+57 300 123 4567"></div>
      <div class="field"><label for="v-mail">Correo electrónico</label><input class="input" id="v-mail" type="email" maxlength="120" value="${v('correo')}" placeholder="nombre@dominio.com"></div>
      <div class="dlg-actions"><button class="btn" type="button" data-cancel>Cancelar</button><button class="btn primary" type="submit">Guardar cambios</button></div>
    </form>`, { clase: 'wide' });
  const $ = s => d.querySelector(s), err = $('.form-error');
  const alternar = () => { $('#v-wa').disabled = $('#v-mismo').checked; $('#v-wa-campo').style.opacity = $('#v-mismo').checked ? '.5' : '1'; };
  $('#v-mismo').addEventListener('change', alternar); alternar();
  $('form').addEventListener('input', () => { err.hidden = true; });
  $('[data-cancel]').onclick = () => d.close();
  $('form').addEventListener('submit', async e => {
    e.preventDefault(); err.hidden = true; const btn = e.submitter; btn.disabled = true;
    const tel = $('#v-tel').value;
    const body = { ciudad: $('#v-ciu').value, direccion: $('#v-dir').value, telefono: tel, whatsapp: $('#v-mismo').checked ? tel : $('#v-wa').value, correo: $('#v-mail').value };
    if (!propio) Object.assign(body, { nombre: $('#v-nom').value, tipo_doc: $('#v-tdoc').value, numero_doc: $('#v-ndoc').value, pais: $('#v-pais').value, categoria_id: Number($('#v-cat').value) || null });
    try {
      const fila = await api(propio ? '/mi-proveedor' : `/proveedores/${p.id}`, { method: 'PUT', body });
      d.close(); toast('Datos actualizados'); alGuardar(fila);
    } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; }
  });
  (propio ? $('#v-tel') : $('#v-nom')).focus();
}
