import { api } from '../api.js';
import { esc, dialogo, toast, norm, debounce, avatar, fechaHora, fmtTel, copiar } from '../ui.js';
export const title = 'Usuarios';
const ROL = { administrador: 'Administrador', gerente: 'Gerente', empleado: 'Empleado', proveedor: 'Proveedor' };
const ORDEN = Object.keys(ROL);   // orden lógico, no alfabético
const porOrden = (a, b) => ORDEN.indexOf(a.nombre) - ORDEN.indexOf(b.nombre);
const TIPOS_DOC = ['Cédula', 'Cédula de extranjería', 'NIT', 'Pasaporte', 'Otro'];

export async function render(root, { user, alive }) {
  const [matriz, inicial] = await Promise.all([api('/admin/permisos'), api('/admin/usuarios')]);
  if (!alive()) return;
  matriz.roles.sort(porOrden);
  let lista = inicial;
  const opcionesRol = sel => matriz.roles.map(r => `<option value="${esc(r.nombre)}" ${r.nombre === sel ? 'selected' : ''}>${esc(ROL[r.nombre] || r.nombre)}</option>`).join('');
  const opcionesDoc = sel => `<option value="">Sin especificar</option>${TIPOS_DOC.map(t => `<option ${t === sel ? 'selected' : ''}>${t}</option>`).join('')}`;

  root.innerHTML = `<div class="page-head"><div><h1>Usuarios</h1><p id="count"></p></div><button class="btn primary" id="nuevo" type="button">Nuevo usuario</button></div>
    <div class="toolbar"><input class="input" id="q" type="search" placeholder="Buscar por nombre, correo, cargo o teléfono…" aria-label="Buscar usuarios"></div>
    <div class="card"><div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th class="num">Acciones</th></tr></thead><tbody id="rows"></tbody></table></div></div>`;
  const rows = root.querySelector('#rows'), q = root.querySelector('#q'), count = root.querySelector('#count');

  function dibujar() {
    const t = norm(q.value);
    const ver = lista.filter(u => !t || norm(`${u.nombre} ${u.apellidos} ${u.email} ${u.cargo} ${u.telefono}`).includes(t));
    count.textContent = `${ver.length} de ${lista.length} cuentas`;
    rows.innerHTML = ver.map(u => `<tr data-id="${esc(u.id)}">
      <td><div class="prod">${avatar(u.nombreCorto, u.fotoUrl)}<div><strong>${esc(u.nombre)} ${esc(u.apellidos)}</strong><small>${esc(u.email)}</small>
        <small>${[u.cargo, u.telefono ? fmtTel(u.telefono) : ''].filter(Boolean).map(esc).join(' · ') || '<span class="muted">Sin cargo ni teléfono</span>'}</small></div></div></td>
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
    d.querySelector('#copiar').onclick = async e => { if (await copiar(clave, 'Clave temporal copiada')) e.target.textContent = 'Copiada ✓'; };
  }

  // Un solo formulario para crear y para editar: datos personales + cuenta
  function formulario(titulo, u, onOk) {
    const nuevo = !u, propio = u?.id === user.id, v = k => esc(u?.[k] ?? '');
    const d = dialogo(`<h2>${esc(titulo)}</h2>
      <form class="form-grid" novalidate style="margin-top:1rem">
        <div class="form-error" role="alert" hidden></div>
        <p class="form-section">Datos personales</p>
        <div class="form-2">
          <div class="field"><label for="u-nom">Nombre</label><input class="input" id="u-nom" maxlength="80" value="${v('nombre')}" required></div>
          <div class="field"><label for="u-ape">Apellidos</label><input class="input" id="u-ape" maxlength="80" value="${v('apellidos')}" required></div>
          <div class="field"><label for="u-tdoc">Tipo de documento</label><select class="input" id="u-tdoc">${opcionesDoc(u?.tipoDoc)}</select></div>
          <div class="field"><label for="u-ndoc">Número de documento</label><input class="input" id="u-ndoc" maxlength="30" value="${v('numeroDoc')}"></div>
          <div class="field"><label for="u-tel">Teléfono</label><input class="input" id="u-tel" type="tel" maxlength="24" value="${esc(fmtTel(u?.telefono))}" placeholder="+57 300 123 4567"></div>
          <div class="field"><label for="u-cargo">Cargo</label><input class="input" id="u-cargo" maxlength="80" value="${v('cargo')}"></div>
          <div class="field"><label for="u-ciu">Ciudad</label><input class="input" id="u-ciu" maxlength="80" value="${v('ciudad')}"></div>
          <div class="field"><label for="u-dir">Dirección</label><input class="input" id="u-dir" maxlength="160" value="${v('direccion')}"></div>
        </div>
        <p class="form-section">Cuenta de acceso</p>
        <div class="form-2">
          <div class="field"><label for="u-mail">Correo electrónico (con él inicia sesión)</label><input class="input" id="u-mail" type="email" maxlength="120" value="${v('email')}" ${propio ? 'disabled' : ''} required></div>
          <div class="field"><label for="u-rol">Rol</label><select class="input" id="u-rol" ${propio ? 'disabled' : ''}>${opcionesRol(u?.rol || 'empleado')}</select></div>
        </div>
        ${nuevo ? '' : `<label class="check"><input type="checkbox" id="u-act" ${u.activo ? 'checked' : ''} ${propio ? 'disabled' : ''}> Cuenta activa</label>`}
        ${propio ? '<p class="muted" style="font-size:.85rem">Es tu propia cuenta: por seguridad no puedes cambiar tu rol, tu correo ni desactivarte. Otro administrador puede hacerlo.</p>' : ''}
        ${!nuevo && !propio ? '<p class="muted" style="font-size:.85rem">Cambiar el rol, el correo o el estado cierra sus sesiones abiertas.</p>' : ''}
        ${nuevo ? '' : `<p class="muted" style="font-size:.85rem">Cuenta creada: ${esc(fechaHora(u.creadaEn))} · Último acceso: ${esc(fechaHora(u.ultimoAcceso))}</p>`}
        <div class="dlg-actions"><button class="btn" type="button" data-cancel>Cancelar</button><button class="btn primary" type="submit">${nuevo ? 'Crear usuario' : 'Guardar cambios'}</button></div>
      </form>`, { clase: 'wide' });
    const err = d.querySelector('.form-error'), g = id => d.querySelector(id).value;
    d.querySelector('[data-cancel]').onclick = () => d.close();
    d.querySelector('form').addEventListener('input', () => { err.hidden = true; });
    d.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault(); err.hidden = true; const btn = e.submitter; btn.disabled = true;
      try { await onOk({ nombre: g('#u-nom'), apellidos: g('#u-ape'), tipo_doc: g('#u-tdoc'), numero_doc: g('#u-ndoc'), telefono: g('#u-tel'), cargo: g('#u-cargo'), ciudad: g('#u-ciu'), direccion: g('#u-dir'),
        email: g('#u-mail'), rol: g('#u-rol'), activo: d.querySelector('#u-act')?.checked }); d.close(); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; }
    });
    d.querySelector('#u-nom').focus();
  }

  root.querySelector('#nuevo').onclick = () => formulario('Nuevo usuario', null, async f => {
    const body = { nombre: f.nombre, apellidos: f.apellidos, email: f.email, rol: f.rol };
    for (const k of ['tipo_doc', 'numero_doc', 'telefono', 'cargo', 'ciudad', 'direccion']) if (f[k].trim()) body[k] = f[k];
    const r = await api('/admin/usuarios', { method: 'POST', body });
    await recargar(); mostrarClave('Usuario creado', r.email, r.claveTemporal);
  });

  rows.addEventListener('click', e => {
    const b = e.target.closest('[data-acc]'); if (!b) return;
    const u = lista.find(x => x.id === b.closest('tr').dataset.id); if (!u) return;
    if (b.dataset.acc === 'editar') {
      formulario(`Editar a ${u.nombreCorto}`, u, async f => {
        // Solo se envía lo que cambió
        const cambios = {}, orig = { nombre: u.nombre, apellidos: u.apellidos, tipo_doc: u.tipoDoc, numero_doc: u.numeroDoc, telefono: fmtTel(u.telefono), cargo: u.cargo, ciudad: u.ciudad, direccion: u.direccion, email: u.email, rol: u.rol, activo: u.activo };
        for (const k of Object.keys(orig)) if (f[k] !== undefined && (typeof f[k] === 'boolean' ? f[k] !== orig[k] : f[k].trim() !== String(orig[k] ?? ''))) cambios[k] = f[k];
        if (u.id === user.id) { delete cambios.rol; delete cambios.email; delete cambios.activo; }
        if (!Object.keys(cambios).length) return;
        await api(`/admin/usuarios/${u.id}`, { method: 'PATCH', body: cambios });
        toast('rol' in cambios || 'email' in cambios || cambios.activo === false ? 'Guardado. Sus sesiones abiertas se cerraron.' : 'Cambios guardados'); await recargar();
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
