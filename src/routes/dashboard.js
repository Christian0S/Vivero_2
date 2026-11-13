// Resumen para la pantalla de inicio; el contenido depende del rol
const express = require('express');
const { requireAuth, requirePermiso } = require('../../compartido/auth');
const ABIERTAS = "estado NOT IN ('completada','calificada','rechazada')";

module.exports = ({ negocio }) => {
  const r = express.Router();
  r.use(requireAuth(), requirePermiso('dashboard.ver'));

  r.get('/', async (req, res) => {
    if (req.user.rol === 'proveedor') {
      const p = await negocio.get('SELECT id, nombre FROM proveedor WHERE cuenta_id = $1', [req.user.id]);
      if (!p) return res.json({ rol: 'proveedor', proveedor: null });
      // OJO: el proveedor NUNCA recibe calificaciones ni promedios (ni los suyos)
      const [abiertas, completadas, porConfirmar, porEstado, recientes] = await Promise.all([
        negocio.get(`SELECT COUNT(*) n FROM orden_compra WHERE proveedor_id = $1 AND ${ABIERTAS}`, [p.id]),
        negocio.get("SELECT COUNT(*) n FROM orden_compra WHERE proveedor_id = $1 AND estado IN ('completada','calificada')", [p.id]),
        negocio.get("SELECT COUNT(*) n FROM orden_compra WHERE proveedor_id = $1 AND estado IN ('en_entrega','por_validar')", [p.id]),
        negocio.all('SELECT estado, COUNT(*) n FROM orden_compra WHERE proveedor_id = $1 GROUP BY estado', [p.id]),
        negocio.all('SELECT id, nombre, estado, total, fecha_entrega FROM orden_compra WHERE proveedor_id = $1 ORDER BY fecha_entrega DESC NULLS LAST LIMIT 6', [p.id]),
      ]);
      return res.json({ rol: 'proveedor', proveedor: p.nombre,
        kpis: { abiertas: abiertas.n, completadas: completadas.n, porConfirmar: porConfirmar.n }, ordenesPorEstado: porEstado, recientes });
    }
    const [productos, bajo, proveedores, abiertas, porEstado, lista, top] = await Promise.all([
      negocio.get('SELECT COUNT(*) n FROM producto WHERE activo'),
      negocio.get('SELECT COUNT(*) n FROM producto WHERE activo AND stock <= stock_minimo'),
      negocio.get('SELECT COUNT(*) n FROM proveedor WHERE activo'),
      negocio.get(`SELECT COUNT(*) n FROM orden_compra WHERE ${ABIERTAS}`),
      negocio.all('SELECT estado, COUNT(*) n FROM orden_compra GROUP BY estado'),
      negocio.all(`SELECT p.id, p.nombre, p.stock, p.stock_minimo, p.imagen_url, v.nombre AS proveedor
        FROM producto p LEFT JOIN proveedor v ON v.id = p.proveedor_id
        WHERE p.activo AND p.stock <= p.stock_minimo
        ORDER BY (p.stock - p.stock_minimo), p.nombre LIMIT 6`),
      negocio.all(`SELECT v.id, v.nombre, c.nombre AS categoria, d.promedio, d.n
        FROM proveedor_desempeno d JOIN proveedor v ON v.id = d.proveedor_id
        LEFT JOIN categoria c ON c.id = v.categoria_id
        ORDER BY d.promedio DESC, d.n DESC LIMIT 5`),
    ]);
    res.json({ rol: req.user.rol,
      kpis: { productos: productos.n, bajoStock: bajo.n, proveedores: proveedores.n, ordenesAbiertas: abiertas.n },
      ordenesPorEstado: porEstado, bajoStock: lista, topProveedores: top });
  });
  return r;
};
