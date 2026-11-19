// "Mi empresa": el proveedor actualiza los datos de contacto de SU propia empresa, sin pasar por el administrador.
// No puede cambiar nombre, documento ni categoría, ni ve calificaciones.
const express = require('express');
const { requireAuth, requirePermiso } = require('../../compartido/auth');
const U = require('../proveedores-util');

module.exports = ({ negocio }) => {
  const r = express.Router();
  r.use(requireAuth(), requirePermiso('proveedor.editar_propio'));
  const propio = cuentaId => negocio.get(`SELECT p.id, p.categoria_id FROM proveedor p WHERE p.cuenta_id = $1`, [cuentaId]);
  const NO_VINCULADA = { error: 'Tu cuenta aún no está vinculada a un proveedor. Pídele al administrador que la asocie.' };

  r.get('/', async (req, res) => {
    const p = await propio(req.user.id);
    if (!p) return res.status(404).json(NO_VINCULADA);
    res.json(await negocio.get(`SELECT ${U.SELECT.replace(', p.activo', '')} ${U.FROM} WHERE p.id = $1`, [p.id]));
  });

  r.put('/', async (req, res) => {
    const p = await propio(req.user.id);
    if (!p) return res.status(404).json(NO_VINCULADA);
    const { error, datos } = await U.validar(negocio, req.body || {}, U.CAMPOS_PROPIO, p);
    if (error) return res.status(400).json({ error });
    if (!Object.keys(datos).length) return res.status(400).json({ error: 'No hay cambios para guardar' });
    const fila = await U.actualizar(negocio, req, p.id, datos);
    delete fila.activo;
    res.json(fila);
  });
  return r;
};
