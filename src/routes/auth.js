const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { requireAuth } = require('../middleware/auth');
const { perfil } = require('../nombres');

const DUMMY = bcrypt.hashSync('relleno-contra-timing', 10); // evita revelar si el correo existe
const intentos = new Map();                                  // límite simple: 5 intentos / 15 min
const MAX = 5, VENTANA = 15 * 60 * 1000;

module.exports = db => {
  const r = express.Router();

  r.post('/login', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Correo y contraseña son obligatorios' });

    const key = `${req.ip}|${email}`, now = Date.now();
    const reg = intentos.get(key);
    if (reg && reg.hasta > now && reg.n >= MAX) return res.status(429).json({ error: 'Demasiados intentos. Intenta en 15 minutos' });

    const u = db.get('SELECT id, nombre, apellidos, email, password_hash, rol, activo FROM usuario WHERE email = ?', email);
    const ok = bcrypt.compareSync(password, u ? u.password_hash : DUMMY) && u && u.activo;
    if (!ok) {
      const n = reg && reg.hasta > now ? reg.n + 1 : 1;
      intentos.set(key, { n, hasta: now + VENTANA });
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }
    intentos.delete(key);

    const token = jwt.sign({ sub: u.id, rol: u.rol }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.cookie('token', token, {
      httpOnly: true, sameSite: 'lax', maxAge: 8 * 3600 * 1000,
      secure: process.env.NODE_ENV === 'production',
    });
    res.json(perfil(u));
  });

  r.post('/logout', (req, res) => { res.clearCookie('token'); res.json({ ok: true }); });

  r.get('/me', requireAuth, (req, res) => {
    const u = db.get('SELECT id, nombre, apellidos, email, rol FROM usuario WHERE id = ? AND activo = 1', req.user.id);
    u ? res.json(perfil(u)) : res.status(401).json({ error: 'Usuario no disponible' });
  });

  return r;
};
