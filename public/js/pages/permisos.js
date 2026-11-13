import { api } from '../api.js';
import { esc, toast } from '../ui.js';
export const title = 'Permisos';
const ROL = { administrador: 'Administrador', gerente: 'Gerente', empleado: 'Empleado', proveedor: 'Proveedor' };
const ORDEN = Object.keys(ROL);   // orden lógico, no alfabético
const porOrden = (a, b) => ORDEN.indexOf(a.nombre) - ORDEN.indexOf(b.nombre);

export async function render(root, { user, alive }) {
  const m = await api('/admin/permisos'); m.roles.sort(porOrden);
  if (!alive()) return;
  const editable = user.permisos.includes('permisos.admin');
  const dado = new Set(m.asignados.map(a => `${a.rol}|${a.permiso}`));

  root.innerHTML = `<div class="page-head"><div><h1>Permisos por rol</h1><p>Define qué puede hacer cada rol. El administrador siempre tiene todos.</p></div></div>
    <div class="notice">Los cambios rigen desde el próximo inicio de sesión de cada persona o cuando su sesión se renueve (máximo 10 minutos).</div>
    <div class="card"><div class="table-wrap"><table class="matrix"><thead><tr><th>Permiso</th>${m.roles.map(r => `<th>${esc(ROL[r.nombre] || r.nombre)}<small>${esc(r.descripcion)}</small></th>`).join('')}</tr></thead>
      <tbody>${m.permisos.map(p => `<tr><td><strong>${esc(p.descripcion)}</strong><small><code>${esc(p.codigo)}</code></small></td>${m.roles.map(r => {
        const fijo = r.nombre === 'administrador';
        return `<td class="chk"><input type="checkbox" aria-label="${esc(ROL[r.nombre] || r.nombre)}: ${esc(p.descripcion)}" data-rol="${esc(r.nombre)}" data-permiso="${esc(p.codigo)}" ${fijo || dado.has(`${r.nombre}|${p.codigo}`) ? 'checked' : ''} ${fijo || !editable ? 'disabled' : ''}></td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div></div>`;

  root.querySelector('tbody').addEventListener('change', async e => {
    const c = e.target.closest('input[type=checkbox]'); if (!c) return;
    c.disabled = true;
    try { await api('/admin/permisos', { method: 'PUT', body: { rol: c.dataset.rol, permiso: c.dataset.permiso, otorgado: c.checked } }); toast('Permiso actualizado'); }
    catch (ex) { c.checked = !c.checked; toast(ex.message, 'error'); }   // si falla, vuelve a como estaba
    finally { c.disabled = false; }
  });
}
