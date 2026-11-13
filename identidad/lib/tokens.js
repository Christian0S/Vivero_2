// Firma de tokens de acceso (EdDSA / Ed25519). La llave PRIVADA solo existe en este servicio.
const fs = require('fs'), crypto = require('crypto');
const { ISSUER, AUDIENCE, ruta } = require('../../compartido/jwt');
let jose, privada;

const TTL_SEG = () => Number(process.env.ACCESS_TTL_SECONDS || 600);   // el token de acceso dura 10 minutos

async function iniciarFirmador() {
  jose = await import('jose');
  const f = ruta(process.env.JWT_PRIVATE_KEY_FILE, 'keys/jwt-private.pem');
  if (!fs.existsSync(f)) { console.error(`No se encuentra la llave privada (${f}). Corre: npm run setup:env`); process.exit(1); }
  privada = await jose.importPKCS8(fs.readFileSync(f, 'utf8'), 'EdDSA');
}
async function firmarAcceso({ id, email, rol, permisos, debeCambiarClave }) {
  const ahora = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({ email, rol, perm: permisos, dcc: !!debeCambiarClave })
    .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
    .setSubject(id).setIssuer(ISSUER).setAudience(AUDIENCE)
    .setIssuedAt(ahora).setExpirationTime(ahora + TTL_SEG()).setJti(crypto.randomUUID())
    .sign(privada);
}
module.exports = { iniciarFirmador, firmarAcceso, TTL_SEG };
