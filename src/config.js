// Lee la configuración desde variables de entorno (.env). Nada de secretos en el código.
const exigir = claves => {
  const faltan = claves.filter(k => !process.env[k]);
  if (faltan.length) {
    console.error(`Faltan variables en .env: ${faltan.join(', ')}\nCorre: npm run setup:env`);
    process.exit(1);
  }
};
const base = p => ({ database: process.env[p + '_DB'], user: process.env[p + '_USER'], password: process.env[p + '_PASSWORD'] });

module.exports = {
  exigir,
  pg: { host: process.env.PG_HOST || '127.0.0.1', port: Number(process.env.PG_PORT || 5432) },
  identidad: base('IDENTIDAD'),
  negocio: base('NEGOCIO'),
  // Solo para scripts de base de datos (setup, migraciones, seed). El servidor NUNCA usa este usuario.
  admin: { user: process.env.PG_ADMIN_USER || 'postgres', password: process.env.PG_ADMIN_PASSWORD },
};
