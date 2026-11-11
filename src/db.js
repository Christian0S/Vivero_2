// Acceso a la BD (sql.js trabaja en memoria: cada escritura se guarda al archivo)
const fs = require('fs'), path = require('path');
const initSqlJs = require('sql.js');
const FILE = path.join(__dirname, '..', 'db', 'srm.db');

async function openDb() {
  const SQL = await initSqlJs();
  const raw = new SQL.Database(fs.readFileSync(FILE));
  raw.run('PRAGMA foreign_keys = ON');
  const persist = () => {
    fs.writeFileSync(FILE, Buffer.from(raw.export()));
    raw.run('PRAGMA foreign_keys = ON'); // export() reinicia los pragmas
  };
  const all = (q, ...p) => { const st = raw.prepare(q); st.bind(p); const rows = []; while (st.step()) rows.push(st.getAsObject()); st.free(); return rows; };
  return {
    all,
    get: (q, ...p) => all(q, ...p)[0],
    run: (q, ...p) => {
      raw.run(q, p);
      const id = raw.exec('SELECT last_insert_rowid()')[0].values[0][0];
      persist();
      return { lastInsertRowid: id };
    },
  };
}
module.exports = { openDb };
