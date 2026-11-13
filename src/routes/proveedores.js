// Ruta protegida por rol: gerente y empleado ven proveedores (incluye su calificación: es información INTERNA)
const express = require('express');
const { requireAuth, requirePermiso } = require('../../compartido/auth');

module.exports = ({ negocio }) => {
  const r = express.Router();
  r.use(requireAuth(), requirePermiso('proveedores.ver'));
  r.get('/', async (req, res) => res.json(await negocio.all(`
    SELECT p.id, p.nombre, p.ciudad, p.telefono, p.correo, c.nombre AS categoria,
           d.promedio, d.n AS calificaciones
    FROM proveedor p
    LEFT JOIN categoria c ON c.id = p.categoria_id
    LEFT JOIN proveedor_desempeno d ON d.proveedor_id = p.id
    WHERE p.activo ORDER BY p.nombre`)));
  return r;
};
