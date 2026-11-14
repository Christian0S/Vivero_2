// Administración de usuarios y permisos. Coordina las dos bases SIN mezclarlas:
// la cuenta (correo, rol, contraseña) vive en identidad; el perfil (nombre) vive en el negocio.
const express = require('express');
const { requireAuth, requirePermiso } = require('../../compartido/auth');
const { perfil } = require('../nombres');

class ErrorServicio extends Error { constructor(msg, status) { super(msg); this.status = status; this.servicio = true; } }
const texto = (v, max) => (typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= max ? v.trim() : null);

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

  r.get('/usuarios', requirePermiso('usuarios.admin'), async (req, res) => {
    const [cuentas, perfiles] = await Promise.all([identidad(req, 'GET', '/cuentas'), negocio.all('SELECT cuenta_id, nombre, apellidos, foto_id FROM perfil')]);
    const p = new Map(perfiles.map(x => [x.cuenta_id, x]));
    res.json(cuentas.map(c => ({ ...c, ...perfil({ id: c.id, email: c.email, rol: c.rol, nombre: p.get(c.id)?.nombre || '', apellidos: p.get(c.id)?.apellidos || '', fotoId: p.get(c.id)?.foto_id }),
      activo: c.activo, debeCambiarClave: c.debe_cambiar_clave, ultimoAcceso: c.ultimo_acceso })));
  });

  r.post('/usuarios', requirePermiso('usuarios.admin'), async (req, res) => {
    const nombre = texto(req.body?.nombre, 80), apellidos = texto(req.body?.apellidos, 80);
    if (!nombre || !apellidos) return res.status(400).json({ error: 'Nombre y apellido son obligatorios' });
    const c = await identidad(req, 'POST', '/cuentas', { email: req.body?.email, rol: req.body?.rol });
    try { await negocio.run('INSERT INTO perfil(cuenta_id, nombre, apellidos) VALUES ($1,$2,$3)', [c.id, nombre, apellidos]); }
    catch (e) {                                   // si falla el perfil no dejamos una cuenta huérfana con acceso
      await identidad(req, 'PATCH', `/cuentas/${c.id}`, { activo: false }).catch(() => {});
      throw e;
    }
    await auditar(req, 'usuario_creado', `${c.email} (${c.rol})`);
    res.status(201).json({ id: c.id, email: c.email, rol: c.rol, claveTemporal: c.claveTemporal });
  });

  r.patch('/usuarios/:id', requirePermiso('usuarios.admin'), async (req, res) => {
    const { rol, activo } = req.body || {};
    const nombre = req.body?.nombre === undefined ? undefined : texto(req.body.nombre, 80);
    const apellidos = req.body?.apellidos === undefined ? undefined : texto(req.body.apellidos, 80);
    if (nombre === null || apellidos === null) return res.status(400).json({ error: 'Nombre y apellido no pueden estar vacíos' });
    if (rol !== undefined || activo !== undefined) await identidad(req, 'PATCH', `/cuentas/${req.params.id}`, { rol, activo });
    if (nombre !== undefined || apellidos !== undefined)
      await negocio.run('UPDATE perfil SET nombre = COALESCE($1, nombre), apellidos = COALESCE($2, apellidos) WHERE cuenta_id = $3', [nombre ?? null, apellidos ?? null, req.params.id]);
    await auditar(req, 'usuario_modificado', `${req.params.id}: ${JSON.stringify({ rol, activo, nombre, apellidos })}`);
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
