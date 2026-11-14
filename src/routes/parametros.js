// Parámetros del sistema: solo el administrador los ve y cambia. Cada valor se valida según su tipo.
const express = require('express');
const { requireAuth, requirePermiso } = require('../../compartido/auth');

const TEL = /^\+?[0-9 ()-]{7,20}$/, WA = /^\+[1-9][0-9]{7,14}$/, EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function validar(p, v) {
  switch (p.tipo) {
    case 'texto': return v.length > 120 ? 'Máximo 120 caracteres' : null;
    case 'telefono': return v === '' || TEL.test(v) ? null : 'Teléfono no válido';
    case 'whatsapp': return v === '' || WA.test(v) ? null : 'Escríbelo con indicativo, por ejemplo +57 300 123 4567';
    case 'correo': return v === '' || EMAIL.test(v) ? null : 'Correo no válido';
    case 'entero': case 'decimal': {
      if (!(p.tipo === 'entero' ? /^\d{1,5}$/ : /^\d{1,3}(\.\d{1,2})?$/).test(v)) return 'Número no válido';
      const n = Number(v);
      if (p.minimo !== null && n < p.minimo) return `Debe ser al menos ${p.minimo}`;
      if (p.maximo !== null && n > p.maximo) return `Debe ser como máximo ${p.maximo}`;
      return null;
    }
    default: return 'Tipo desconocido';
  }
}

module.exports = ({ negocio }) => {
  const r = express.Router();
  r.use(requireAuth(), requirePermiso('parametros.admin'));
  r.get('/', async (req, res) => res.json(await negocio.all('SELECT clave, valor, tipo, grupo, descripcion, minimo, maximo, publico, actualizado_en FROM parametro ORDER BY grupo, clave')));
  r.put('/:clave', async (req, res) => {
    const p = await negocio.get('SELECT clave, tipo, minimo, maximo FROM parametro WHERE clave = $1', [req.params.clave]);
    if (!p) return res.status(404).json({ error: 'El parámetro no existe' });
    if (typeof req.body?.valor !== 'string') return res.status(400).json({ error: 'Falta el valor' });
    let valor = req.body.valor.trim();
    if (p.tipo === 'whatsapp') valor = valor.replace(/[\s()-]/g, '');   // se guarda compacto: +573001234567
    const problema = validar(p, valor);
    if (problema) return res.status(400).json({ error: problema });
    await negocio.run('UPDATE parametro SET valor = $1, actualizado_por = $2, actualizado_en = now() WHERE clave = $3', [valor, req.user.id, p.clave]);
    await negocio.run("INSERT INTO auditoria(usuario_id, accion, entidad, detalle) VALUES ($1, 'parametro_modificado', 'parametro', $2)", [req.user.id, `${p.clave} = ${valor}`]);
    res.json({ clave: p.clave, valor });
  });
  return r;
};
