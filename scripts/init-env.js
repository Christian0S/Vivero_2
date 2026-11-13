// Crea o completa .env y las llaves de firma SIN tocar lo que ya tienes y sin imprimir secretos.   Uso: npm run setup:env
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const FILE = path.join(__dirname, '..', '.env');
const lineas = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8').split(/\r?\n/) : [];
const parse = l => { const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l); return m && { k: m[1], v: m[2].trim() }; };
const llenas = new Set(lineas.map(parse).filter(x => x && x.v !== '').map(x => x.k));

const clave = () => crypto.randomBytes(24).toString('base64url');
const DEF = [
  ['PORT', '3000'], ['IDENTIDAD_PORT', '3001'], ['IDENTIDAD_URL', 'http://127.0.0.1:3001'],
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

// Llaves de firma de tokens (Ed25519): la privada solo la usa el servicio de identidad; la pública la usan los dos
const KEYS = path.join(__dirname, '..', 'keys');
const PRIV = path.join(KEYS, 'jwt-private.pem'), PUB = path.join(KEYS, 'jwt-public.pem');
if (fs.existsSync(PRIV) && fs.existsSync(PUB)) console.log('Llaves de firma: ya existen en keys/. No se cambiaron.');
else {
  fs.mkdirSync(KEYS, { recursive: true });
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(PRIV, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  fs.writeFileSync(PUB, publicKey.export({ type: 'spki', format: 'pem' }));
  console.log('Llaves de firma creadas en keys/ (jwt-private.pem NO se comparte ni se sube a Git).');
}
