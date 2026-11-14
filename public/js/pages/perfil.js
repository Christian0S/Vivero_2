import { api } from '../api.js';
import { esc, avatar, toast } from '../ui.js';
export const title = 'Mi perfil';
const ROL = { administrador: 'Administrador', gerente: 'Gerente', empleado: 'Empleado', proveedor: 'Proveedor' };

// La foto se reduce en el navegador (cuadrada de 256 px): se sube liviana y el servidor solo valida y guarda
async function reducir(file) {
  if (file.size > 15 * 1024 * 1024) throw new Error('La imagen es demasiado grande (máximo 15 MB)');
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error('No se pudo leer esa imagen. Prueba con JPG, PNG o WebP'); }
  const lado = Math.min(bmp.width, bmp.height), c = document.createElement('canvas');
  c.width = c.height = 256;
  c.getContext('2d').drawImage(bmp, (bmp.width - lado) / 2, (bmp.height - lado) / 2, lado, lado, 0, 0, 256, 256);
  for (const tipo of ['image/webp', 'image/jpeg']) {
    const blob = await new Promise(r => c.toBlob(r, tipo, 0.85));
    if (blob && blob.type === tipo) return blob;
  }
  throw new Error('No se pudo preparar la imagen');
}

export async function render(root, { user, alive }) {
  let yo = await api('/me');
  if (!alive()) return;

  const pintar = () => {
    root.innerHTML = `<div class="page-head"><div><h1>Mi perfil</h1><p>Tus datos personales y tu seguridad.</p></div></div>
    <div class="grid two">
      <section class="card card-pad">
        <h2 style="margin-bottom:1rem">Datos personales</h2>
        <div class="perfil-foto">${avatar(yo.nombreCorto, yo.fotoUrl, 'xl')}
          <div><div class="acts"><button class="btn sm" id="foto-elegir" type="button">${yo.fotoUrl ? 'Cambiar foto' : 'Subir foto'}</button>
            ${yo.fotoUrl ? '<button class="btn sm" id="foto-quitar" type="button">Quitar</button>' : ''}</div>
            <p class="hint muted" style="font-size:.8rem;margin-top:.5rem">JPG, PNG o WebP. Se recorta en cuadrado.</p></div>
          <input type="file" id="foto-input" accept="image/jpeg,image/png,image/webp" hidden></div>
        <form id="f-datos" class="form-grid" novalidate>
          <div class="form-error" id="e-datos" role="alert" hidden></div>
          <div class="field"><label for="p-nom">Nombre</label><input class="input" id="p-nom" maxlength="80" value="${esc(yo.nombre)}" required></div>
          <div class="field"><label for="p-ape">Apellidos</label><input class="input" id="p-ape" maxlength="80" value="${esc(yo.apellidos)}" required></div>
          <div class="field"><label for="p-tel">Teléfono</label><input class="input" id="p-tel" type="tel" maxlength="20" value="${esc(yo.telefono)}" placeholder="+57 300 123 4567"></div>
          <div class="field"><label>Correo electrónico</label><input class="input" value="${esc(yo.email)}" disabled><span class="hint">Para cambiar el correo o el rol, habla con el administrador.</span></div>
          <div class="field"><label>Rol</label><input class="input" value="${esc(ROL[yo.rol] || yo.rol)}" disabled></div>
          <div class="dlg-actions"><button class="btn primary" type="submit">Guardar cambios</button></div>
        </form>
      </section>
      <section class="card card-pad">
        <h2 style="margin-bottom:.4rem">Cambiar contraseña</h2>
        <p class="muted" style="margin-bottom:1rem;font-size:.9rem">Al cambiarla se cierran tus sesiones en otros dispositivos.</p>
        <form id="f-clave" class="form-grid" novalidate>
          <div class="form-error" id="e-clave" role="alert" hidden></div>
          <div class="field"><label for="k-act">Contraseña actual</label><input class="input" id="k-act" type="password" autocomplete="current-password" required></div>
          <div class="field"><label for="k-new">Nueva contraseña</label><input class="input" id="k-new" type="password" autocomplete="new-password" required><span class="hint">Mínimo 10 caracteres. No incluyas tu correo.</span></div>
          <div class="field"><label for="k-rep">Repite la nueva contraseña</label><input class="input" id="k-rep" type="password" autocomplete="new-password" required></div>
          <div class="dlg-actions"><button class="btn primary" type="submit">Cambiar contraseña</button></div>
        </form>
      </section>
    </div>`;
    enlazar();
  };

  const avisar = () => window.dispatchEvent(new Event('perfil:cambio'));   // repinta el encabezado
  function enlazar() {
    const input = root.querySelector('#foto-input');
    root.querySelector('#foto-elegir').onclick = () => input.click();
    input.onchange = async () => {
      const f = input.files[0]; if (!f) return;
      try { const blob = await reducir(f); yo = await api('/me/foto', { method: 'PUT', blob }); toast('Foto actualizada'); pintar(); avisar(); }
      catch (ex) { toast(ex.message, 'error'); }
      input.value = '';
    };
    const q = root.querySelector('#foto-quitar');
    if (q) q.onclick = async () => { try { yo = await api('/me/foto', { method: 'DELETE' }); toast('Foto eliminada'); pintar(); avisar(); } catch (ex) { toast(ex.message, 'error'); } };

    root.querySelector('#f-datos').addEventListener('submit', async e => {
      e.preventDefault();
      const err = root.querySelector('#e-datos'); err.hidden = true;
      const cambios = {}, v = id => root.querySelector(id).value.trim();
      if (v('#p-nom') !== yo.nombre) cambios.nombre = v('#p-nom');
      if (v('#p-ape') !== yo.apellidos) cambios.apellidos = v('#p-ape');
      if (v('#p-tel') !== yo.telefono) cambios.telefono = v('#p-tel');
      if (!Object.keys(cambios).length) { toast('No hay cambios para guardar'); return; }
      try { yo = await api('/me', { method: 'PATCH', body: cambios }); toast('Datos guardados'); pintar(); avisar(); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });

    root.querySelector('#f-clave').addEventListener('submit', async e => {
      e.preventDefault();
      const err = root.querySelector('#e-clave'); err.hidden = true;
      const nueva = root.querySelector('#k-new').value;
      if (nueva !== root.querySelector('#k-rep').value) { err.textContent = 'Las contraseñas nuevas no coinciden'; err.hidden = false; return; }
      try { await api('/auth/cambiar-clave', { method: 'POST', body: { actual: root.querySelector('#k-act').value, nueva } }); toast('Contraseña actualizada'); e.target.reset(); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });
  }
  pintar();
}
