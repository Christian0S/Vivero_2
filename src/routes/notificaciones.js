// Notificaciones calculadas al momento según los permisos de quien pregunta.
// Por ahora una regla (stock bajo); la Fase 8 agrega entregas por confirmar, calificaciones pendientes y proveedores inactivos.
const express = require('express');
const { requireAuth } = require('../../compartido/auth');

module.exports = ({ negocio }) => {
  const r = express.Router();
  r.get('/', requireAuth(), async (req, res) => {
    const items = [];
    if (req.user.permisos.includes('inventario.ver')) {
      const { n } = await negocio.get('SELECT COUNT(*) n FROM producto WHERE activo AND stock <= stock_minimo');
      if (n > 0) items.push({ id: 'stock_bajo', tipo: 'stock_bajo', titulo: `${n} producto${n === 1 ? '' : 's'} con stock bajo`, detalle: 'Revisa qué conviene reponer', enlace: '#/inventario?bajo=1' });
    }
    res.json({ total: items.length, items });
  });
  return r;
};
