// Dos bases, dos usuarios de PostgreSQL: cada uno solo puede entrar a la suya y solo con permisos de datos (sin DDL).
const { Pool, types } = require('pg');
const cfg = require('./config');

types.setTypeParser(1082, v => v);        // date -> texto "2026-11-11" (evita corrimientos de zona horaria)
types.setTypeParser(20, v => Number(v));  // bigint (COUNT) -> número
types.setTypeParser(1700, v => parseFloat(v)); // numeric (promedios) -> número

const envolver = pool => ({
  pool,
  all: async (sql, params = []) => (await pool.query(sql, params)).rows,
  get: async (sql, params = []) => (await pool.query(sql, params)).rows[0],
  run: (sql, params = []) => pool.query(sql, params),
});
const crear = c => new Pool({ host: cfg.pg.host, port: cfg.pg.port, database: c.database, user: c.user, password: c.password,
  max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });

const identidad = envolver(crear(cfg.identidad));
const negocio = envolver(crear(cfg.negocio));
const cerrar = () => Promise.all([identidad.pool.end(), negocio.pool.end()]);

module.exports = { identidad, negocio, cerrar };
