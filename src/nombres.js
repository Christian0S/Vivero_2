// "Miguel Ángel" + "De la Cruz Rojas" -> primerNombre "Miguel", primerApellido "De la Cruz"
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'di', 'van', 'von']);

const primerNombre = n => String(n || '').trim().split(/\s+/)[0] || '';

function primerApellido(a) {
  const out = [];
  for (const w of String(a || '').trim().split(/\s+/).filter(Boolean)) {
    out.push(w);
    if (!PARTICULAS.has(w.toLowerCase())) break;   // los apellidos compuestos con partícula cuentan como uno
  }
  return out.join(' ');
}

// Lo que el front necesita para saludar y mostrar al usuario
function perfil(u) {
  const pn = primerNombre(u.nombre), pa = primerApellido(u.apellidos);
  return {
    id: u.id, email: u.email, rol: u.rol, nombre: u.nombre, apellidos: u.apellidos,
    permisos: u.permisos || [], debeCambiarClave: !!u.debeCambiarClave,
    telefono: u.telefono || '', fotoUrl: u.fotoId ? `/api/archivos/${u.fotoId}` : null,
    primerNombre: pn, primerApellido: pa, nombreCorto: [pn, pa].filter(Boolean).join(' ') || u.email,
  };
}
module.exports = { primerNombre, primerApellido, perfil };
