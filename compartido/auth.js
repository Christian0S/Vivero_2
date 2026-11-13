// Middleware de autenticación y permisos, compartido por los dos servicios.
const { verificar } = require('./jwt');

// opciones.bearer: acepta también "Authorization: Bearer" (llamadas de servicio a servicio)
const requireAuth = (opciones = {}) => async (req, res, next) => {
  let token = req.cookies?.access;
  if (!token && opciones.bearer) { const m = /^Bearer (.+)$/.exec(req.get('authorization') || ''); token = m && m[1]; }
  if (!token) return res.status(401).json({ error: 'No autenticado', codigo: 'SIN_TOKEN' });
  try { req.user = await verificar(token); next(); }
  catch (e) { res.status(401).json({ error: 'Sesión inválida o vencida', codigo: e.code === 'ERR_JWT_EXPIRED' ? 'TOKEN_EXPIRADO' : 'TOKEN_INVALIDO' }); }
};

// Uso: requirePermiso('inventario.ver')  — basta con tener uno de los listados
const requirePermiso = (...permisos) => (req, res, next) =>
  permisos.some(p => req.user?.permisos.includes(p)) ? next() : res.status(403).json({ error: 'No tienes permiso para esto' });

// Defensa contra CSRF: las peticiones que modifican datos y traen Origin deben venir de un origen propio
const verificarOrigen = permitidos => (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origen = req.get('origin');
  if (!origen) return next();                       // llamadas de servidor a servidor no traen Origin
  try {
    const ok = permitidos ? permitidos.includes(origen) : new URL(origen).host === req.get('host');
    if (ok) return next();
  } catch { /* origen mal formado */ }
  res.status(403).json({ error: 'Origen no permitido' });
};
module.exports = { requireAuth, requirePermiso, verificarOrigen };
