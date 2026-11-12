const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { requireAuth } = require('../middleware/auth');
const { perfil } = require('../nombres');

const DUMMY = bcrypt.hashSync('relleno-contra-timing', 10); // evita revelar si el correo existe
const intentos = new Map();                                  // límite simple: 5 intentos / 15 min (3B lo mueve a la base)
const MAX = 5, VENTANA = 15 * 60 * 1000;

module.exports = ({ identidad, negocio }) => {
  const r = express.Router();
  const evento = (cuentaId, email, tipo, req) => identidad.run(
    'INSERT INTO evento_seguridad(cuenta_id, email_intentado, tipo, ip, agente) VALUES ($1,$2,$3,$4,$5)',
    [cuentaId, email, tipo, req.ip, String(req.get('user-agent') || '').slice(0, 200)]).catch(e => console.error('evento_seguridad:', e.message));

  r.post('/login', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Correo y contraseña son obligatorios' });

    const key = `${req.ip}|${email}`, now = Date.now();
    const reg = intentos.get(key);
    if (reg && reg.hasta > now && reg.n >= MAX) {
      await evento(null, email, 'bloqueo', req);
      return res.status(429).json({ error: 'Demasiados intentos. Intenta en 15 minutos' });
    }

    const u = await identidad.get('SELECT id, email, password_hash, rol, activo FROM cuenta WHERE lower(email) = $1', [email]);
    const ok = bcrypt.compareSync(password, u ? u.password_hash : DUMMY) && u && u.activo;
    if (!ok) {
      const n = reg && reg.hasta > now ? reg.n + 1 : 1;
      intentos.set(key, { n, hasta: now + VENTANA });
      await evento(u?.id ?? null, email, 'login_fallido', req);
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }
    intentos.delete(key);

    const [p] = await Promise.all([
      negocio.get('SELECT nombre, apellidos FROM perfil WHERE cuenta_id = $1', [u.id]),
      identidad.run('UPDATE cuenta SET ultimo_acceso = now() WHERE id = $1', [u.id]),
      evento(u.id, email, 'login_ok', req),
    ]);
    const token = jwt.sign({ sub: u.id, rol: u.rol }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 8 * 3600 * 1000, secure: process.env.NODE_ENV === 'production' });
    res.json(perfil({ id: u.id, email: u.email, rol: u.rol, nombre: p?.nombre || '', apellidos: p?.apellidos || '' }));
  });

  r.post('/logout', (req, res) => { res.clearCookie('token'); res.json({ ok: true }); });

  r.get('/me', requireAuth, async (req, res) => {
    const u = await identidad.get('SELECT id, email, rol FROM cuenta WHERE id = $1 AND activo = true', [req.user.id]);
    if (!u) return res.status(401).json({ error: 'Usuario no disponible' });
    const p = await negocio.get('SELECT nombre, apellidos FROM perfil WHERE cuenta_id = $1', [u.id]);
    res.json(perfil({ ...u, nombre: p?.nombre || '', apellidos: p?.apellidos || '' }));
  });

  return r;
};
