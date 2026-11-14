import { api } from '../api.js';
import { esc, dialogo, toast, norm, debounce, avatar, fechaHora } from '../ui.js';
export const title = 'Usuarios';
const ROL = { administrador: 'Administrador', gerente: 'Gerente', empleado: 'Empleado', proveedor: 'Proveedor' };
const ORDEN = Object.keys(ROL);   // orden lógico, no alfabético
const porOrden = (a, b) => ORDEN.indexOf(a.nombre) - ORDEN.indexOf(b.nombre);

export async function render(root, { user, alive }) {
  const [matriz, inicial] = await Promise.all([api('/admin/permisos'), api('/admin/usuarios')]);
  if (!alive()) return;
  matriz.roles.sort(porOrden);
  let lista = inicial;
  const opcionesRol = sel => matriz.roles.map(r => `<option value="${esc(r.nombre)}" ${r.nombre === sel ? 'selected' : ''}>${esc(ROL[r.nombre] || r.nombre)}</option>`).join('');

  root.innerHTML = `<div class="page-head"><div><h1>Usuarios</h1><p id="count"></p></div><button class="btn primary" id="nuevo" type="button">Nuevo usuario</button></div>
    <div class="toolbar"><input class="input" id="q" type="search" placeholder="Buscar por nombre o correo…" aria-label="Buscar usuarios"></div>
    <div class="card"><div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th class="num">Acciones</th></tr></thead><tbody id="rows"></tbody></table></div></div>`;
  const rows = root.querySelector('#rows'), q = root.querySelector('#q'), count = root.querySelector('#count');

  function dibujar() {
    const t = norm(q.value);
    const ver = lista.filter(u => !t || norm(`${u.nombre} ${u.apellidos} ${u.email}`).includes(t));
    count.textContent = `${ver.length} de ${lista.length} cuentas`;
    rows.innerHTML = ver.map(u => `<tr data-id="${esc(u.id)}">
      <td><div class="prod">${avatar(u.nombreCorto, u.fotoUrl)}<div><strong>${esc(u.nombreCorto)}</strong><small>${esc(u.email)}</small></div></div></td>
      <td><span class="badge info">${esc(ROL[u.rol] || u.rol)}</span></td>
      <td><span class="badge ${u.activo ? 'ok' : 'danger'}">${u.activo ? 'Activo' : 'Inactivo'}</span> ${u.debeCambiarClave ? '<span class="badge warn">Clave pendiente</span>' : ''}</td>
      <td>${esc(fechaHora(u.ultimoAcceso))}</td>
      <td><div class="acts"><button class="btn sm" data-acc="editar" type="button">Editar</button><button class="btn sm" data-acc="reset" type="button">Restablecer clave</button></div></td></tr>`).join('')
      || '<tr><td colspan="5" class="empty">Sin resultados.</td></tr>';
  }
  const recargar = async () => { lista = await api('/admin/usuarios'); dibujar(); };

  function mostrarClave(titulo, email, clave) {
    const d = dialogo(`<h2>${esc(titulo)}</h2>
      <p class="muted" style="margin:.4rem 0 1rem">Cuenta: <b>${esc(email)}</b></p>
      <div class="code-box"><code>${esc(clave)}</code><button class="btn sm" id="copiar" type="button">Copiar</button></div>
      <p class="notice" style="margin-top:1rem">Entrégala por un canal seguro. <b>Solo se muestra esta vez</b>. La persona deberá cambiarla al ingresar.</p>
      <div class="dlg-actions"><button class="btn primary" id="listo" type="button">Listo</button></div>`);
    d.querySelector('#listo').onclick = () => d.close();
    d.querySelector('#copiar').onclick = async e => { try { await navigator.clipboard.writeText(clave); e.target.textContent = 'Copiada ✓'; } catch { e.target.textContent = 'Selecciónala y copia'; } };
  }

  function formulario(titulo, u, onOk) {
    const nuevo = !u, propio = u?.id === user.id;
    const d = dialogo(`<h2>${esc(titulo)}</h2>
      <form class="form-grid" novalidate>
        <div class="form-error" role="alert" hidden></div>
        <div class="field"><label for="u-nom">Nombre</label><input class="input" id="u-nom" maxlength="80" value="${esc(u?.nombre || '')}" required></div>
        <div class="field"><label for="u-ape">Apellidos</label><input class="input" id="u-ape" maxlength="80" value="${esc(u?.apellidos || '')}" required></div>
        ${nuevo ? '<div class="field"><label for="u-mail">Correo electrónico</label><input class="input" id="u-mail" type="email" maxlength="120" required></div>' : `<div class="field"><label>Correo electrónico</label><input class="input" value="${esc(u.email)}" disabled></div>`}
        <div class="field"><label for="u-rol">Rol</label><select class="input" id="u-rol" ${propio ? 'disabled' : ''}>${opcionesRol(u?.rol || 'empleado')}</select></div>
        ${nuevo ? '' : `<label class="switch"><input type="checkbox" id="u-act" ${u.activo ? 'checked' : ''} ${propio ? 'disabled' : ''}> Cuenta activa</label>`}
        ${propio ? '<p class="muted" style="font-size:.85rem">No puedes cambiar tu propio rol ni desactivar tu cuenta.</p>' : ''}
        <div class="dlg-actions"><button class="btn" type="button" data-cancel>Cancelar</button><button class="btn primary" type="submit">${nuevo ? 'Crear usuario' : 'Guardar cambios'}</button></div>
      </form>`);
    const err = d.querySelector('.form-error');
    d.querySelector('[data-cancel]').onclick = () => d.close();
    d.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault(); err.hidden = true;
      const btn = e.submitter; btn.disabled = true;
      try { await onOk(d); d.close(); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; }
    });
    d.querySelector('#u-nom').focus();
  }

  root.querySelector('#nuevo').onclick = () => formulario('Nuevo usuario', null, async d => {
    const r = await api('/admin/usuarios', { method: 'POST', body: { nombre: d.querySelector('#u-nom').value, apellidos: d.querySelector('#u-ape').value, email: d.querySelector('#u-mail').value, rol: d.querySelector('#u-rol').value } });
    await recargar(); mostrarClave('Usuario creado', r.email, r.claveTemporal);
  });

  rows.addEventListener('click', e => {
    const b = e.target.closest('[data-acc]'); if (!b) return;
    const u = lista.find(x => x.id === b.closest('tr').dataset.id); if (!u) return;
    if (b.dataset.acc === 'editar') {
      formulario(`Editar a ${u.nombreCorto}`, u, async d => {
        const cambios = {}, nom = d.querySelector('#u-nom').value.trim(), ape = d.querySelector('#u-ape').value.trim(), rol = d.querySelector('#u-rol').value, act = d.querySelector('#u-act').checked;
        if (nom !== u.nombre) cambios.nombre = nom; if (ape !== u.apellidos) cambios.apellidos = ape;
        if (rol !== u.rol) cambios.rol = rol; if (act !== u.activo) cambios.activo = act;
        if (!Object.keys(cambios).length) return;
        await api(`/admin/usuarios/${u.id}`, { method: 'PATCH', body: cambios });
        toast(cambios.rol || cambios.activo === false ? 'Guardado. Sus sesiones abiertas se cerraron.' : 'Cambios guardados'); await recargar();
      });
    } else {
      const d = dialogo(`<h2>¿Restablecer la clave?</h2><p class="muted" style="margin:.4rem 0 1rem">Se generará una clave temporal para <b>${esc(u.nombreCorto)}</b> y se cerrarán sus sesiones abiertas.</p>
        <div class="dlg-actions"><button class="btn" data-cancel type="button">Cancelar</button><button class="btn primary" id="ok" type="button">Restablecer</button></div>`);
      d.querySelector('[data-cancel]').onclick = () => d.close();
      d.querySelector('#ok').onclick = async () => {
        try { const r = await api(`/admin/usuarios/${u.id}/reset-clave`, { method: 'POST' }); d.close(); await recargar(); mostrarClave('Clave restablecida', u.email, r.claveTemporal); }
        catch (ex) { d.close(); toast(ex.message, 'error'); }
      };
    }
  });
  q.addEventListener('input', debounce(dibujar));
  dibujar();
}
