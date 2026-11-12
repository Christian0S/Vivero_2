// Prueba de humo de la API: node test/smoke.js  (usa la BD ya sembrada con npm run seed)
const { spawn } = require('child_process');
const crypto = require('crypto');
const { Client } = require('pg');
const cfg = require('../src/config');
const { primerApellido } = require('../src/nombres');
const PORT = 3099, B = `http://localhost:${PORT}/api`;
const env = { ...process.env, PORT, JWT_SECRET: crypto.randomBytes(48).toString('hex') };
const srv = spawn(process.execPath, ['src/server.js'], { env, stdio: 'inherit' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fallos = 0;
const check = (nombre, cond, extra = '') => { console.log(cond ? 'OK  ' : 'FAIL', nombre, extra); if (!cond) fallos++; };

const call = async (path, { method = 'GET', body, cookie } = {}) => {
  const res = await fetch(B + path, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  return { status: res.status, json: await res.json().catch(() => null), set };
};
const login = (email, password = 'Vivero2026!') => call('/auth/login', { method: 'POST', body: { email, password } });

// Espera a que el servidor de prueba responda (en algunos equipos tarda varios segundos en encender)
async function esperarServidor(maxMs = 30000) {
  const fin = Date.now() + maxMs;
  while (Date.now() < fin) {
    if (srv.exitCode !== null) throw new Error('El servidor de prueba se cerró al arrancar (revisa el mensaje de arriba)');
    try { await fetch(`${B}/auth/me`); return; } catch { await sleep(300); }
  }
  throw new Error('El servidor de prueba no respondió en 30 segundos');
}

(async () => {
  try {
    await esperarServidor();
    check('sin sesión -> /me da 401', (await call('/auth/me')).status === 401);
    check('clave incorrecta da 401', (await login('gerente@vivero.com', 'x')).status === 401);
    check('correo inexistente da 401 (mismo mensaje)', (await login('nadie@x.com')).json?.error === 'Correo o contraseña incorrectos');

    const g = await login('gerente@vivero.com');
    check('login gerente da 200 y rol', g.status === 200 && g.json.rol === 'gerente');
    check('cookie es HttpOnly', /HttpOnly/i.test(g.set || ''));
    const ck = g.set.split(';')[0];
    check('/me con sesión', (await call('/auth/me', { cookie: ck })).json?.email === 'gerente@vivero.com');
    const pv = await call('/proveedores', { cookie: ck });
    check('gerente ve proveedores', pv.status === 200 && pv.json.length === 20, `(${pv.json?.length})`);

    const p = await login('proveedor@vivero.com');
    check('proveedor NO ve proveedores (403)', (await call('/proveedores', { cookie: p.set.split(';')[0] })).status === 403);
    check('token falso da 401', (await call('/auth/me', { cookie: 'token=abc.def.ghi' })).status === 401);

    const dg = await call('/dashboard', { cookie: ck });
    check('dashboard gerente trae KPIs', dg.status === 200 && dg.json.kpis.productos === 100 && dg.json.kpis.bajoStock === 23, JSON.stringify(dg.json?.kpis));
    const dp = await call('/dashboard', { cookie: p.set.split(';')[0] });
    check('dashboard proveedor ve solo lo suyo', dp.status === 200 && dp.json.rol === 'proveedor' && !!dp.json.proveedor, dp.json?.proveedor);
    check('el proveedor NO recibe calificaciones ni promedios', !/promedio|calificacion|puntaje/i.test(JSON.stringify(dp.json)));
    check('las respuestas no incluyen contraseñas', !/password|hash/i.test(JSON.stringify((await call('/auth/me', { cookie: ck })).json)));
    check('gerente lista 100 productos', (await call('/productos', { cookie: ck })).json?.length === 100);
    check('proveedor NO ve productos (403)', (await call('/productos', { cookie: p.set.split(';')[0] })).status === 403);
    // catálogo público: sin sesión, sin datos internos
    const cat = await call('/catalogo');
    check('catálogo público responde sin sesión (100 productos)', cat.status === 200 && cat.json.length === 100, `(${cat.json?.length})`);
    const claves = Object.keys(cat.json[0]);
    check('catálogo NO expone proveedor, stock ni costos', !['proveedor', 'proveedor_id', 'stock', 'stock_minimo', 'precio_base'].some(k => claves.includes(k)), claves.join(','));
    check('disponibilidad válida', cat.json.every(p => ['disponible', 'pocas', 'agotado'].includes(p.disponibilidad)));
    // nombre corto = primer nombre + primer apellido
    check('/me trae nombre corto del gerente', (await call('/auth/me', { cookie: ck })).json?.nombreCorto === 'Miguel Ray');
    const em = await login('empleado@vivero.com');
    check('login empleado devuelve "Juan Vargas" y rol', em.json?.nombreCorto === 'Juan Vargas' && em.json?.rol === 'empleado', em.json?.nombreCorto);
    check('apellido compuesto "De la Cruz Rojas" -> "De la Cruz"', primerApellido('De la Cruz Rojas') === 'De la Cruz');
    check('página de ingreso en /login.html', (await fetch(`http://localhost:${PORT}/login.html`)).status === 200);
    const html = await fetch(`http://localhost:${PORT}/`);
    check('sirve el front y cabeceras de seguridad', html.status === 200 && html.headers.get('x-frame-options') === 'DENY');

    // ── Separación de bases y permisos (lo que protege ante un ataque) ──
    const como = async (c, db, sql) => {
      const cl = new Client({ ...cfg.pg, user: c.user, password: c.password, database: db });
      try { await cl.connect(); const r = await cl.query(sql); return { ok: true, rows: r.rows }; }
      catch (e) { return { ok: false, msg: e.message }; }
      finally { await cl.end().catch(() => {}); }
    };
    check('usuario de identidad NO puede entrar a la base del negocio', !(await como(cfg.identidad, cfg.negocio.database, 'SELECT 1')).ok);
    check('usuario del negocio NO puede entrar a la base de identidad', !(await como(cfg.negocio, cfg.identidad.database, 'SELECT 1')).ok);
    check('la app NO puede crear ni borrar tablas', !(await como(cfg.negocio, cfg.negocio.database, 'CREATE TABLE intruso(x int)')).ok && !(await como(cfg.negocio, cfg.negocio.database, 'DROP TABLE producto')).ok);
    const ins = await como(cfg.negocio, cfg.negocio.database, "INSERT INTO auditoria(accion, detalle) VALUES ('prueba', 'smoke')");
    check('la auditoría admite INSERT...', ins.ok, ins.msg);
    check('...pero NO UPDATE, DELETE ni TRUNCATE (inalterable)', !(await como(cfg.negocio, cfg.negocio.database, "UPDATE auditoria SET detalle = 'x'")).ok
      && !(await como(cfg.negocio, cfg.negocio.database, 'DELETE FROM auditoria')).ok && !(await como(cfg.negocio, cfg.negocio.database, 'TRUNCATE auditoria')).ok);
    check('la app NO ve el control de migraciones', !(await como(cfg.identidad, cfg.identidad.database, 'SELECT * FROM schema_migrations')).ok);
    const ev = await como(cfg.identidad, cfg.identidad.database, "SELECT COUNT(*)::int n FROM evento_seguridad WHERE tipo IN ('login_ok','login_fallido')");
    check('los inicios de sesión quedan registrados', ev.ok && ev.rows[0].n >= 5, ev.rows?.[0]?.n);

    let codigos = [];
    for (let i = 0; i < 6; i++) codigos.push((await login('proveedor@vivero.com', 'mala')).status);
    check('6.º intento fallido queda bloqueado (429)', codigos.join() === '401,401,401,401,401,429', codigos.join());
    check('ruta inexistente da 404', (await call('/nada')).status === 404);
  } catch (e) { console.error('\nNo se pudo ejecutar la prueba:', e.message); fallos++; }
  finally { srv.kill(); }
  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodo correcto');
  process.exit(fallos ? 1 : 0);
})();
