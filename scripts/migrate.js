// Aplica las migraciones pendientes de cada base, en orden, y ajusta permisos.   Uso: npm run db:migrate
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { Client } = require('pg');
const cfg = require('../src/config');
cfg.exigir(['PG_ADMIN_PASSWORD', 'IDENTIDAD_DB', 'IDENTIDAD_USER', 'NEGOCIO_DB', 'NEGOCIO_USER']);

const BASES = [
  { nombre: 'identidad', c: cfg.identidad, dir: 'migrations/identidad', soloInsercion: ['evento_seguridad'] },
  { nombre: 'negocio', c: cfg.negocio, dir: 'migrations/negocio', soloInsercion: ['auditoria'] },
];
const normalizar = s => s.replace(/\r\n/g, '\n');   // que Windows (CRLF) no cambie la huella
const huella = s => crypto.createHash('sha256').update(normalizar(s)).digest('hex');

(async () => {
  for (const b of BASES) {
    const cl = new Client({ ...cfg.pg, user: cfg.admin.user, password: cfg.admin.password, database: b.c.database });
    try { await cl.connect(); }
    catch (e) { console.error(`No se pudo conectar a ${b.c.database}: ${e.message}\n¿Corriste npm run db:setup?`); process.exit(1); }

    await cl.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      nombre text PRIMARY KEY, huella text NOT NULL, aplicada_en timestamptz NOT NULL DEFAULT now())`);
    const hechas = new Map((await cl.query('SELECT nombre, huella FROM schema_migrations')).rows.map(r => [r.nombre, r.huella]));
    const dir = path.join(__dirname, '..', b.dir);
    let nuevas = 0;
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.sql')).sort()) {
      const sql = fs.readFileSync(path.join(dir, f), 'utf8'), h = huella(sql);
      if (hechas.has(f)) {
        if (hechas.get(f) !== h) throw new Error(`La migración ${f} ya estaba aplicada y fue modificada. Crea una migración nueva en lugar de editarla.`);
        continue;
      }
      await cl.query('BEGIN');
      try { await cl.query(normalizar(sql)); await cl.query('INSERT INTO schema_migrations(nombre, huella) VALUES ($1, $2)', [f, h]); await cl.query('COMMIT'); }
      catch (e) { await cl.query('ROLLBACK'); throw new Error(`Falló ${b.nombre}/${f}: ${e.message}`); }
      nuevas++; console.log(`  aplicada ${b.nombre}/${f}`);
    }

    // Permisos del usuario de la app: leer y escribir datos, sin tocar la estructura
    const rol = cl.escapeIdentifier(b.c.user);
    await cl.query(`REVOKE ALL ON SCHEMA public FROM PUBLIC`);
    await cl.query(`GRANT USAGE ON SCHEMA public TO ${rol}`);
    await cl.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${rol}`);
    await cl.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${rol}`);
    await cl.query(`REVOKE ALL ON TABLE schema_migrations FROM ${rol}`);
    for (const t of b.soloInsercion) await cl.query(`REVOKE UPDATE, DELETE, TRUNCATE ON TABLE ${cl.escapeIdentifier(t)} FROM ${rol}`); // registros inalterables
    await cl.end();
    console.log(`Base ${b.nombre}: ${nuevas ? nuevas + ' migración(es) nueva(s)' : 'al día'}; permisos ajustados`);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
