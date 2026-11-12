const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { openDb } = require('./db');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('Falta JWT_SECRET (mínimo 32 caracteres). Copia .env.example a .env y complétalo.');
  process.exit(1);
}

(async () => {
  const db = await openDb();
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
  app.use('/img', express.static(path.join(pub, 'img'), { maxAge: '7d' }));
  app.use(express.static(pub));   // css/js/html se revalidan en cada carga (útil en desarrollo)

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`API lista en http://localhost:${port}`));
})();
