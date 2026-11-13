// SERVICIO DE IDENTIDAD: login, sesiones, roles y permisos. Es el único que ve contraseñas y la llave privada.
const express = require('express');
const cookieParser = require('cookie-parser');
const cfg = require('../src/config');
cfg.exigir(['IDENTIDAD_DB', 'IDENTIDAD_USER', 'IDENTIDAD_PASSWORD']);
const db = require('./db');
const { iniciarVerificador } = require('../compartido/jwt');
const { iniciarFirmador } = require('./lib/tokens');
const { verificarOrigen } = require('../compartido/auth');

(async () => {
  await iniciarVerificador(); await iniciarFirmador();
  try { await db.get('SELECT 1'); }
  catch (e) { console.error(`Identidad: no se pudo conectar a PostgreSQL: ${e.message}\n¿Docker está abierto y corriste npm run db:up y npm run db:reset?`); process.exit(1); }

  const appPort = process.env.APP_PORT || 3000;
  const origenes = (process.env.APP_ORIGENES || `http://localhost:${appPort},http://127.0.0.1:${appPort}`).split(',');

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');           // el IP real llega en X-Forwarded-For desde el proxy local
  app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }); next(); });
  app.use(express.json({ limit: '20kb' }));
  app.use(cookieParser());
  app.use(verificarOrigen(origenes));

  app.use('/api/auth', require('./routes/auth'));
  app.use('/interno', require('./routes/interno'));
  app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Solicitud inválida' });
    console.error(err); res.status(500).json({ error: 'Error interno del servidor' });
  });

  const port = process.env.PORT || 3001, host = process.env.HOST || '127.0.0.1';   // solo accesible desde este equipo
  const server = app.listen(port, host, () => console.log(`Identidad lista en http://${host}:${port}`));
  const apagar = () => server.close(() => db.cerrar().finally(() => process.exit(0)));
  process.on('SIGINT', apagar); process.on('SIGTERM', apagar);
})();
