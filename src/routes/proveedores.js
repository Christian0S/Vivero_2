// Ejemplo de ruta protegida por rol: gerente y empleado pueden ver proveedores
const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');

module.exports = db => {
  const r = express.Router();
  r.use(requireAuth, requireRole('gerente', 'empleado'));
  r.get('/', (req, res) => res.json(db.all(`
    SELECT p.id, p.nombre, p.ciudad, p.telefono, p.correo, c.nombre AS categoria,
           d.promedio, d.n AS calificaciones
    FROM proveedor p
    LEFT JOIN categoria c ON c.id = p.categoria_id
    LEFT JOIN proveedor_desempeno d ON d.proveedor_id = p.id
    WHERE p.activo = 1 ORDER BY p.nombre`)));
  return r;
};
