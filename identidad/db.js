// El servicio de identidad SOLO conoce la base de identidad.
const { Pool, types } = require('pg');
types.setTypeParser(20, v => Number(v));       // bigint -> número

const pool = new Pool({
  host: process.env.PG_HOST || '127.0.0.1', port: Number(process.env.PG_PORT || 5432),
  database: process.env.IDENTIDAD_DB, user: process.env.IDENTIDAD_USER, password: process.env.IDENTIDAD_PASSWORD,
  max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000,
});
const sobre = q => ({
  all: async (sql, p = []) => (await q.query(sql, p)).rows,
  get: async (sql, p = []) => (await q.query(sql, p)).rows[0],
  run: (sql, p = []) => q.query(sql, p),
});
const db = {
  ...sobre(pool),
  // Transacción: todo o nada
  async tx(fn) {
    const c = await pool.connect();
    try { await c.query('BEGIN'); const r = await fn(sobre(c)); await c.query('COMMIT'); return r; }
    catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
    finally { c.release(); }
  },
  cerrar: () => pool.end(),
};
module.exports = db;
