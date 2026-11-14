// Quién soy y mi perfil: datos del token (rol y permisos) + perfil del negocio. Cada usuario edita SOLO lo suyo y con límites.
const express = require('express');
const { requireAuth } = require('../../compartido/auth');
const { perfil } = require('../nombres');
const almacen = require('../almacen');

const MAX_FOTO = 600 * 1024;
const CAMPOS = ['nombre', 'apellidos', 'telefono'];          // rol, correo y estado NO se editan aquí
const TEL = /^\+?[0-9 ()-]{7,20}$/;
const texto = (v, max) => (typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= max ? v.trim() : null);

module.exports = ({ negocio }) => {
  const r = express.Router();
  r.use(requireAuth());
  const auditar = (req, accion, detalle) => negocio.run("INSERT INTO auditoria(usuario_id, accion, entidad, detalle) VALUES ($1,$2,'perfil',$3)", [req.user.id, accion, detalle]);
  const responder = async (req, res) => {
    const p = await negocio.get('SELECT nombre, apellidos, telefono, foto_id FROM perfil WHERE cuenta_id = $1', [req.user.id]);
    res.json(perfil({ ...req.user, nombre: p?.nombre || '', apellidos: p?.apellidos || '', telefono: p?.telefono || '', fotoId: p?.foto_id }));
  };

  r.get('/', responder);

  r.patch('/', async (req, res) => {
    const b = req.body || {};
    const extra = Object.keys(b).filter(k => !CAMPOS.includes(k));
    if (extra.length) return res.status(400).json({ error: `No puedes cambiar: ${extra.join(', ')}` });
    const nombre = b.nombre === undefined ? undefined : texto(b.nombre, 80);
    const apellidos = b.apellidos === undefined ? undefined : texto(b.apellidos, 80);
    const telefono = b.telefono === undefined ? undefined : (b.telefono === '' ? '' : (typeof b.telefono === 'string' && TEL.test(b.telefono.trim()) ? b.telefono.trim() : null));
    if (nombre === null || apellidos === null) return res.status(400).json({ error: 'Nombre y apellidos no pueden estar vacíos (máximo 80 caracteres)' });
    if (telefono === null) return res.status(400).json({ error: 'El teléfono no es válido' });
    if (nombre === undefined && apellidos === undefined && telefono === undefined) return res.status(400).json({ error: 'No hay cambios para guardar' });
    await negocio.run("UPDATE perfil SET nombre = COALESCE($1, nombre), apellidos = COALESCE($2, apellidos), telefono = CASE WHEN $3::text IS NULL THEN telefono ELSE NULLIF($3, '') END WHERE cuenta_id = $4",
      [nombre ?? null, apellidos ?? null, telefono ?? null, req.user.id]);
    await auditar(req, 'perfil_actualizado', Object.keys(b).join(', '));
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
