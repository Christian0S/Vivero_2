// Pruebas de humo de TODO el sistema: API, tokens, permisos, administración y separación de bases.
// Requiere la base ya cargada (npm run db:reset).   Uso: npm test
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs'), path = require('path');
const { Client } = require('pg');
const { envPara, RAIZ } = require('../scripts/lib-env');
const cfg = require('../src/config');
const { primerApellido } = require('../src/nombres');

const ID_PORT = 3098, NG_PORT = 3099, NG = `http://localhost:${NG_PORT}`, CLAVE = 'Vivero2026!';
const envId = envPara('identidad', { PORT: ID_PORT, APP_PORT: NG_PORT });
const envNg = envPara('negocio', { PORT: NG_PORT, IDENTIDAD_URL: `http://127.0.0.1:${ID_PORT}` });
const hijos = [
  spawn(process.execPath, [path.join(RAIZ, 'identidad', 'server.js')], { cwd: RAIZ, env: envId, stdio: 'inherit' }),
  spawn(process.execPath, [path.join(RAIZ, 'src', 'server.js')], { cwd: RAIZ, env: envNg, stdio: 'inherit' }),
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fallos = 0;
const check = (nombre, cond, extra = '') => { console.log(cond ? 'OK  ' : 'FAIL', nombre, extra); if (!cond) fallos++; };
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const deb64 = s => JSON.parse(Buffer.from(s, 'base64url').toString());

// Frasco de cookies mínimo (como un navegador)
class Jar {
  constructor() { this.c = new Map(); }
  guardar(res) {
    for (const sc of res.headers.getSetCookie()) {
      const [par] = sc.split(';'), i = par.indexOf('='), k = par.slice(0, i), v = par.slice(i + 1);
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(sc)) this.c.delete(k); else this.c.set(k, v);
    }
  }
  get header() { return [...this.c].map(([k, v]) => `${k}=${v}`).join('; '); }
}
async function pedir(jar, ruta, { method = 'GET', body, cookie, headers = {} } = {}) {
  const c = cookie ?? jar?.header;
  const res = await fetch(NG + ruta, {
    method, redirect: 'manual',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(c ? { Cookie: c } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  jar?.guardar(res);
  return { status: res.status, json: await res.json().catch(() => null), res };
}
const entrar = async (email, password = CLAVE) => { const jar = new Jar(); const r = await pedir(jar, '/api/auth/login', { method: 'POST', body: { email, password } }); return { jar, ...r }; };

const admin = async db => { const c = new Client({ ...cfg.pg, user: cfg.admin.user, password: cfg.admin.password, database: db }); await c.connect(); return c; };
async function comoApp(c, db, sql) {
  const cl = new Client({ ...cfg.pg, user: c.user, password: c.password, database: db });
  try { await cl.connect(); return { ok: true, rows: (await cl.query(sql)).rows }; }
  catch (e) { return { ok: false, msg: e.message }; }
  finally { await cl.end().catch(() => {}); }
}

(async () => {
  const inicio = new Date(Date.now() - 2000);
  const sufijo = Date.now();
  const emailPrueba = `test-${sufijo}@vivero.test`, emailBloqueo = `test-bloq-${sufijo}@vivero.test`;
  let idDb, ngDb;
  try {
    for (let t = 0; ; t++) {   // esperar a que ambos servicios respondan
      if (hijos.some(h => h.exitCode !== null)) throw new Error('Un servicio se cerró al arrancar (revisa el mensaje de arriba)');
      try { await fetch(`${NG}/api/catalogo`); await fetch(`http://127.0.0.1:${ID_PORT}/api/auth/refresh`, { method: 'POST' }); break; }
      catch { if (t > 100) throw new Error('Los servicios no respondieron en 30 segundos'); await sleep(300); }
    }
    idDb = await admin(cfg.identidad.database); ngDb = await admin(cfg.negocio.database);
    const jose = await import('jose');

    console.log('\n── Autenticación y cookies ──');
    check('sin sesión /api/me da 401', (await pedir(null, '/api/me')).status === 401);
    check('clave incorrecta da 401', (await entrar('gerente@vivero.com', 'x')).status === 401);
    const noExiste = await entrar('nadie@x.com');
    check('correo inexistente da el mismo mensaje (no revela cuentas)', noExiste.status === 401 && noExiste.json?.error === 'Correo o contraseña incorrectos');
    const G = await entrar('gerente@vivero.com');
    const sc = G.res.headers.getSetCookie(), acc = sc.find(x => x.startsWith('access=')), ref = sc.find(x => x.startsWith('refresh='));
    check('login gerente 200', G.status === 200);
    check('access y refresh son HttpOnly', /HttpOnly/i.test(acc) && /HttpOnly/i.test(ref));
    check('refresh solo viaja a /api/auth y es SameSite=Strict', /Path=\/api\/auth/i.test(ref) && /SameSite=Strict/i.test(ref));
    check('el token de acceso está firmado con EdDSA', deb64(G.jar.c.get('access').split('.')[0]).alg === 'EdDSA');
    const yo = await pedir(G.jar, '/api/me');
    check('/api/me trae rol, permisos y nombre corto', yo.json?.rol === 'gerente' && yo.json.permisos.includes('inventario.ver') && yo.json.nombreCorto === 'Miguel Ray', yo.json?.nombreCorto);
    check('las respuestas no incluyen contraseñas', !/password|hash/i.test(JSON.stringify(yo.json)));

    console.log('\n── Ataques contra el token ──');
    const [h, p, s] = G.jar.c.get('access').split('.'), carga = deb64(p);
    const tok = c => pedir(null, '/api/me', { cookie: `access=${c}` });
    check('payload alterado (rol=administrador) sin re-firmar -> rechazado', (await tok([h, b64({ ...carga, rol: 'administrador', perm: ['usuarios.admin'] }), s].join('.'))).json?.codigo === 'TOKEN_INVALIDO');
    const { privateKey: otra } = crypto.generateKeyPairSync('ed25519');
    const conOtraLlave = await new jose.SignJWT({ ...carga }).setProtectedHeader({ alg: 'EdDSA' }).sign(await jose.importPKCS8(otra.export({ type: 'pkcs8', format: 'pem' }), 'EdDSA'));
    check('token firmado con OTRA llave -> rechazado', (await tok(conOtraLlave)).status === 401);
    check('token con alg "none" -> rechazado', (await tok(`${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...carga, rol: 'administrador' })}.`)).status === 401);
    const pubPem = fs.readFileSync(path.join(RAIZ, 'keys/jwt-public.pem'));
    const confusion = await new jose.SignJWT({ ...carga, rol: 'administrador' }).setProtectedHeader({ alg: 'HS256' }).sign(pubPem);
    check('ataque de confusión HS256 (firmar con la llave pública) -> rechazado', (await tok(confusion)).status === 401);
    const privReal = await jose.importPKCS8(fs.readFileSync(path.join(RAIZ, 'keys/jwt-private.pem'), 'utf8'), 'EdDSA');
    const base = () => new jose.SignJWT({ ...carga }).setProtectedHeader({ alg: 'EdDSA' }).setSubject(carga.sub).setIssuer('srm-identidad');
    check('token vencido -> 401 TOKEN_EXPIRADO', (await tok(await base().setAudience('srm-vivero').setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(privReal))).json?.codigo === 'TOKEN_EXPIRADO');
    check('token válido pero para otra aplicación -> rechazado', (await tok(await base().setAudience('otra-app').setExpirationTime('5m').sign(privReal))).status === 401);
    check('token basura -> 401', (await tok('abc.def.ghi')).status === 401);

    console.log('\n── Renovación rotativa de sesión ──');
    const refViejo = G.jar.c.get('refresh'), accViejo = G.jar.c.get('access');
    const R1 = await pedir(G.jar, '/api/auth/refresh', { method: 'POST' });
    check('refresh da 200 y entrega cookies nuevas', R1.status === 200 && G.jar.c.get('refresh') !== refViejo && G.jar.c.get('access') !== accViejo);
    check('con el token nuevo /api/me sigue funcionando', (await pedir(G.jar, '/api/me')).status === 200);
    const gracia = await pedir(null, '/api/auth/refresh', { method: 'POST', cookie: `refresh=${refViejo}` });
    check('repetir el refresh de inmediato (dos pestañas) -> 409, no es un ataque', gracia.status === 409 && gracia.json?.codigo === 'REFRESH_EN_CURSO');
    const huella = crypto.createHash('sha256').update(refViejo).digest('hex');
    await idDb.query("UPDATE sesion SET rotada_en = now() - interval '1 minute' WHERE refresh_huella = $1", [huella]);   // simula que pasó la gracia
    const robo = await pedir(null, '/api/auth/refresh', { method: 'POST', cookie: `refresh=${refViejo}` });
    check('reutilizar un refresh ya usado (robo) -> 401', robo.status === 401);
    check('...y se revoca TODA la cadena: el refresh legítimo también cae', (await pedir(G.jar, '/api/auth/refresh', { method: 'POST' })).status === 401);
    check('...y queda registrado como evento de seguridad', (await idDb.query("SELECT 1 FROM evento_seguridad WHERE tipo = 'refresh_reutilizado' AND creado_en >= $1", [inicio])).rowCount >= 1);
    const L = await entrar('gerente@vivero.com'), refL = L.jar.c.get('refresh');
    await pedir(L.jar, '/api/auth/logout', { method: 'POST' });
    check('después de cerrar sesión el refresh ya no sirve', (await pedir(null, '/api/auth/refresh', { method: 'POST', cookie: `refresh=${refL}` })).status === 401);

    console.log('\n── Permisos por rol ──');
    const G2 = await entrar('gerente@vivero.com'), E = await entrar('empleado@vivero.com'), P = await entrar('proveedor@vivero.com'), A = await entrar('admin@vivero.com');
    check('gerente ve inventario y proveedores', (await pedir(G2.jar, '/api/productos')).status === 200 && (await pedir(G2.jar, '/api/proveedores')).status === 200);
    check('gerente NO administra usuarios (403)', (await pedir(G2.jar, '/api/admin/usuarios')).status === 403);
    check('empleado ve inventario', (await pedir(E.jar, '/api/productos')).status === 200);
    check('proveedor NO ve inventario ni proveedores (403)', (await pedir(P.jar, '/api/productos')).status === 403 && (await pedir(P.jar, '/api/proveedores')).status === 403);
    const dp = await pedir(P.jar, '/api/dashboard');
    check('dashboard del proveedor: solo lo suyo', dp.status === 200 && dp.json.rol === 'proveedor' && !!dp.json.proveedor, dp.json?.proveedor);
    check('el proveedor NO recibe calificaciones ni promedios', !/promedio|calificacion|puntaje/i.test(JSON.stringify(dp.json)));
    const dg = await pedir(G2.jar, '/api/dashboard');
    check('dashboard del gerente trae KPIs', dg.json?.kpis?.productos === 100 && dg.json.kpis.bajoStock === 23, JSON.stringify(dg.json?.kpis));

    console.log('\n── Administración de usuarios ──');
    const lista = await pedir(A.jar, '/api/admin/usuarios');
    check('administrador lista las cuentas con su nombre', lista.status === 200 && lista.json.length >= 4 && lista.json.some(u => u.nombreCorto === 'Juan Vargas'));
    const miId = (await pedir(A.jar, '/api/me')).json.id;
    check('crear usuario sin nombre/apellido -> 400', (await pedir(A.jar, '/api/admin/usuarios', { method: 'POST', body: { email: emailPrueba, rol: 'proveedor' } })).status === 400);
    check('crear usuario con correo inválido -> 400', (await pedir(A.jar, '/api/admin/usuarios', { method: 'POST', body: { email: 'no-es-correo', rol: 'proveedor', nombre: 'A', apellidos: 'B' } })).status === 400);
    check('crear usuario con rol inexistente -> 400', (await pedir(A.jar, '/api/admin/usuarios', { method: 'POST', body: { email: emailPrueba, rol: 'superheroe', nombre: 'A', apellidos: 'B' } })).status === 400);
    const nuevo = await pedir(A.jar, '/api/admin/usuarios', { method: 'POST', body: { email: emailPrueba, rol: 'proveedor', nombre: 'Prueba', apellidos: 'De la Cruz Test' } });
    check('crear usuario -> 201 con clave temporal', nuevo.status === 201 && nuevo.json.claveTemporal?.length === 14);
    check('correo repetido -> 409', (await pedir(A.jar, '/api/admin/usuarios', { method: 'POST', body: { email: emailPrueba.toUpperCase(), rol: 'proveedor', nombre: 'A', apellidos: 'B' } })).status === 409);
    check('gerente NO puede crear usuarios (403)', (await pedir(G2.jar, '/api/admin/usuarios', { method: 'POST', body: { email: 'x@y.co', rol: 'gerente', nombre: 'A', apellidos: 'B' } })).status === 403);
    const U = await entrar(emailPrueba, nuevo.json.claveTemporal), uMe = await pedir(U.jar, '/api/me');
    check('el usuario nuevo entra con la clave temporal y debe cambiarla', U.status === 200 && uMe.json?.debeCambiarClave === true && uMe.json.nombreCorto === 'Prueba De la Cruz', uMe.json?.nombreCorto);
    const nueva = 'Mi-Clave-Segura-2026';
    check('cambiar clave: la actual incorrecta -> 400', (await pedir(U.jar, '/api/auth/cambiar-clave', { method: 'POST', body: { actual: 'mala', nueva } })).status === 400);
    check('cambiar clave: contraseña débil (corta) -> 400', (await pedir(U.jar, '/api/auth/cambiar-clave', { method: 'POST', body: { actual: nuevo.json.claveTemporal, nueva: 'corta1' } })).status === 400);
    check('cambiar clave: contiene el correo -> 400', (await pedir(U.jar, '/api/auth/cambiar-clave', { method: 'POST', body: { actual: nuevo.json.claveTemporal, nueva: `${emailPrueba.split('@')[0]}123456` } })).status === 400);
    const cc = await pedir(U.jar, '/api/auth/cambiar-clave', { method: 'POST', body: { actual: nuevo.json.claveTemporal, nueva } });
    check('cambiar clave válida -> 200 y ya no debe cambiarla', cc.status === 200 && (await pedir(U.jar, '/api/me')).json?.debeCambiarClave === false);
    check('la clave temporal ya no sirve; la nueva sí', (await entrar(emailPrueba, nuevo.json.claveTemporal)).status === 401 && (await entrar(emailPrueba, nueva)).status === 200);

    check('el administrador no puede cambiar su propio rol (anti-bloqueo)', (await pedir(A.jar, `/api/admin/usuarios/${miId}`, { method: 'PATCH', body: { rol: 'gerente' } })).status === 400);
    check('el administrador no puede desactivarse a sí mismo', (await pedir(A.jar, `/api/admin/usuarios/${miId}`, { method: 'PATCH', body: { activo: false } })).status === 400);
    const U2 = await entrar(emailPrueba, nueva);
    const cambioRol = await pedir(A.jar, `/api/admin/usuarios/${nuevo.json.id}`, { method: 'PATCH', body: { rol: 'empleado' } });
    check('cambiar el rol cierra sus sesiones abiertas', cambioRol.status === 200 && (await pedir(U2.jar, '/api/auth/refresh', { method: 'POST' })).status === 401);
    const U3 = await entrar(emailPrueba, nueva);
    check('con el rol nuevo obtiene los permisos nuevos (empleado ve inventario)', (await pedir(U3.jar, '/api/productos')).status === 200);
    const reset = await pedir(A.jar, `/api/admin/usuarios/${nuevo.json.id}/reset-clave`, { method: 'POST' });
    const U4 = await entrar(emailPrueba, reset.json?.claveTemporal || 'x');
    check('restablecer clave: entra con la temporal y debe cambiarla', reset.status === 200 && U4.status === 200 && (await pedir(U4.jar, '/api/me')).json?.debeCambiarClave === true);
    check('...y las sesiones anteriores quedaron cerradas', (await pedir(U3.jar, '/api/auth/refresh', { method: 'POST' })).status === 401);
    await pedir(A.jar, `/api/admin/usuarios/${nuevo.json.id}`, { method: 'PATCH', body: { activo: false } });
    check('usuario desactivado no puede entrar', (await entrar(emailPrueba, reset.json.claveTemporal)).status === 401);

    console.log('\n── Matriz de permisos ──');
    const mat = await pedir(A.jar, '/api/admin/permisos');
    check('el administrador ve roles, permisos y asignaciones', mat.status === 200 && mat.json.roles.length === 4 && mat.json.permisos.length >= 5);
    check('gerente NO cambia permisos (403)', (await pedir(G2.jar, '/api/admin/permisos', { method: 'PUT', body: { rol: 'proveedor', permiso: 'inventario.ver', otorgado: true } })).status === 403);
    check('al administrador no se le pueden quitar permisos', (await pedir(A.jar, '/api/admin/permisos', { method: 'PUT', body: { rol: 'administrador', permiso: 'usuarios.admin', otorgado: false } })).status === 400);
    check('otorgar un permiso -> 200', (await pedir(A.jar, '/api/admin/permisos', { method: 'PUT', body: { rol: 'proveedor', permiso: 'inventario.ver', otorgado: true } })).status === 200);
    const P2 = await entrar('proveedor@vivero.com');
    check('...y rige para el siguiente login (proveedor ahora ve inventario)', (await pedir(P2.jar, '/api/productos')).status === 200);
    await pedir(A.jar, '/api/admin/permisos', { method: 'PUT', body: { rol: 'proveedor', permiso: 'inventario.ver', otorgado: false } });
    check('...y al quitarlo vuelve el 403', (await pedir((await entrar('proveedor@vivero.com')).jar, '/api/productos')).status === 403);

    console.log('\n── Fuerza bruta (límite guardado en la base de datos) ──');
    await pedir(A.jar, '/api/admin/usuarios', { method: 'POST', body: { email: emailBloqueo, rol: 'proveedor', nombre: 'Bloqueo', apellidos: 'Prueba' } });
    const codigos = []; for (let i = 0; i < 6; i++) codigos.push((await entrar(emailBloqueo, 'mala-clave')).status);
    check('el 6.º intento fallido queda bloqueado (429)', codigos.join() === '401,401,401,401,401,429', codigos.join());
    check('el bloqueo queda registrado en la base de datos', (await idDb.query("SELECT 1 FROM evento_seguridad WHERE tipo = 'bloqueo' AND lower(email_intentado) = $1", [emailBloqueo])).rowCount >= 1);
    check('Origin ajeno en un POST -> 403 (anti-CSRF)', (await pedir(null, '/api/auth/login', { method: 'POST', body: { email: 'x@y.co', password: 'z' }, headers: { Origin: 'http://sitio-malo.example' } })).status === 403);
    check('Origin propio -> permitido', (await pedir(null, '/api/auth/login', { method: 'POST', body: { email: 'x@y.co', password: 'z' }, headers: { Origin: NG } })).status === 401);

    console.log('\n── Público, front y cabeceras ──');
    const cat = await pedir(null, '/api/catalogo');
    check('catálogo público sin sesión (100 productos)', cat.status === 200 && cat.json.length === 100);
    const claves = Object.keys(cat.json[0]);
    check('catálogo NO expone proveedor, stock ni costos', !['proveedor', 'proveedor_id', 'stock', 'stock_minimo', 'precio_base'].some(k => claves.includes(k)), claves.join(','));
    check('apellido compuesto "De la Cruz Rojas" -> "De la Cruz"', primerApellido('De la Cruz Rojas') === 'De la Cruz');
    const raiz = await fetch(`${NG}/`), login = await fetch(`${NG}/login.html`);
    check('sirve catálogo (/) y /login.html con cabeceras de seguridad', raiz.status === 200 && login.status === 200 && raiz.headers.get('x-frame-options') === 'DENY');
    check('ruta de API inexistente da 404', (await pedir(null, '/api/nada')).status === 404);

    console.log('\n── Separación de servicios y bases ──');
    check('la API del negocio NO recibe credenciales de identidad ni la llave privada', !Object.keys(envNg).some(k => /IDENTIDAD_(DB|USER|PASSWORD)|PRIVATE|PG_ADMIN/.test(k)));
    check('el servicio de identidad NO recibe credenciales del negocio', !Object.keys(envId).some(k => /NEGOCIO_|PG_ADMIN/.test(k)));
    check('usuario de identidad NO puede entrar a la base del negocio', !(await comoApp(cfg.identidad, cfg.negocio.database, 'SELECT 1')).ok);
    check('usuario del negocio NO puede entrar a la base de identidad', !(await comoApp(cfg.negocio, cfg.identidad.database, 'SELECT 1')).ok);
    check('la app NO puede crear ni borrar tablas', !(await comoApp(cfg.negocio, cfg.negocio.database, 'CREATE TABLE intruso(x int)')).ok && !(await comoApp(cfg.negocio, cfg.negocio.database, 'DROP TABLE producto')).ok);
    const ins = await comoApp(cfg.negocio, cfg.negocio.database, "INSERT INTO auditoria(accion, detalle) VALUES ('prueba', 'smoke')");
    check('la auditoría admite INSERT...', ins.ok, ins.msg);
    check('...pero NO UPDATE, DELETE ni TRUNCATE (inalterable)', !(await comoApp(cfg.negocio, cfg.negocio.database, "UPDATE auditoria SET detalle = 'x'")).ok
      && !(await comoApp(cfg.negocio, cfg.negocio.database, 'DELETE FROM auditoria')).ok && !(await comoApp(cfg.negocio, cfg.negocio.database, 'TRUNCATE auditoria')).ok);
    check('los eventos de seguridad también son inalterables', !(await comoApp(cfg.identidad, cfg.identidad.database, "UPDATE evento_seguridad SET tipo = 'login_ok'")).ok
      && !(await comoApp(cfg.identidad, cfg.identidad.database, 'DELETE FROM evento_seguridad')).ok);
    check('la app NO ve el control de migraciones', !(await comoApp(cfg.identidad, cfg.identidad.database, 'SELECT * FROM schema_migrations')).ok);
    check('en la base solo hay huellas de los refresh, nunca el token', (await comoApp(cfg.identidad, cfg.identidad.database, "SELECT 1 FROM sesion WHERE refresh_huella = '" + G2.jar.c.get('refresh') + "'")).rows.length === 0);

    console.log('\n── Resiliencia: si identidad se cae ──');
    hijos[0].kill(); await sleep(800);
    check('con identidad caída, quien ya tiene sesión sigue trabajando (solo se verifica la firma)', (await pedir(G2.jar, '/api/productos')).status === 200);
    check('...pero iniciar sesión da un 502 claro, sin colgarse', (await pedir(null, '/api/auth/login', { method: 'POST', body: { email: 'a@b.co', password: 'x' } })).status === 502);
  } catch (e) { console.error('\nNo se pudo ejecutar la prueba:', e.message); fallos++; }
  finally {
    try {   // limpieza de lo que crearon las pruebas
      if (idDb && ngDb) {
        const ids = (await idDb.query("SELECT id FROM cuenta WHERE email LIKE 'test-%@vivero.test'")).rows.map(r => r.id);
        await idDb.query("DELETE FROM evento_seguridad WHERE creado_en >= $1 AND (tipo IN ('login_fallido','bloqueo') OR email_intentado LIKE 'test-%@vivero.test')", [inicio]);
        await idDb.query('DELETE FROM sesion WHERE cuenta_id = ANY($1)', [ids]);
        await idDb.query('DELETE FROM cuenta WHERE id = ANY($1)', [ids]);
        await ngDb.query('DELETE FROM perfil WHERE cuenta_id = ANY($1)', [ids]);
        await ngDb.query("DELETE FROM auditoria WHERE accion = 'prueba'");
      }
    } catch (e) { console.error('Limpieza:', e.message); }
    await idDb?.end().catch(() => {}); await ngDb?.end().catch(() => {});
    hijos.forEach(h => h.kill());
  }
  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodo correcto');
  process.exit(fallos ? 1 : 0);
})();
