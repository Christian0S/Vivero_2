// Crea o completa .env SIN tocar lo que ya tienes y sin imprimir secretos.   Uso: npm run setup:env
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const FILE = path.join(__dirname, '..', '.env');
const lineas = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8').split(/\r?\n/) : [];
const parse = l => { const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l); return m && { k: m[1], v: m[2].trim() }; };
const llenas = new Set(lineas.map(parse).filter(x => x && x.v !== '').map(x => x.k));

const clave = () => crypto.randomBytes(24).toString('base64url');
const DEF = [
  ['PORT', '3000'], ['JWT_SECRET', () => crypto.randomBytes(48).toString('hex')],
  ['PG_HOST', '127.0.0.1'], ['PG_PORT', '5432'], ['PG_ADMIN_USER', 'postgres'], ['PG_ADMIN_PASSWORD', clave],
  ['IDENTIDAD_DB', 'srm_identidad'], ['IDENTIDAD_USER', 'srm_identidad_app'], ['IDENTIDAD_PASSWORD', clave],
  ['NEGOCIO_DB', 'srm_negocio'], ['NEGOCIO_USER', 'srm_negocio_app'], ['NEGOCIO_PASSWORD', clave],
];
const nuevas = DEF.filter(([k]) => !llenas.has(k));
if (!nuevas.length) { console.log('.env ya está completo. No se cambió nada.'); }
else {
  const claves = new Set(nuevas.map(([k]) => k));
  const base = lineas.filter(l => { const p = parse(l); return !(p && claves.has(p.k)); }); // quita líneas vacías que vamos a reponer
  while (base.length && base[base.length - 1].trim() === '') base.pop();
  const agregado = nuevas.map(([k, v]) => `${k}=${typeof v === 'function' ? v() : v}`);
  fs.writeFileSync(FILE, [...base, ...agregado, ''].join('\n'));
  console.log('.env actualizado. Variables agregadas:', nuevas.map(([k]) => k).join(', '));
}
