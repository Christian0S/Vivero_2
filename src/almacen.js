// Almacén de archivos en disco. La base guarda los datos (tabla archivo); aquí vive el archivo.
// Estructura: almacenamiento/usuarios/{id}/foto_20261113-051530_a1b2c3d4.webp  (qué es, fecha-hora UTC, sufijo aleatorio)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const BASE = path.resolve(__dirname, '..', process.env.ALMACEN_DIR || 'almacenamiento');

// Se confía en los BYTES del archivo, no en su nombre ni en lo que diga el navegador
function detectarImagen(b) {
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;                                   // SVG y demás quedan fuera: un SVG puede llevar código
}
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
function nombreArchivo(que, ext) {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${que}_${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
}
// Nunca se arma una ruta con texto del usuario; aun así se verifica que quede dentro del almacén
function rutaAbs(rel) {
  const abs = path.resolve(BASE, rel);
  if (!abs.startsWith(BASE + path.sep)) throw new Error('Ruta fuera del almacén');
  return abs;
}
function guardar(rel, buf) { const abs = rutaAbs(rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, buf, { flag: 'wx' }); }
function borrarFisico(rel) { try { fs.unlinkSync(rutaAbs(rel)); } catch { /* ya no estaba */ } }

module.exports = { BASE, detectarImagen, sha256, nombreArchivo, rutaAbs, guardar, borrarFisico };
