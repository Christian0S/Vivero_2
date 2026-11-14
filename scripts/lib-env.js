// Lee .env y arma el entorno de cada servicio con SOLO lo que necesita:
// la API del negocio no recibe las credenciales de la base de identidad, ni la llave privada.
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');

function leerEnv() {
  const f = path.join(RAIZ, '.env'), out = {};
  if (!fs.existsSync(f)) return out;
  for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}
// Variables del sistema que Node necesita para arrancar (sobre todo en Windows)
const SISTEMA = ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'COMSPEC', 'LANG', 'NODE_ENV'];

const COMUN = ['PG_HOST', 'PG_PORT', 'NODE_ENV', 'ACCESS_TTL_SECONDS'];
const POR_SERVICIO = {
  identidad: [...COMUN, 'IDENTIDAD_DB', 'IDENTIDAD_USER', 'IDENTIDAD_PASSWORD', 'JWT_PRIVATE_KEY_FILE', 'JWT_PUBLIC_KEY_FILE', 'APP_ORIGENES', 'APP_PORT'],
  negocio: [...COMUN, 'NEGOCIO_DB', 'NEGOCIO_USER', 'NEGOCIO_PASSWORD', 'JWT_PUBLIC_KEY_FILE', 'IDENTIDAD_URL', 'ALMACEN_DIR'],
};
// 'extra' permite a las pruebas sobreescribir (puertos, etc.)
function envPara(servicio, extra = {}) {
  const archivo = leerEnv(), env = {};
  for (const [k, v] of Object.entries(process.env)) if (SISTEMA.includes(k.toUpperCase())) env[k] = v;
  for (const k of POR_SERVICIO[servicio]) { const v = extra[k] ?? process.env[k] ?? archivo[k]; if (v !== undefined) env[k] = v; }
  const puerto = servicio === 'identidad' ? (archivo.IDENTIDAD_PORT || '3001') : (archivo.PORT || '3000');
  env.PORT = String(extra.PORT ?? puerto);
  if (servicio === 'identidad') env.APP_PORT = String(extra.APP_PORT ?? archivo.PORT ?? '3000');
  return env;
}
module.exports = { leerEnv, envPara, RAIZ };
