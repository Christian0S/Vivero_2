const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');

module.exports = ({ negocio }) => {
  const r = express.Router();
  r.use(requireAuth, requireRole('gerente', 'empleado'));
  r.get('/', async (req, res) => res.json(await negocio.all(`
    SELECT p.id, p.nombre, p.descripcion, p.imagen_url, p.stock, p.stock_minimo, p.precio_venta,
           c.nombre AS categoria, v.nombre AS proveedor
    FROM producto p
    LEFT JOIN categoria c ON c.id = p.categoria_id
    LEFT JOIN proveedor v ON v.id = p.proveedor_id
    WHERE p.activo ORDER BY p.nombre`)));
  return r;
};
