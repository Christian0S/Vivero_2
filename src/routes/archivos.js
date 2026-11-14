// Descarga de archivos: SIEMPRE con sesión y con permiso sobre ese archivo. Nada de rutas públicas a carpetas.
const express = require('express');
const { requireAuth } = require('../../compartido/auth');
const almacen = require('../almacen');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = ({ negocio }) => {
  const r = express.Router();
  r.get('/:id', requireAuth(), async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Archivo no encontrado' });
    const a = await negocio.get('SELECT ruta, mime, sha256, entidad, entidad_id, eliminado_en FROM archivo WHERE id = $1', [req.params.id]);
    if (!a || a.eliminado_en) return res.status(404).json({ error: 'Archivo no encontrado' });
    // Regla por tipo de archivo (se amplía en cada fase): la foto de perfil la ve su dueño y quien administra usuarios
    const permitido = a.entidad === 'perfil' && (a.entidad_id === req.user.id || req.user.permisos.includes('usuarios.admin'));
    if (!permitido) return res.status(403).json({ error: 'No tienes permiso para ver este archivo' });
    const etag = `"${a.sha256}"`;
    res.set({ 'Content-Type': a.mime, ETag: etag, 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': 'inline' });
    if (req.get('if-none-match') === etag) return res.status(304).end();
    res.sendFile(almacen.rutaAbs(a.ruta), { cacheControl: false, etag: false, lastModified: false });
  });
  return r;
};
