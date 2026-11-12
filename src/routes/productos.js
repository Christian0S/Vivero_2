const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');

module.exports = db => {
  const r = express.Router();
  r.use(requireAuth, requireRole('gerente', 'empleado'));
  r.get('/', (req, res) => res.json(db.all(`
    SELECT p.id, p.nombre, p.descripcion, p.imagen_url, p.stock, p.stock_minimo, p.precio_venta,
           c.nombre AS categoria, v.nombre AS proveedor
    FROM producto p
    LEFT JOIN categoria c ON c.id = p.categoria_id
    LEFT JOIN proveedor v ON v.id = p.proveedor_id
    WHERE p.activo = 1 ORDER BY p.nombre`)));
  return r;
};
