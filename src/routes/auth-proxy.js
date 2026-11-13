// Reenvía /api/auth/* al servicio de identidad (para que el navegador vea un solo origen y las cookies funcionen).
// En producción esto lo hace el proxy inverso (Caddy); aquí es la versión mínima para desarrollo.
module.exports = () => async (req, res) => {
  const base = process.env.IDENTIDAD_URL || 'http://127.0.0.1:3001';
  const headers = { cookie: req.get('cookie') || '', 'user-agent': req.get('user-agent') || '', 'x-forwarded-for': req.ip };
  if (req.get('origin')) headers.origin = req.get('origin');
  let body;
  if (!['GET', 'HEAD'].includes(req.method)) { headers['content-type'] = 'application/json'; body = JSON.stringify(req.body ?? {}); }
  let r;
  try { r = await fetch(base + req.originalUrl, { method: req.method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(10000) }); }
  catch { return res.status(502).json({ error: 'El servicio de identidad no está disponible' }); }
  const cookies = r.headers.getSetCookie();
  if (cookies.length) res.append('Set-Cookie', cookies);
  res.status(r.status).type('application/json').send(Buffer.from(await r.arrayBuffer()));
};
