// Inventario. Ver: permiso inventario.ver. Crear, editar y activar/desactivar: inventario.editar.
// El precio de venta SIEMPRE lo calcula el servidor; nunca se acepta el que mande el navegador.
const express = require('express');
const { requireAuth, requirePermiso } = require('../../compartido/auth');
const { calcularPrecioVenta } = require('../../compartido/precios');

const CAMPOS = ['nombre', 'descripcion', 'categoria_id', 'proveedor_id', 'precio_base', 'pct_ganancia', 'pct_iva', 'stock', 'stock_minimo'];
const entero = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const decimal2 = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;

// Devuelve { error } o { datos }. La existencia de categoría y proveedor se comprueba contra la base.
async function validar(negocio, b, actual) {
  for (const k of Object.keys(b)) {
    if (k === 'precio_venta') return { error: 'El precio de venta se calcula solo; no se envía' };
    if (!CAMPOS.includes(k)) return { error: `Campo no permitido: ${k}` };
  }
  const nombre = typeof b.nombre === 'string' ? b.nombre.trim() : '';
  if (nombre.length < 2 || nombre.length > 120) return { error: 'El nombre debe tener entre 2 y 120 caracteres' };
  const descripcion = b.descripcion == null ? '' : b.descripcion;
  if (typeof descripcion !== 'string' || descripcion.length > 500) return { error: 'La descripción admite hasta 500 caracteres' };
  if (!entero(b.categoria_id, 1, 2147483647) || !(await negocio.get('SELECT 1 FROM categoria WHERE id = $1', [b.categoria_id]))) return { error: 'Elige una categoría válida' };
  if (!entero(b.proveedor_id, 1, 2147483647)) return { error: 'Elige un proveedor válido' };
  const prov = await negocio.get('SELECT activo, categoria_id FROM proveedor WHERE id = $1', [b.proveedor_id]);
  if (!prov) return { error: 'Elige un proveedor válido' };
  const mismo = actual && b.proveedor_id === actual.proveedor_id;       // al editar se tolera el proveedor que ya tenía
  if (!prov.activo && !mismo) return { error: 'Ese proveedor está inactivo' };
  if (prov.categoria_id !== b.categoria_id && !(mismo && b.categoria_id === actual.categoria_id)) return { error: 'Ese proveedor no suministra productos de esa categoría' };
  if (!entero(b.precio_base, 0, 100000000)) return { error: 'El costo debe ser un número entero de pesos, entre 0 y 100.000.000' };
  if (!decimal2(b.pct_ganancia, 0, 1000)) return { error: 'La ganancia debe estar entre 0 y 1000 %, con máximo 2 decimales' };
  if (!decimal2(b.pct_iva, 0, 100)) return { error: 'El IVA debe estar entre 0 y 100 %, con máximo 2 decimales' };
  if (!entero(b.stock, 0, 1000000)) return { error: 'El stock debe ser un número entero, 0 o más' };
  if (!entero(b.stock_minimo, 0, 1000000)) return { error: 'El stock mínimo debe ser un número entero, 0 o más' };
  const datos = { nombre, descripcion: descripcion.trim() || null, categoria_id: b.categoria_id, proveedor_id: b.proveedor_id,
    precio_base: b.precio_base, pct_ganancia: b.pct_ganancia, pct_iva: b.pct_iva, stock: b.stock, stock_minimo: b.stock_minimo };
  datos.precio_venta = calcularPrecioVenta(datos.precio_base, datos.pct_ganancia, datos.pct_iva);
  return { datos };
}

module.exports = ({ negocio }) => {
  const r = express.Router();
  r.use(requireAuth(), requirePermiso('inventario.ver'));
  const editar = requirePermiso('inventario.editar');
  const soloEditor = req => req.user.permisos.includes('inventario.editar');

  // Quien edita ve además costos, márgenes y productos inactivos; quien solo consulta, no.
  const SELECT_BASE = `p.id, p.nombre, p.descripcion, p.imagen_url, p.stock, p.stock_minimo, p.precio_venta, c.nombre AS categoria, v.nombre AS proveedor`;
  const SELECT_EDITOR = `${SELECT_BASE}, p.categoria_id, p.proveedor_id, p.precio_base, p.pct_ganancia, p.pct_iva, p.activo`;
  const FROM = `FROM producto p LEFT JOIN categoria c ON c.id = p.categoria_id LEFT JOIN proveedor v ON v.id = p.proveedor_id`;
  const fila = id => negocio.get(`SELECT ${SELECT_EDITOR} ${FROM} WHERE p.id = $1`, [id]);
  const idValido = s => (/^[1-9][0-9]{0,9}$/.test(s) && Number(s) <= 2147483647 ? Number(s) : null);
  const auditar = (t, req, accion, id, detalle) => t.run("INSERT INTO auditoria(usuario_id, accion, entidad, entidad_id, detalle) VALUES ($1,$2,'producto',$3,$4)", [req.user.id, accion, id, detalle]);

  r.get('/', async (req, res) => {
    if (!soloEditor(req)) return res.json(await negocio.all(`SELECT ${SELECT_BASE} ${FROM} WHERE p.activo ORDER BY p.nombre`));
    const inactivos = req.query.inactivos === '1';
    res.json(await negocio.all(`SELECT ${SELECT_EDITOR} ${FROM} ${inactivos ? '' : 'WHERE p.activo'} ORDER BY p.nombre`));
  });

  // Lo que necesita el formulario: categorías, proveedores activos y los valores por defecto de Parámetros
  r.get('/opciones', editar, async (req, res) => {
    const [categorias, proveedores, params] = await Promise.all([
      negocio.all('SELECT id, nombre FROM categoria ORDER BY nombre'),
      negocio.all('SELECT p.id, p.nombre, p.categoria_id, c.nombre AS categoria FROM proveedor p LEFT JOIN categoria c ON c.id = p.categoria_id WHERE p.activo ORDER BY p.nombre'),
      negocio.all("SELECT clave, valor FROM parametro WHERE clave IN ('inventario.iva_por_defecto', 'inventario.stock_minimo_por_defecto')"),
    ]);
    const v = Object.fromEntries(params.map(p => [p.clave, Number(p.valor)]));
    res.json({ categorias, proveedores, defaults: { iva: v['inventario.iva_por_defecto'] ?? 19, stock_minimo: v['inventario.stock_minimo_por_defecto'] ?? 0 } });
  });

  r.post('/', editar, async (req, res) => {
    const { error, datos } = await validar(negocio, req.body || {}, null);
    if (error) return res.status(400).json({ error });
    const id = await negocio.tx(async t => {
      const n = await t.get(`INSERT INTO producto(nombre, descripcion, categoria_id, proveedor_id, precio_base, pct_ganancia, pct_iva, precio_venta, stock, stock_minimo, creado_por, actualizado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING id`,
        [datos.nombre, datos.descripcion, datos.categoria_id, datos.proveedor_id, datos.precio_base, datos.pct_ganancia, datos.pct_iva, datos.precio_venta, datos.stock, datos.stock_minimo, req.user.id]);
      await auditar(t, req, 'producto_creado', n.id, JSON.stringify(datos));
      return n.id;
    });
    res.status(201).json(await fila(id));
  });

  r.put('/:id', editar, async (req, res) => {
    const id = idValido(req.params.id);
    const antes = id && await negocio.get('SELECT * FROM producto WHERE id = $1', [id]);
    if (!antes) return res.status(404).json({ error: 'El producto no existe' });
    const { error, datos } = await validar(negocio, req.body || {}, antes);
    if (error) return res.status(400).json({ error });
    const cambios = {};
    for (const k of [...CAMPOS, 'precio_venta']) if (String(antes[k] ?? null) !== String(datos[k] ?? null)) cambios[k] = [antes[k], datos[k]];
    if (Object.keys(cambios).length) {
      await negocio.tx(async t => {
        await t.run(`UPDATE producto SET nombre=$1, descripcion=$2, categoria_id=$3, proveedor_id=$4, precio_base=$5, pct_ganancia=$6, pct_iva=$7, precio_venta=$8,
          stock=$9, stock_minimo=$10, actualizado_en=now(), actualizado_por=$11 WHERE id=$12`,
          [datos.nombre, datos.descripcion, datos.categoria_id, datos.proveedor_id, datos.precio_base, datos.pct_ganancia, datos.pct_iva, datos.precio_venta, datos.stock, datos.stock_minimo, req.user.id, id]);
        await auditar(t, req, 'producto_modificado', id, JSON.stringify(cambios));   // cada campo: [antes, después]
      });
    }
    res.json(await fila(id));
  });

  // No se borran productos (las órdenes los referencian): se desactivan y dejan de verse en el catálogo
  r.patch('/:id/activo', editar, async (req, res) => {
    const id = idValido(req.params.id);
    if (typeof req.body?.activo !== 'boolean') return res.status(400).json({ error: 'Indica si el producto queda activo o inactivo' });
    if (!id || !(await negocio.get('SELECT 1 FROM producto WHERE id = $1', [id]))) return res.status(404).json({ error: 'El producto no existe' });
    await negocio.tx(async t => {
      await t.run('UPDATE producto SET activo = $1, actualizado_en = now(), actualizado_por = $2 WHERE id = $3', [req.body.activo, req.user.id, id]);
      await auditar(t, req, req.body.activo ? 'producto_activado' : 'producto_desactivado', id, '');
    });
    res.json(await fila(id));
  });
  return r;
};
