// Quién soy: datos del token (rol y permisos) + mi perfil del negocio
const express = require('express');
const { requireAuth } = require('../../compartido/auth');
const { perfil } = require('../nombres');

module.exports = ({ negocio }) => {
  const r = express.Router();
  r.get('/', requireAuth(), async (req, res) => {
    const p = await negocio.get('SELECT nombre, apellidos FROM perfil WHERE cuenta_id = $1', [req.user.id]);
    res.json(perfil({ ...req.user, nombre: p?.nombre || '', apellidos: p?.apellidos || '' }));
  });
  return r;
};
