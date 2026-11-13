// Registro de eventos de seguridad (la tabla es solo de inserción: nadie puede alterarla desde la app).
const evento = (db, req, { cuentaId = null, email = null, tipo, actorId = null, detalle = null }) =>
  db.run('INSERT INTO evento_seguridad(cuenta_id, email_intentado, tipo, ip, agente, actor_id, detalle) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [cuentaId, email, tipo, req.ip, String(req.get('user-agent') || '').slice(0, 200), actorId, detalle])
    .catch(e => console.error('evento_seguridad:', e.message));
module.exports = { evento };
