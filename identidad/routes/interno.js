// Rutas INTERNAS: solo las llama la API del negocio reenviando el token del administrador.
// Aquí se vuelve a verificar el token y el permiso (defensa en profundidad).
const express = require('express');
const db = require('../db');
const { hash, claveTemporal } = require('../lib/password');
const S = require('../lib/sesiones');
const { evento } = require('../lib/eventos');
const { requireAuth, requirePermiso } = require('../../compartido/auth');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const r = express.Router();
r.use(requireAuth({ bearer: true }));

r.get('/cuentas', requirePermiso('usuarios.admin'), async (req, res) =>
  res.json(await db.all('SELECT id, email, rol, activo, debe_cambiar_clave, ultimo_acceso, creada_en FROM cuenta ORDER BY lower(email)')));

r.post('/cuentas', requirePermiso('usuarios.admin'), async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase(), rol = String(req.body?.rol || '');
  if (!EMAIL.test(email) || email.length > 120) return res.status(400).json({ error: 'El correo no es válido' });
  if (!(await db.get('SELECT 1 FROM rol WHERE nombre = $1', [rol]))) return res.status(400).json({ error: 'El rol no existe' });
  const clave = claveTemporal();
  try {
    const c = await db.get('INSERT INTO cuenta(email, password_hash, rol, debe_cambiar_clave) VALUES ($1,$2,$3,true) RETURNING id', [email, await hash(clave), rol]);
    await evento(db, req, { cuentaId: c.id, email, tipo: 'cuenta_creada', actorId: req.user.id, detalle: `rol ${rol}` });
    res.status(201).json({ id: c.id, email, rol, claveTemporal: clave });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
    throw e;
  }
});

r.patch('/cuentas/:id', requirePermiso('usuarios.admin'), async (req, res) => {
  const { id } = req.params;
  if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador inválido' });
  const actual = await db.get('SELECT id, rol, activo FROM cuenta WHERE id = $1', [id]);
  if (!actual) return res.status(404).json({ error: 'La cuenta no existe' });
  const rol = req.body?.rol ?? actual.rol, activo = req.body?.activo ?? actual.activo;
  if (typeof activo !== 'boolean') return res.status(400).json({ error: 'Estado inválido' });
  if (id === req.user.id && (rol !== actual.rol || activo === false)) return res.status(400).json({ error: 'No puedes cambiar tu propio rol ni desactivar tu cuenta' });
  if (actual.rol === 'administrador' && actual.activo && (rol !== 'administrador' || !activo)) {
    const otros = await db.get("SELECT COUNT(*)::int n FROM cuenta WHERE rol = 'administrador' AND activo AND id <> $1", [id]);
    if (otros.n === 0) return res.status(400).json({ error: 'Debe quedar al menos un administrador activo' });
  }
  try { await db.run('UPDATE cuenta SET rol = $1, activo = $2 WHERE id = $3', [rol, activo, id]); }
  catch (e) { if (e.code === '23503') return res.status(400).json({ error: 'El rol no existe' }); throw e; }
  if (rol !== actual.rol || activo !== actual.activo) await S.revocarCuenta(db, id);   // los permisos nuevos rigen desde el próximo login
  await evento(db, req, { cuentaId: id, tipo: 'cuenta_modificada', actorId: req.user.id, detalle: `rol ${actual.rol}→${rol}; activo ${actual.activo}→${activo}` });
  res.json({ id, rol, activo });
});

r.post('/cuentas/:id/reset-clave', requirePermiso('usuarios.admin'), async (req, res) => {
  const { id } = req.params;
  if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador inválido' });
  const clave = claveTemporal();
  const u = await db.get('UPDATE cuenta SET password_hash = $1, debe_cambiar_clave = true WHERE id = $2 RETURNING id', [await hash(clave), id]);
  if (!u) return res.status(404).json({ error: 'La cuenta no existe' });
  await S.revocarCuenta(db, id);
  await evento(db, req, { cuentaId: id, tipo: 'clave_restablecida', actorId: req.user.id });
  res.json({ claveTemporal: clave });
});

// Matriz de permisos: quién puede ver (usuarios.admin o permisos.admin) y quién puede cambiar (permisos.admin)
r.get('/permisos', requirePermiso('usuarios.admin', 'permisos.admin'), async (req, res) => {
  const [roles, permisos, asignados] = await Promise.all([
    db.all('SELECT nombre, descripcion FROM rol ORDER BY nombre'),
    db.all('SELECT codigo, descripcion FROM permiso ORDER BY codigo'),
    db.all('SELECT rol, permiso FROM rol_permiso'),
  ]);
  res.json({ roles, permisos, asignados });
});

r.put('/permisos', requirePermiso('permisos.admin'), async (req, res) => {
  const { rol, permiso, otorgado } = req.body || {};
  if (typeof otorgado !== 'boolean') return res.status(400).json({ error: 'Falta indicar si se otorga o se quita' });
  if (rol === 'administrador') return res.status(400).json({ error: 'El administrador siempre tiene todos los permisos' });
  if (!(await db.get('SELECT 1 FROM rol WHERE nombre = $1', [rol])) || !(await db.get('SELECT 1 FROM permiso WHERE codigo = $1', [permiso])))
    return res.status(400).json({ error: 'Rol o permiso inexistente' });
  if (otorgado) await db.run('INSERT INTO rol_permiso(rol, permiso) VALUES ($1,$2) ON CONFLICT DO NOTHING', [rol, permiso]);
  else await db.run('DELETE FROM rol_permiso WHERE rol = $1 AND permiso = $2', [rol, permiso]);
  await evento(db, req, { tipo: 'permisos_modificados', actorId: req.user.id, detalle: `${otorgado ? 'otorgó' : 'quitó'} ${permiso} a ${rol}` });
  res.json({ rol, permiso, otorgado });   // rige para quienes inicien sesión o renueven desde ahora (máx. 10 min)
});

module.exports = r;
