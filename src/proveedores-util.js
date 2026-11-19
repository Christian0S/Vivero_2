// Validación y actualización de proveedores, compartida por la edición del gerente y la del propio proveedor.
const V = require('../compartido/validaciones');

const CAMPOS_EDITOR = ['nombre', 'tipo_doc', 'numero_doc', 'pais', 'ciudad', 'direccion', 'telefono', 'whatsapp', 'correo', 'categoria_id'];
const CAMPOS_PROPIO = ['ciudad', 'direccion', 'telefono', 'whatsapp', 'correo'];   // el proveedor solo toca su contacto

const SELECT = `p.id, p.nombre, p.tipo_doc, p.numero_doc, p.pais, p.ciudad, p.direccion, p.telefono, p.whatsapp, p.correo, p.categoria_id, c.nombre AS categoria, p.activo`;
const FROM = 'FROM proveedor p LEFT JOIN categoria c ON c.id = p.categoria_id';

// Devuelve { error } o { datos } con SOLO los campos recibidos ('' = dejar vacío)
async function validar(negocio, b, permitidos, actual) {
  const extra = Object.keys(b).filter(k => !permitidos.includes(k));
  if (extra.length) return { error: `No puedes cambiar: ${extra.join(', ')}` };
  const d = {}, falla = error => ({ error });
  if ('nombre' in b) { d.nombre = V.texto(b.nombre, 2, 120); if (!d.nombre) return falla('El nombre debe tener entre 2 y 120 caracteres'); }
  if ('tipo_doc' in b) { const t = V.tipoDoc(b.tipo_doc); if (t?.error) return falla(t.error); d.tipo_doc = t; }
  if ('numero_doc' in b) { const t = V.numeroDoc(b.numero_doc); if (t?.error) return falla(t.error); d.numero_doc = t; }
  if ('pais' in b) { d.pais = V.opcional(b.pais, 60); if (d.pais === null) return falla('El país admite hasta 60 caracteres'); }
  if ('ciudad' in b) { d.ciudad = V.opcional(b.ciudad, 80); if (d.ciudad === null) return falla('La ciudad admite hasta 80 caracteres'); }
  if ('direccion' in b) { d.direccion = V.opcional(b.direccion, 160); if (d.direccion === null) return falla('La dirección admite hasta 160 caracteres'); }
  if ('telefono' in b) { const t = V.telefono(b.telefono); if (t?.error) return falla(t.error); d.telefono = t; }
  if ('whatsapp' in b) { const t = V.whatsapp(b.whatsapp); if (t?.error) return falla(t.error); d.whatsapp = t; }
  if ('correo' in b) { const c = V.correo(b.correo); if (c?.error) return falla(c.error); d.correo = c; }
  if ('categoria_id' in b) {
    if (!Number.isInteger(b.categoria_id) || !(await negocio.get('SELECT 1 FROM categoria WHERE id = $1', [b.categoria_id]))) return falla('Elige una categoría válida');
    if (actual && b.categoria_id !== actual.categoria_id) {   // cambiar la categoría dejaría productos con un proveedor de otra categoría
      const { n } = await negocio.get('SELECT COUNT(*) n FROM producto WHERE proveedor_id = $1', [actual.id]);
      if (n > 0) return falla(`No se puede cambiar la categoría: este proveedor tiene ${n} producto${n === 1 ? '' : 's'} asociado${n === 1 ? '' : 's'}`);
    }
    d.categoria_id = b.categoria_id;
  }
  return { datos: d };
}

// Aplica los cambios y deja en la auditoría cada campo como [antes, después]. Devuelve la fila actualizada o null si no existe.
async function actualizar(negocio, req, id, datos) {
  return negocio.tx(async t => {
    const antes = await t.get('SELECT * FROM proveedor WHERE id = $1 FOR UPDATE', [id]);
    if (!antes) return null;
    const cambios = {};
    for (const [k, v] of Object.entries(datos)) if (String(antes[k] ?? '') !== String(v ?? '')) cambios[k] = [antes[k] ?? null, v === '' ? null : v];
    if (Object.keys(cambios).length) {
      if (antes.telefono && !/^\+[1-9][0-9]{7,14}$/.test(antes.telefono) && !('telefono' in cambios))
        throw Object.assign(new Error('El teléfono guardado no tiene formato internacional (+57 …). Corrígelo para poder guardar.'), { servicio: true, status: 400 });
      const pares = Object.entries(cambios).map(([c, [, v]]) => [c, v]);
      const vals = [...pares.map(x => x[1]), req.user.id, id];
      await t.run(`UPDATE proveedor SET ${pares.map(([c], i) => `${c} = $${i + 1}`).join(', ')}, actualizado_en = now(), actualizado_por = $${pares.length + 1} WHERE id = $${pares.length + 2}`, vals);   // columnas de la lista fija
      await t.run("INSERT INTO auditoria(usuario_id, accion, entidad, entidad_id, detalle) VALUES ($1, 'proveedor_modificado', 'proveedor', $2, $3)", [req.user.id, id, JSON.stringify(cambios)]);
    }
    return t.get(`SELECT ${SELECT} ${FROM} WHERE p.id = $1`, [id]);
  });
}
module.exports = { CAMPOS_EDITOR, CAMPOS_PROPIO, SELECT, FROM, validar, actualizar };
