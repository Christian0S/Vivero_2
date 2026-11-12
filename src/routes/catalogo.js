// Catálogo PÚBLICO para clientes (sin sesión). Solo expone lo que un cliente debe ver:
// nunca proveedor, costo, margen ni cantidades exactas de stock.
const express = require('express');

module.exports = ({ negocio }) => {
  const r = express.Router();
  r.get('/', async (req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.json(await negocio.all(`
      SELECT p.id, p.nombre, p.imagen_url, p.precio_venta, c.nombre AS categoria,
        CASE WHEN p.stock <= 0 THEN 'agotado'
             WHEN p.stock <= p.stock_minimo THEN 'pocas'
             ELSE 'disponible' END AS disponibilidad
      FROM producto p LEFT JOIN categoria c ON c.id = p.categoria_id
      WHERE p.activo ORDER BY p.nombre`));
  });
  return r;
};
