// La API del negocio SOLO conoce la base del negocio: no tiene credenciales de la base de identidad.
const { Pool, types } = require('pg');
const cfg = require('./config');

types.setTypeParser(1082, v => v);        // date -> texto "2026-11-11" (evita corrimientos de zona horaria)
types.setTypeParser(20, v => Number(v));  // bigint (COUNT) -> número
types.setTypeParser(1700, v => parseFloat(v)); // numeric (promedios) -> número

const pool = new Pool({ host: cfg.pg.host, port: cfg.pg.port, database: cfg.negocio.database, user: cfg.negocio.user, password: cfg.negocio.password,
  max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
const negocio = {
  pool,
  all: async (sql, params = []) => (await pool.query(sql, params)).rows,
  get: async (sql, params = []) => (await pool.query(sql, params)).rows[0],
  run: (sql, params = []) => pool.query(sql, params),
};
module.exports = { negocio, cerrar: () => pool.end() };
