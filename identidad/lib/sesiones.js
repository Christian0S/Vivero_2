// Sesiones: token de acceso corto (10 min) + token de renovación largo y ROTATIVO (7 días, tope de 30).
const crypto = require('crypto');
const { firmarAcceso, TTL_SEG } = require('./tokens');

const REFRESH_DIAS = 7, FAMILIA_MAX_DIAS = 30, GRACIA_SEG = 10;
const huella = t => crypto.createHash('sha256').update(t).digest('hex');
const nuevoToken = () => crypto.randomBytes(32).toString('base64url');   // 256 bits aleatorios
const seguro = () => process.env.NODE_ENV === 'production';

function ponerCookies(res, access, refresh) {
  // access: viaja a toda la app. refresh: SOLO a /api/auth y con SameSite estricto
  res.cookie('access', access, { httpOnly: true, sameSite: 'lax', secure: seguro(), path: '/', maxAge: TTL_SEG() * 1000 });
  res.cookie('refresh', refresh, { httpOnly: true, sameSite: 'strict', secure: seguro(), path: '/api/auth', maxAge: REFRESH_DIAS * 864e5 });
}
function quitarCookies(res) { res.clearCookie('access', { path: '/' }); res.clearCookie('refresh', { path: '/api/auth' }); }

// El administrador siempre tiene TODOS los permisos (también los que se creen en el futuro)
async function permisosDe(db, rol) {
  const filas = rol === 'administrador'
    ? await db.all('SELECT codigo AS permiso FROM permiso ORDER BY 1')
    : await db.all('SELECT permiso FROM rol_permiso WHERE rol = $1 ORDER BY 1', [rol]);
  return filas.map(f => f.permiso);
}
async function emitirAcceso(db, u) {
  return firmarAcceso({ id: u.id, email: u.email, rol: u.rol, permisos: await permisosDe(db, u.rol), debeCambiarClave: u.debe_cambiar_clave });
}
async function iniciarFamilia(db, cuentaId, req) {
  const token = nuevoToken();
  await db.run(`INSERT INTO sesion(cuenta_id, familia, refresh_huella, familia_inicio, expira_en, ip, agente)
    VALUES ($1, $2, $3, now(), now() + ($4 || ' days')::interval, $5, $6)`,
    [cuentaId, crypto.randomUUID(), huella(token), REFRESH_DIAS, req.ip, String(req.get('user-agent') || '').slice(0, 200)]);
  return token;
}
const revocarCuenta = (db, cuentaId) => db.run('UPDATE sesion SET revocada = true WHERE cuenta_id = $1 AND NOT revocada', [cuentaId]);

module.exports = { huella, nuevoToken, ponerCookies, quitarCookies, permisosDe, emitirAcceso, iniciarFamilia, revocarCuenta, REFRESH_DIAS, FAMILIA_MAX_DIAS, GRACIA_SEG };
