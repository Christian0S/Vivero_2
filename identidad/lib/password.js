// Contraseñas con argon2id (parámetros mínimos recomendados por OWASP). hash-wasm no compila nada: funciona en cualquier Node.
const crypto = require('crypto');
const { argon2id, argon2Verify } = require('hash-wasm');
const PARAMS = { parallelism: 1, iterations: 2, memorySize: 19456, hashLength: 32 };

const hash = password => argon2id({ password, salt: crypto.randomBytes(16), ...PARAMS, outputType: 'encoded' });
const verificar = (password, encoded) => argon2Verify({ password, hash: encoded }).catch(() => false);

// Clave temporal legible: sin caracteres confundibles (0/O, 1/l/I)
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const claveTemporal = () => Array.from({ length: 14 }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join('');

function validarNueva(nueva, email) {
  if (typeof nueva !== 'string' || nueva.length < 10) return 'La contraseña debe tener al menos 10 caracteres';
  if (nueva.length > 128) return 'La contraseña es demasiado larga';
  const usuario = String(email || '').split('@')[0].toLowerCase();
  if (usuario.length >= 4 && nueva.toLowerCase().includes(usuario)) return 'No uses tu correo dentro de la contraseña';
  if (/^(.)\1+$/.test(nueva)) return 'La contraseña es demasiado simple';
  return null;
}
module.exports = { hash, verificar, claveTemporal, validarNueva };
