// Proveedores. Ver: proveedores.ver (incluye la calificación: es información INTERNA). Editar: proveedores.editar.
const express = require('express');
const { requireAuth, requirePermiso } = require('../../compartido/auth');
const V = require('../../compartido/validaciones');
const U = require('../proveedores-util');

module.exports = ({ negocio }) => {
  const r = express.Router();
  r.use(requireAuth());
  const idValido = s => (/^[1-9][0-9]{0,9}$/.test(s) && Number(s) <= 2147483647 ? Number(s) : null);

  r.get('/', requirePermiso('proveedores.ver'), async (req, res) => {
    const editor = req.user.permisos.includes('proveedores.editar');
    // Quien edita ve además documento, dirección y categoría para el formulario; quien solo consulta, no
    res.json(await negocio.all(`
      SELECT p.id, p.nombre, p.ciudad, p.telefono, p.whatsapp, p.correo, c.nombre AS categoria, d.promedio, d.n AS calificaciones
        ${editor ? ', p.tipo_doc, p.numero_doc, p.pais, p.direccion, p.categoria_id' : ''}
      FROM proveedor p
      LEFT JOIN categoria c ON c.id = p.categoria_id
      LEFT JOIN proveedor_desempeno d ON d.proveedor_id = p.id
      WHERE p.activo ORDER BY p.nombre`));
  });

  r.get('/opciones', requirePermiso('proveedores.editar'), async (req, res) =>
    res.json({ categorias: await negocio.all('SELECT id, nombre FROM categoria ORDER BY nombre'), tiposDoc: V.TIPOS_DOC }));

  r.put('/:id', requirePermiso('proveedores.editar'), async (req, res) => {
    const id = idValido(req.params.id);
    const actual = id && await negocio.get('SELECT id, categoria_id FROM proveedor WHERE id = $1', [id]);
    if (!actual) return res.status(404).json({ error: 'El proveedor no existe' });
    const { error, datos } = await U.validar(negocio, req.body || {}, U.CAMPOS_EDITOR, actual);
    if (error) return res.status(400).json({ error });
    if (!Object.keys(datos).length) return res.status(400).json({ error: 'No hay cambios para guardar' });
    res.json(await U.actualizar(negocio, req, id, datos));
  });
  return r;
};
