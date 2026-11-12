const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const cfg = require('./config');

cfg.exigir(['JWT_SECRET', 'IDENTIDAD_DB', 'IDENTIDAD_USER', 'IDENTIDAD_PASSWORD', 'NEGOCIO_DB', 'NEGOCIO_USER', 'NEGOCIO_PASSWORD']);
if (process.env.JWT_SECRET.length < 32) { console.error('JWT_SECRET debe tener al menos 32 caracteres. Corre: npm run setup:env'); process.exit(1); }
const db = require('./db');

(async () => {
  try { await Promise.all([db.identidad.get('SELECT 1'), db.negocio.get('SELECT 1')]); }
  catch (e) {
    console.error(`No se pudo conectar a PostgreSQL (${cfg.pg.host}:${cfg.pg.port}): ${e.message}`);
    console.error('¿Docker está abierto y corriste npm run db:up y npm run db:reset?');
    process.exit(1);
  }

  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'",
    });
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api/auth', require('./routes/auth')(db));
  app.use('/api/catalogo', require('./routes/catalogo')(db));   // público
  app.use('/api/proveedores', require('./routes/proveedores')(db));
  app.use('/api/productos', require('./routes/productos')(db));
  app.use('/api/dashboard', require('./routes/dashboard')(db));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

  const pub = path.join(__dirname, '..', 'public');
  // En desarrollo (y para el logo siempre) el navegador revalida con ETag: si cambias una imagen, se ve al recargar.
  // En producción las demás imágenes se guardan 7 días.
  const DEV = process.env.NODE_ENV !== 'production';
  app.use('/img', express.static(path.join(pub, 'img'), {
    setHeaders: (res, file) => res.set('Cache-Control', DEV || /logo/i.test(file) ? 'no-cache' : 'public, max-age=0'),
  }));
  app.use(express.static(pub));   // css/js/html se revalidan en cada carga (útil en desarrollo)

  // Errores: nunca se filtran detalles internos al cliente
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Solicitud inválida' });
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  });

  const port = process.env.PORT || 3000;
  const server = app.listen(port, () => console.log(`API lista en http://localhost:${port}`));
  const apagar = () => server.close(() => db.cerrar().finally(() => process.exit(0)));
  process.on('SIGINT', apagar); process.on('SIGTERM', apagar);
})();
