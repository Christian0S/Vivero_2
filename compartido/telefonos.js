// Teléfonos en formato internacional E.164 (+573101234567): es lo que necesita WhatsApp (https://wa.me/573101234567) y tel:.
// Reglas para Colombia (país por defecto): celular = 10 dígitos que empiezan por 3; fijo = 10 dígitos que empiezan por 60 (con indicativo de ciudad).
const PAIS = '57';
const E164 = /^\+[1-9][0-9]{7,14}$/;
const CELULAR_CO = /^\+573[0-9]{9}$/;

const ok = digitos => ({ ok: true, e164: '+' + digitos });

// Devuelve { ok:true, e164 } (e164 null si estaba vacío) o { ok:false, motivo }
function normalizar(valor, pais = PAIS) {
  const s = String(valor ?? '').trim();
  if (!s) return { ok: true, e164: null };
  let d = s.replace(/[^0-9]/g, '');
  if (s.startsWith('+') || s.startsWith('00')) {                 // ya trae indicativo de país
    if (s.startsWith('00')) d = d.slice(2);
    if (d.length === 10 && d[0] === '3') return ok(pais + d);                     // "+310 123 4567": celular colombiano con "+" pero sin el 57
    if (d.length === 14 && d.startsWith(pais + pais + '3')) return ok(d.slice(2)); // "+57 57 310…": el 57 quedó repetido
    return E164.test('+' + d) ? ok(d) : { ok: false, motivo: 'El número internacional no es válido' };
  }
  if (d.length === 10 && d[0] === '3') return ok(pais + d);                       // celular sin indicativo
  if (d.length === 12 && d.startsWith(pais + '3')) return ok(d);                  // trae el 57 pero sin "+"
  if (d.length === 10 && d.startsWith('60')) return ok(pais + d);                 // fijo con indicativo de ciudad
  if (d.length === 12 && d.startsWith(pais + '60')) return ok(d);
  if (d.length === 7) return { ok: false, motivo: 'Falta el indicativo de la ciudad' };
  return { ok: false, motivo: 'No reconozco ese formato; escríbelo con indicativo del país (+57 …)' };
}
const esE164 = v => typeof v === 'string' && E164.test(v);
// WhatsApp funciona en celulares. En Colombia podemos comprobarlo (los fijos empiezan por 60); en otros países no, y se permite.
const puedeWhatsapp = e164 => esE164(e164) && (!e164.startsWith('+' + PAIS) || CELULAR_CO.test(e164));

module.exports = { normalizar, esE164, puedeWhatsapp, E164 };
