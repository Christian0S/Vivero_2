// Reglas de validación compartidas por las rutas de perfil, usuarios y proveedores.
const { normalizar, puedeWhatsapp } = require('./telefonos');

const TIPOS_DOC = ['Cédula', 'Cédula de extranjería', 'NIT', 'Pasaporte', 'Otro'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DOC = /^[A-Za-z0-9.\-]{3,30}$/;

// Texto obligatorio: devuelve el texto recortado o null si no cumple
const texto = (v, min, max) => (typeof v === 'string' && v.trim().length >= min && v.trim().length <= max ? v.trim() : null);
// Texto opcional: '' si viene vacío, null si es inválido
const opcional = (v, max) => (v == null || v === '' ? '' : (typeof v === 'string' && v.trim().length <= max ? v.trim() : null));

// Teléfono: '' (vacío) | '+57…' | { error }
function telefono(v, etiqueta = 'El teléfono') {
  const r = normalizar(v);
  return r.ok ? (r.e164 ?? '') : { error: `${etiqueta}: ${r.motivo}` };
}
function whatsapp(v) {
  const t = telefono(v, 'El WhatsApp');
  if (t && t.error) return t;
  return t && !puedeWhatsapp(t) ? { error: 'El WhatsApp: ese número es un fijo; WhatsApp necesita un celular' } : t;
}
function correo(v) {
  const c = opcional(v, 120);
  return c === null || (c !== '' && !EMAIL.test(c)) ? { error: 'El correo no es válido' } : c.toLowerCase();
}
const tipoDoc = v => (v == null || v === '' ? '' : TIPOS_DOC.includes(v) ? v : { error: 'El tipo de documento no es válido' });
const numeroDoc = v => { const n = opcional(v, 30); return n === null || (n !== '' && !DOC.test(n)) ? { error: 'El número de documento no es válido (letras, números, puntos y guiones)' } : n; };

module.exports = { TIPOS_DOC, EMAIL, texto, opcional, telefono, whatsapp, correo, tipoDoc, numeroDoc };
