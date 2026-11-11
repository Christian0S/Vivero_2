const express = require('express');
const cookieParser = require('cookie-parser');
const { openDb } = require('./db');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('Falta JWT_SECRET (mínimo 32 caracteres). Copia .env.example a .env y complétalo.');
  process.exit(1);
}

(async () => {
  const db = await openDb();
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api/auth', require('./routes/auth')(db));
  app.use('/api/proveedores', require('./routes/proveedores')(db));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`API lista en http://localhost:${port}`));
})();
