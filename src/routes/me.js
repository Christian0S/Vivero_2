// Quién soy y mi perfil. Cada usuario edita SOLO lo suyo y con límites: el documento, el cargo, el correo y el rol los define el administrador.
const express = require('express');
const { requireAuth } = require('../../compartido/auth');
const V = require('../../compartido/validaciones');
const { perfil } = require('../nombres');
const almacen = require('../almacen');

const MAX_FOTO = 600 * 1024;
const CAMPOS = ['nombre', 'apellidos', 'telefono', 'ciudad', 'direccion'];
const COLUMNAS = 'nombre, apellidos, telefono, foto_id, tipo_doc, numero_doc, cargo, ciudad, direccion';

module.exports = ({ negocio }) => {
  const r = express.Router();
  r.use(requireAuth());
  const auditar = (req, accion, detalle) => negocio.run("INSERT INTO auditoria(usuario_id, accion, entidad, detalle) VALUES ($1,$2,'perfil',$3)", [req.user.id, accion, detalle]);
  const responder = async (req, res) => {
    const p = await negocio.get(`SELECT ${COLUMNAS} FROM perfil WHERE cuenta_id = $1`, [req.user.id]);
    res.json(perfil({ ...req.user, ...(p || {}), nombre: p?.nombre || '', apellidos: p?.apellidos || '' }));
  };

  r.get('/', responder);

  r.patch('/', async (req, res) => {
    const b = req.body || {};
    const extra = Object.keys(b).filter(k => !CAMPOS.includes(k));
    if (extra.length) return res.status(400).json({ error: `No puedes cambiar: ${extra.join(', ')}. Eso lo modifica el administrador.` });
    const c = {};
    if ('nombre' in b) { c.nombre = V.texto(b.nombre, 1, 80); if (!c.nombre) return res.status(400).json({ error: 'El nombre no puede estar vacío (máximo 80 caracteres)' }); }
    if ('apellidos' in b) { c.apellidos = V.texto(b.apellidos, 1, 80); if (!c.apellidos) return res.status(400).json({ error: 'Los apellidos no pueden estar vacíos (máximo 80 caracteres)' }); }
    if ('telefono' in b) { const t = V.telefono(b.telefono); if (t?.error) return res.status(400).json({ error: t.error }); c.telefono = t; }
    if ('ciudad' in b) { c.ciudad = V.opcional(b.ciudad, 80); if (c.ciudad === null) return res.status(400).json({ error: 'La ciudad admite hasta 80 caracteres' }); }
    if ('direccion' in b) { c.direccion = V.opcional(b.direccion, 160); if (c.direccion === null) return res.status(400).json({ error: 'La dirección admite hasta 160 caracteres' }); }
    if (!Object.keys(c).length) return res.status(400).json({ error: 'No hay cambios para guardar' });
    const sets = [], vals = [];
    for (const [col, v] of Object.entries(c)) { vals.push(v === '' ? null : v); sets.push(`${col} = $${vals.length}`); }   // las columnas salen de la lista fija CAMPOS
    vals.push(req.user.id);
    await negocio.run(`UPDATE perfil SET ${sets.join(', ')} WHERE cuenta_id = $${vals.length}`, vals);
    await auditar(req, 'perfil_actualizado', Object.keys(c).join(', '));
    return responder(req, res);
  });

  // La foto llega como bytes crudos (el navegador ya la reduce a 256 px). El servidor valida tipo real y tamaño.
  r.put('/foto', express.raw({ type: ['image/webp', 'image/jpeg', 'image/png'], limit: MAX_FOTO }), async (req, res) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) return res.status(415).json({ error: 'Envía una imagen WebP, JPEG o PNG' });
    const tipo = almacen.detectarImagen(buf);
    if (!tipo || tipo.mime !== String(req.get('content-type')).split(';')[0]) return res.status(400).json({ error: 'El archivo no es una imagen válida' });
    const rel = `usuarios/${req.user.id}/${almacen.nombreArchivo('foto', tipo.ext)}`;
    almacen.guardar(rel, buf);
    try {
      await negocio.tx(async t => {
        const antes = await t.get('SELECT foto_id FROM perfil WHERE cuenta_id = $1 FOR UPDATE', [req.user.id]);
        const a = await t.get(`INSERT INTO archivo(tipo, ruta, nombre_original, mime, bytes, sha256, subido_por, entidad, entidad_id)
          VALUES ('foto_perfil', $1, 'foto', $2, $3, $4, $5, 'perfil', $6) RETURNING id`, [rel, tipo.mime, buf.length, almacen.sha256(buf), req.user.id, req.user.id]);
        await t.run('UPDATE perfil SET foto_id = $1 WHERE cuenta_id = $2', [a.id, req.user.id]);
        if (antes?.foto_id) await t.run('UPDATE archivo SET eliminado_en = now(), eliminado_por = $1 WHERE id = $2', [req.user.id, antes.foto_id]);
      });
    } catch (e) { almacen.borrarFisico(rel); throw e; }   // si la base falla no queda un archivo huérfano
    await auditar(req, 'foto_actualizada', rel);
    return responder(req, res);
  });

  r.delete('/foto', async (req, res) => {
    await negocio.tx(async t => {
      const antes = await t.get('SELECT foto_id FROM perfil WHERE cuenta_id = $1 FOR UPDATE', [req.user.id]);
      await t.run('UPDATE perfil SET foto_id = NULL WHERE cuenta_id = $1', [req.user.id]);
      if (antes?.foto_id) await t.run('UPDATE archivo SET eliminado_en = now(), eliminado_por = $1 WHERE id = $2', [req.user.id, antes.foto_id]);
    });
    await auditar(req, 'foto_eliminada', '');
    return responder(req, res);
  });
  return r;
};
