// Resumen para la pantalla de inicio; el contenido depende del rol
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ABIERTAS = "estado NOT IN ('completada','calificada','rechazada')";

module.exports = db => {
  const r = express.Router();
  r.use(requireAuth);

  r.get('/', (req, res) => {
    if (req.user.rol === 'proveedor') {
      const p = db.get('SELECT id, nombre FROM proveedor WHERE usuario_id = ?', req.user.id);
      if (!p) return res.json({ rol: 'proveedor', proveedor: null });
      const d = db.get('SELECT promedio, n FROM proveedor_desempeno WHERE proveedor_id = ?', p.id);
      return res.json({
        rol: 'proveedor',
        proveedor: p.nombre,
        kpis: {
          abiertas: db.get(`SELECT COUNT(*) n FROM orden_compra WHERE proveedor_id = ? AND ${ABIERTAS}`, p.id).n,
          completadas: db.get("SELECT COUNT(*) n FROM orden_compra WHERE proveedor_id = ? AND estado IN ('completada','calificada')", p.id).n,
          promedio: d?.promedio ?? null,
          calificaciones: d?.n ?? 0,
        },
        ordenesPorEstado: db.all('SELECT estado, COUNT(*) n FROM orden_compra WHERE proveedor_id = ? GROUP BY estado', p.id),
        recientes: db.all('SELECT id, nombre, estado, total, fecha_entrega FROM orden_compra WHERE proveedor_id = ? ORDER BY fecha_entrega DESC LIMIT 6', p.id),
      });
    }
    res.json({
      rol: req.user.rol,
      kpis: {
        productos: db.get('SELECT COUNT(*) n FROM producto WHERE activo = 1').n,
        bajoStock: db.get('SELECT COUNT(*) n FROM producto WHERE activo = 1 AND stock <= stock_minimo').n,
        proveedores: db.get('SELECT COUNT(*) n FROM proveedor WHERE activo = 1').n,
        ordenesAbiertas: db.get(`SELECT COUNT(*) n FROM orden_compra WHERE ${ABIERTAS}`).n,
      },
      ordenesPorEstado: db.all('SELECT estado, COUNT(*) n FROM orden_compra GROUP BY estado'),
      bajoStock: db.all(`SELECT p.id, p.nombre, p.stock, p.stock_minimo, p.imagen_url, v.nombre AS proveedor
        FROM producto p LEFT JOIN proveedor v ON v.id = p.proveedor_id
        WHERE p.activo = 1 AND p.stock <= p.stock_minimo
        ORDER BY (p.stock - p.stock_minimo), p.nombre LIMIT 6`),
      topProveedores: db.all(`SELECT v.id, v.nombre, c.nombre AS categoria, d.promedio, d.n
        FROM proveedor_desempeno d JOIN proveedor v ON v.id = d.proveedor_id
        LEFT JOIN categoria c ON c.id = v.categoria_id
        ORDER BY d.promedio DESC, d.n DESC LIMIT 5`),
    });
  });
  return r;
};
