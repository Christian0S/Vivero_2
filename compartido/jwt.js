// Verificación de tokens de acceso. Solo necesita la llave PÚBLICA: puede verificar, jamás fabricar.
const fs = require('fs'), path = require('path');
const ISSUER = 'srm-identidad', AUDIENCE = 'srm-vivero';
const RAIZ = path.join(__dirname, '..');
let jose, publica;

const ruta = (v, def) => path.resolve(RAIZ, v || def);

async function iniciarVerificador() {
  jose = await import('jose');
  const f = ruta(process.env.JWT_PUBLIC_KEY_FILE, 'keys/jwt-public.pem');
  if (!fs.existsSync(f)) { console.error(`No se encuentra la llave pública (${f}). Corre: npm run setup:env`); process.exit(1); }
  publica = await jose.importSPKI(fs.readFileSync(f, 'utf8'), 'EdDSA');
}

// Solo EdDSA: rechaza "none", HS256 y cualquier otro algoritmo (evita ataques de confusión de algoritmo)
async function verificar(token) {
  const { payload } = await jose.jwtVerify(token, publica, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['EdDSA'] });
  return {
    id: payload.sub, email: payload.email, rol: payload.rol,
    permisos: Array.isArray(payload.perm) ? payload.perm : [], debeCambiarClave: !!payload.dcc,
  };
}
module.exports = { iniciarVerificador, verificar, ISSUER, AUDIENCE, ruta };
