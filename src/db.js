// La API del negocio SOLO conoce la base del negocio: no tiene credenciales de la base de identidad.
const { Pool, types } = require('pg');
const cfg = require('./config');

types.setTypeParser(1082, v => v);        // date -> texto "2026-11-11" (evita corrimientos de zona horaria)
types.setTypeParser(20, v => Number(v));  // bigint (COUNT) -> número
types.setTypeParser(1700, v => parseFloat(v)); // numeric (promedios) -> número

const pool = new Pool({ host: cfg.pg.host, port: cfg.pg.port, database: cfg.negocio.database, user: cfg.negocio.user, password: cfg.negocio.password,
  max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
const sobre = q => ({
  all: async (sql, params = []) => (await q.query(sql, params)).rows,
  get: async (sql, params = []) => (await q.query(sql, params)).rows[0],
  run: (sql, params = []) => q.query(sql, params),
});
const negocio = {
  pool, ...sobre(pool),
  // Transacción: todo o nada
  async tx(fn) {
    const c = await pool.connect();
    try { await c.query('BEGIN'); const r = await fn(sobre(c)); await c.query('COMMIT'); return r; }
    catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
    finally { c.release(); }
  },
};
module.exports = { negocio, cerrar: () => pool.end() };
