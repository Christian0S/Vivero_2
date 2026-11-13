// Rutas públicas de autenticación (el proxy del negocio las expone en /api/auth/*)
const express = require('express');
const db = require('../db');
const { hash, verificar, validarNueva } = require('../lib/password');
const S = require('../lib/sesiones');
const { evento } = require('../lib/eventos');
const { requireAuth } = require('../../compartido/auth');

const DUMMY = hash('relleno-contra-ataques-de-tiempo');   // se verifica aunque el correo no exista: mismo tiempo de respuesta
const r = express.Router();

// Límite de intentos en la BASE DE DATOS: sobrevive a reinicios. 5 fallos por correo / 50 por IP cada 15 minutos.
async function bloqueado(email, ip) {
  const porCorreo = await db.get(`SELECT COUNT(*)::int n FROM evento_seguridad e
    WHERE e.tipo = 'login_fallido' AND lower(e.email_intentado) = $1 AND e.creado_en > now() - interval '15 minutes'
      AND e.creado_en > COALESCE((SELECT max(x.creado_en) FROM evento_seguridad x WHERE x.tipo = 'login_ok' AND lower(x.email_intentado) = $1), '-infinity'::timestamptz)`, [email]);
  if (porCorreo.n >= 5) return true;
  return (await db.get(`SELECT COUNT(*)::int n FROM evento_seguridad WHERE tipo = 'login_fallido' AND ip = $1 AND creado_en > now() - interval '15 minutes'`, [ip])).n >= 50;
}

r.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password || password.length > 200) return res.status(400).json({ error: 'Correo y contraseña son obligatorios' });

  if (await bloqueado(email, req.ip)) {
    await evento(db, req, { email, tipo: 'bloqueo' });
    return res.status(429).json({ error: 'Demasiados intentos. Intenta en 15 minutos' });
  }
  const u = await db.get('SELECT id, email, password_hash, rol, activo, debe_cambiar_clave FROM cuenta WHERE lower(email) = $1', [email]);
  const ok = await verificar(password, u ? u.password_hash : await DUMMY);
  if (!u || !ok || !u.activo) {
    await evento(db, req, { cuentaId: u?.id ?? null, email, tipo: 'login_fallido' });
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  }
  const refresh = await S.iniciarFamilia(db, u.id, req);
  S.ponerCookies(res, await S.emitirAcceso(db, u), refresh);
  await db.run('UPDATE cuenta SET ultimo_acceso = now() WHERE id = $1', [u.id]);
  await evento(db, req, { cuentaId: u.id, email, tipo: 'login_ok' });
  res.json({ ok: true, debeCambiarClave: u.debe_cambiar_clave });
});

// Renovación rotativa: cada refresh vale UNA vez. Reutilizar uno viejo = robo probable -> se revoca toda la cadena.
r.post('/refresh', async (req, res) => {
  const token = req.cookies?.refresh;
  if (!token) return res.status(401).json({ error: 'Sin sesión', codigo: 'SIN_REFRESH' });
  const nuevo = S.nuevoToken();
  const out = await db.tx(async t => {
    const s = await t.get('SELECT * FROM sesion WHERE refresh_huella = $1 FOR UPDATE', [S.huella(token)]);
    if (!s || s.revocada) return { e: 'invalida' };
    if (s.rotada_en) {
      // Dos pestañas pueden renovar a la vez: dentro de una gracia corta no es un ataque, solo una carrera
      if (Date.now() - new Date(s.rotada_en).getTime() < S.GRACIA_SEG * 1000) return { e: 'gracia' };
      await t.run('UPDATE sesion SET revocada = true WHERE familia = $1', [s.familia]);
      return { e: 'reutilizado', cuentaId: s.cuenta_id };
    }
    const vencida = new Date(s.expira_en) < new Date() || Date.now() - new Date(s.familia_inicio).getTime() > S.FAMILIA_MAX_DIAS * 864e5;
    const u = await t.get('SELECT id, email, rol, activo, debe_cambiar_clave FROM cuenta WHERE id = $1', [s.cuenta_id]);
    if (vencida || !u || !u.activo) { await t.run('UPDATE sesion SET revocada = true WHERE familia = $1', [s.familia]); return { e: 'invalida' }; }
    await t.run('UPDATE sesion SET rotada_en = now() WHERE id = $1', [s.id]);
    await t.run(`INSERT INTO sesion(cuenta_id, familia, refresh_huella, familia_inicio, expira_en, ip, agente)
      VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval, $6, $7)`,
      [u.id, s.familia, S.huella(nuevo), s.familia_inicio, S.REFRESH_DIAS, req.ip, String(req.get('user-agent') || '').slice(0, 200)]);
    return { e: 'ok', u };
  });
  if (out.e === 'gracia') return res.status(409).json({ error: 'Renovación en curso, reintenta', codigo: 'REFRESH_EN_CURSO' });
  if (out.e === 'reutilizado') await evento(db, req, { cuentaId: out.cuentaId, tipo: 'refresh_reutilizado', detalle: 'Se reutilizó una renovación ya usada; se cerraron las sesiones de esa cadena' });
  if (out.e !== 'ok') { S.quitarCookies(res); return res.status(401).json({ error: 'Sesión vencida', codigo: 'REFRESH_INVALIDO' }); }
  S.ponerCookies(res, await S.emitirAcceso(db, out.u), nuevo);
  res.json({ ok: true });
});

r.post('/logout', async (req, res) => {
  const token = req.cookies?.refresh;
  if (token) {
    const s = await db.get('SELECT cuenta_id, familia FROM sesion WHERE refresh_huella = $1', [S.huella(token)]);
    if (s) { await db.run('UPDATE sesion SET revocada = true WHERE familia = $1', [s.familia]); await evento(db, req, { cuentaId: s.cuenta_id, tipo: 'logout' }); }
  }
  S.quitarCookies(res);
  res.json({ ok: true });
});

r.post('/cambiar-clave', requireAuth(), async (req, res) => {
  const actual = String(req.body?.actual || ''), nueva = String(req.body?.nueva || '');
  const u = await db.get('SELECT id, email, password_hash, rol, activo FROM cuenta WHERE id = $1', [req.user.id]);
  if (!u || !u.activo || !(await verificar(actual, u.password_hash))) return res.status(400).json({ error: 'La contraseña actual no es correcta' });
  const problema = validarNueva(nueva, u.email);
  if (problema) return res.status(400).json({ error: problema });
  if (nueva === actual) return res.status(400).json({ error: 'La nueva contraseña debe ser distinta de la actual' });
  await db.run('UPDATE cuenta SET password_hash = $1, debe_cambiar_clave = false WHERE id = $2', [await hash(nueva), u.id]);
  await S.revocarCuenta(db, u.id);                                // cierra todas las sesiones abiertas (otros dispositivos)
  const refresh = await S.iniciarFamilia(db, u.id, req);          // y abre una nueva para quien acaba de cambiarla
  S.ponerCookies(res, await S.emitirAcceso(db, { ...u, debe_cambiar_clave: false }), refresh);
  await evento(db, req, { cuentaId: u.id, email: u.email, tipo: 'clave_cambiada' });
  res.json({ ok: true });
});

module.exports = r;
