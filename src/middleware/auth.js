const jwt = require('jsonwebtoken');

// Lee el JWT de la cookie httpOnly y deja req.user = { id, rol }
function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: p.sub, rol: p.rol };
    next();
  } catch {
    res.status(401).json({ error: 'Sesión inválida o vencida' });
  }
}

// Uso: requireRole('gerente', 'empleado')
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.rol) ? next() : res.status(403).json({ error: 'No tienes permiso para esto' });

module.exports = { requireAuth, requireRole };
