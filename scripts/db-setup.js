// Crea (o con --reset, recrea) las dos bases y sus usuarios de aplicación.   Uso: npm run db:setup
const { Client } = require('pg');
const cfg = require('../src/config');
cfg.exigir(['PG_ADMIN_PASSWORD', 'IDENTIDAD_DB', 'IDENTIDAD_USER', 'IDENTIDAD_PASSWORD', 'NEGOCIO_DB', 'NEGOCIO_USER', 'NEGOCIO_PASSWORD']);
const reset = process.argv.includes('--reset');
if (reset && process.env.NODE_ENV === 'production') { console.error('db:reset está bloqueado en producción.'); process.exit(1); }

(async () => {
  const admin = new Client({ ...cfg.pg, user: cfg.admin.user, password: cfg.admin.password, database: 'postgres' });
  try { await admin.connect(); }
  catch (e) { console.error(`No se pudo conectar a PostgreSQL (${cfg.pg.host}:${cfg.pg.port}): ${e.message}\n¿Está Docker abierto y corriste npm run db:up?`); process.exit(1); }

  for (const b of [cfg.identidad, cfg.negocio]) {
    const rol = admin.escapeIdentifier(b.user), db = admin.escapeIdentifier(b.database), pw = admin.escapeLiteral(b.password);
    const hayRol = (await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [b.user])).rowCount;
    // El usuario de la app: puede entrar y usar datos, nada más (sin superusuario, sin crear bases ni roles)
    await admin.query(`${hayRol ? 'ALTER' : 'CREATE'} ROLE ${rol} LOGIN PASSWORD ${pw} NOSUPERUSER NOCREATEDB NOCREATEROLE`);
    if (reset) await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
    if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [b.database])).rowCount) await admin.query(`CREATE DATABASE ${db}`);
    await admin.query(`REVOKE ALL ON DATABASE ${db} FROM PUBLIC`);           // nadie entra por defecto...
    await admin.query(`GRANT CONNECT ON DATABASE ${db} TO ${rol}`);          // ...solo el usuario de esa base
    console.log(`Base ${b.database}: lista (usuario ${b.user})`);
  }
  await admin.end();
})().catch(e => { console.error(e.message); process.exit(1); });
