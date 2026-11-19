// Administración de usuarios y permisos. Coordina las dos bases SIN mezclarlas:
// la cuenta (correo, rol, estado, contraseña) vive en identidad; el perfil (datos personales) vive en el negocio.
const express = require('express');
const { requireAuth, requirePermiso } = require('../../compartido/auth');
const V = require('../../compartido/validaciones');
const { perfil } = require('../nombres');

class ErrorServicio extends Error { constructor(msg, status) { super(msg); this.status = status; this.servicio = true; } }
const CAMPOS_PERFIL = ['nombre', 'apellidos', 'telefono', 'tipo_doc', 'numero_doc', 'cargo', 'ciudad', 'direccion'];
const CAMPOS_CUENTA = ['email', 'rol', 'activo'];
const COLUMNAS = 'cuenta_id, nombre, apellidos, telefono, foto_id, tipo_doc, numero_doc, cargo, ciudad, direccion';

// Valida los datos personales que vengan en el cuerpo. Devuelve { error } o { datos } con SOLO lo recibido ('' = dejar vacío).
function validarPerfil(b, { creando = false } = {}) {
  const datos = {}, falla = error => ({ error });
  if (creando || 'nombre' in b) { datos.nombre = V.texto(b.nombre, 1, 80); if (!datos.nombre) return falla('El nombre es obligatorio (máximo 80 caracteres)'); }
  if (creando || 'apellidos' in b) { datos.apellidos = V.texto(b.apellidos, 1, 80); if (!datos.apellidos) return falla('Los apellidos son obligatorios (máximo 80 caracteres)'); }
  if ('telefono' in b) { const t = V.telefono(b.telefono); if (t?.error) return falla(t.error); datos.telefono = t; }
  if ('tipo_doc' in b) { const t = V.tipoDoc(b.tipo_doc); if (t?.error) return falla(t.error); datos.tipo_doc = t; }
  if ('numero_doc' in b) { const t = V.numeroDoc(b.numero_doc); if (t?.error) return falla(t.error); datos.numero_doc = t; }
  if ('cargo' in b) { datos.cargo = V.opcional(b.cargo, 80); if (datos.cargo === null) return falla('El cargo admite hasta 80 caracteres'); }
  if ('ciudad' in b) { datos.ciudad = V.opcional(b.ciudad, 80); if (datos.ciudad === null) return falla('La ciudad admite hasta 80 caracteres'); }
  if ('direccion' in b) { datos.direccion = V.opcional(b.direccion, 160); if (datos.direccion === null) return falla('La dirección admite hasta 160 caracteres'); }
  if (datos.numero_doc && !(datos.tipo_doc ?? b.tipo_doc)) return falla('Indica el tipo de documento');
  return { datos };
}

// Llama al servicio de identidad reenviando el token del administrador: allí se verifica de nuevo
async function identidad(req, method, ruta, body) {
  let r;
  try {
    r = await fetch((process.env.IDENTIDAD_URL || 'http://127.0.0.1:3001') + '/interno' + ruta, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${req.cookies.access}` },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
  } catch { throw new ErrorServicio('El servicio de identidad no está disponible', 502); }
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new ErrorServicio(data?.error || 'Error en el servicio de identidad', r.status);
  return data;
}

module.exports = ({ negocio }) => {
  const r = express.Router();
  r.use(requireAuth());
  const auditar = (req, accion, detalle) => negocio.run("INSERT INTO auditoria(usuario_id, accion, entidad, detalle) VALUES ($1,$2,'usuario',$3)", [req.user.id, accion, detalle]);
  const columnasVacias = datos => Object.entries(datos).map(([c, v]) => [c, v === '' ? null : v]);

  r.get('/usuarios', requirePermiso('usuarios.admin'), async (req, res) => {
    const [cuentas, perfiles] = await Promise.all([identidad(req, 'GET', '/cuentas'), negocio.all(`SELECT ${COLUMNAS} FROM perfil`)]);
    const p = new Map(perfiles.map(x => [x.cuenta_id, x]));
    res.json(cuentas.map(c => ({ ...perfil({ ...(p.get(c.id) || {}), id: c.id, email: c.email, rol: c.rol, nombre: p.get(c.id)?.nombre || '', apellidos: p.get(c.id)?.apellidos || '' }),
      activo: c.activo, debeCambiarClave: c.debe_cambiar_clave, ultimoAcceso: c.ultimo_acceso, creadaEn: c.creada_en })));
  });

  r.post('/usuarios', requirePermiso('usuarios.admin'), async (req, res) => {
    const b = req.body || {};
    const extra = Object.keys(b).filter(k => ![...CAMPOS_PERFIL, ...CAMPOS_CUENTA].includes(k));
    if (extra.length) return res.status(400).json({ error: `Campo no permitido: ${extra.join(', ')}` });
    const { error, datos } = validarPerfil(b, { creando: true });
    if (error) return res.status(400).json({ error });
    const c = await identidad(req, 'POST', '/cuentas', { email: b.email, rol: b.rol });
    try {
      const cols = ['cuenta_id', ...Object.keys(datos)], vals = [c.id, ...columnasVacias(datos).map(x => x[1])];
      await negocio.run(`INSERT INTO perfil(${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, vals);   // columnas de la lista fija
    } catch (e) {                                   // si falla el perfil no dejamos una cuenta huérfana con acceso
      await identidad(req, 'PATCH', `/cuentas/${c.id}`, { activo: false }).catch(() => {});
      throw e;
    }
    await auditar(req, 'usuario_creado', `${c.email} (${c.rol})`);
    res.status(201).json({ id: c.id, email: c.email, rol: c.rol, claveTemporal: c.claveTemporal });
  });

  r.patch('/usuarios/:id', requirePermiso('usuarios.admin'), async (req, res) => {
    const b = req.body || {};
    const extra = Object.keys(b).filter(k => ![...CAMPOS_PERFIL, ...CAMPOS_CUENTA].includes(k));
    if (extra.length) return res.status(400).json({ error: `Campo no permitido: ${extra.join(', ')}` });
    const { error, datos } = validarPerfil(b);
    if (error) return res.status(400).json({ error });
    if (!Object.keys(datos).length && !CAMPOS_CUENTA.some(k => k in b)) return res.status(400).json({ error: 'No hay cambios para guardar' });
    const cuenta = {}; for (const k of CAMPOS_CUENTA) if (k in b) cuenta[k] = b[k];
    if (Object.keys(cuenta).length) await identidad(req, 'PATCH', `/cuentas/${req.params.id}`, cuenta);   // si identidad rechaza, el perfil no se toca
    if (Object.keys(datos).length) {
      const pares = columnasVacias(datos);
      const vals = [...pares.map(x => x[1]), req.params.id];
      await negocio.run(`UPDATE perfil SET ${pares.map(([c], i) => `${c} = $${i + 1}`).join(', ')} WHERE cuenta_id = $${vals.length}`, vals);
    }
    await auditar(req, 'usuario_modificado', `${req.params.id}: ${Object.keys(b).join(', ')}`);
    res.json({ ok: true });
  });

  r.post('/usuarios/:id/reset-clave', requirePermiso('usuarios.admin'), async (req, res) => {
    const out = await identidad(req, 'POST', `/cuentas/${req.params.id}/reset-clave`);
    await auditar(req, 'clave_restablecida', req.params.id);
    res.json(out);
  });

  r.get('/permisos', requirePermiso('usuarios.admin', 'permisos.admin'), async (req, res) => res.json(await identidad(req, 'GET', '/permisos')));
  r.put('/permisos', requirePermiso('permisos.admin'), async (req, res) => {
    const out = await identidad(req, 'PUT', '/permisos', req.body);
    await auditar(req, 'permisos_modificados', JSON.stringify(req.body));
    res.json(out);
  });
  return r;
};
