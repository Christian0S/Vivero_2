// Pruebas de humo de TODO el sistema: API, tokens, permisos, administración y separación de bases.
// Requiere la base ya cargada (npm run db:reset).   Uso: npm test
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs'), path = require('path');
const { Client } = require('pg');
const { envPara, RAIZ } = require('../scripts/lib-env');
const cfg = require('../src/config');
const { primerApellido } = require('../src/nombres');
const { normalizar, puedeWhatsapp } = require('../compartido/telefonos');
const { pathToFileURL } = require('url');

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
async function pedir(jar, ruta, { method = 'GET', body, raw, tipo, cookie, headers = {} } = {}) {
  const c = cookie ?? jar?.header;
  const res = await fetch(NG + ruta, {
    method, redirect: 'manual',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(raw ? { 'Content-Type': tipo } : {}), ...(c ? { Cookie: c } : {}), ...headers },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
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

    console.log('\n── Gestión de productos ──');
    const P_ = (jar, metodo, ruta, body) => pedir(jar, `/api/productos${ruta}`, { method: metodo, body });
    check('sin sesión no se crean productos (401)', (await P_(null, 'POST', '', {})).status === 401);
    check('empleado NO crea, edita, ni activa productos (403)', (await P_(E.jar, 'POST', '', {})).status === 403 && (await P_(E.jar, 'PUT', '/1', {})).status === 403 && (await P_(E.jar, 'PATCH', '/1/activo', { activo: false })).status === 403);
    check('empleado NO ve las opciones del formulario (403)', (await P_(E.jar, 'GET', '/opciones')).status === 403);
    check('proveedor NO toca el inventario (403)', (await P_(P.jar, 'POST', '', {})).status === 403);
    const op = (await P_(G2.jar, 'GET', '/opciones')).json;
    check('el gerente recibe categorías, proveedores activos y los valores por defecto de Parámetros', op.categorias.length === 4 && op.proveedores.length === 20 && op.defaults.iva === 19 && op.defaults.stock_minimo === 5, JSON.stringify(op.defaults));
    const vistaE = (await P_(E.jar, 'GET', '')).json[0], vistaG = (await P_(G2.jar, 'GET', '')).json[0];
    check('quien solo consulta NO ve costos ni márgenes; quien edita sí', !('precio_base' in vistaE) && !('pct_ganancia' in vistaE) && 'precio_base' in vistaG && 'activo' in vistaG);

    const prov0 = op.proveedores[0];
    const prodBase = { nombre: 'Prueba Helecho', descripcion: 'Planta de sombra', categoria_id: prov0.categoria_id, proveedor_id: prov0.id, precio_base: 10000, pct_ganancia: 30, pct_iva: 19, stock: 3, stock_minimo: 5 };
    const malo = async (cambios, etiqueta) => check(`validación: ${etiqueta} -> 400`, (await P_(G2.jar, 'POST', '', { ...prodBase, ...cambios })).status === 400);
    await malo({ nombre: '' }, 'nombre vacío'); await malo({ nombre: 'A' }, 'nombre de 1 letra'); await malo({ nombre: 'x'.repeat(121) }, 'nombre de 121 letras');
    await malo({ descripcion: 'x'.repeat(501) }, 'descripción de 501 letras');
    await malo({ categoria_id: 9999 }, 'categoría inexistente'); await malo({ proveedor_id: 9999 }, 'proveedor inexistente');
    await malo({ precio_base: -1 }, 'costo negativo'); await malo({ precio_base: 10.5 }, 'costo con decimales'); await malo({ precio_base: '10000' }, 'costo como texto'); await malo({ precio_base: 100000001 }, 'costo desmedido');
    await malo({ pct_ganancia: 1001 }, 'ganancia sobre 1000'); await malo({ pct_ganancia: -5 }, 'ganancia negativa'); await malo({ pct_ganancia: 10.123 }, 'ganancia con 3 decimales');
    await malo({ pct_iva: 101 }, 'IVA sobre 100'); await malo({ stock: -1 }, 'stock negativo'); await malo({ stock: 1.5 }, 'stock decimal'); await malo({ stock_minimo: -2 }, 'stock mínimo negativo');
    check('validación: no se acepta un precio de venta enviado a mano', (await P_(G2.jar, 'POST', '', { ...prodBase, precio_venta: 1 })).status === 400);
    check('validación: campos desconocidos se rechazan', (await P_(G2.jar, 'POST', '', { ...prodBase, activo: false })).status === 400);
    const faltante = { ...prodBase }; delete faltante.stock;
    check('validación: faltar un campo obligatorio -> 400', (await P_(G2.jar, 'POST', '', faltante)).status === 400);
    const provId = prov0.id;
    await ngDb.query('UPDATE proveedor SET activo = false WHERE id = $1', [provId]);
    const conInactivo = await P_(G2.jar, 'POST', '', prodBase);
    await ngDb.query('UPDATE proveedor SET activo = true WHERE id = $1', [provId]);
    check('validación: no se crea un producto con un proveedor inactivo', conInactivo.status === 400 && /inactivo/.test(conInactivo.json?.error || ''));

    const bajosAntes = (await pedir(G2.jar, '/api/dashboard')).json.kpis.bajoStock;
    const nuevoP = await P_(G2.jar, 'POST', '', prodBase);
    check('crear producto -> 201 con el precio de venta calculado por el servidor (10.000 × 1,30 × 1,19 = 15.470)', nuevoP.status === 201 && nuevoP.json.precio_venta === 15470, nuevoP.json?.precio_venta);
    const pid = nuevoP.json?.id;
    check('el producto nuevo aparece en el inventario y en el catálogo público como "pocas unidades"', (await P_(G2.jar, 'GET', '')).json.some(p => p.id === pid) && (await pedir(null, '/api/catalogo')).json.some(p => p.nombre === 'Prueba Helecho' && p.disponibilidad === 'pocas'));
    check('la alerta de stock bajo lo cuenta (+1)', (await pedir(G2.jar, '/api/dashboard')).json.kpis.bajoStock === bajosAntes + 1);
    check('queda registrado quién lo creó y la auditoría', (await ngDb.query("SELECT 1 FROM auditoria WHERE accion = 'producto_creado' AND entidad_id = $1", [pid])).rowCount === 1);

    const edit = await P_(G2.jar, 'PUT', `/${pid}`, { ...prodBase, precio_base: 20000, stock: 50 });
    check('editar: el precio se recalcula (20.000 × 1,30 × 1,19 = 30.940)', edit.status === 200 && edit.json.precio_venta === 30940 && edit.json.stock === 50);
    const aud = (await ngDb.query("SELECT detalle FROM auditoria WHERE accion = 'producto_modificado' AND entidad_id = $1", [pid])).rows;
    check('la auditoría guarda cada campo cambiado como [antes, después]', aud.length === 1 && JSON.parse(aud[0].detalle).precio_base[0] === 10000 && JSON.parse(aud[0].detalle).precio_base[1] === 20000 && JSON.parse(aud[0].detalle).stock[1] === 50);
    await P_(G2.jar, 'PUT', `/${pid}`, { ...prodBase, precio_base: 20000, stock: 50 });
    check('guardar sin cambios NO ensucia la auditoría', (await ngDb.query("SELECT 1 FROM auditoria WHERE accion = 'producto_modificado' AND entidad_id = $1", [pid])).rowCount === 1);
    check('la alerta baja cuando se repone el stock (stock 50 > mínimo 5)', (await pedir(G2.jar, '/api/dashboard')).json.kpis.bajoStock === bajosAntes);
    check('editar un producto que no existe -> 404', (await P_(G2.jar, 'PUT', '/999999', prodBase)).status === 404 && (await P_(G2.jar, 'PUT', '/abc', prodBase)).status === 404);

    const off = await P_(G2.jar, 'PATCH', `/${pid}/activo`, { activo: false });
    check('desactivar: deja de verse en el catálogo y en el inventario normal', off.status === 200 && off.json.activo === false
      && !(await pedir(null, '/api/catalogo')).json.some(p => p.nombre === 'Prueba Helecho') && !(await P_(G2.jar, 'GET', '')).json.some(p => p.id === pid));
    check('...pero quien edita lo ve con "mostrar inactivos"; quien consulta, no', (await P_(G2.jar, 'GET', '?inactivos=1')).json.some(p => p.id === pid && p.activo === false) && !(await P_(E.jar, 'GET', '?inactivos=1')).json.some(p => p.id === pid));
    check('activar de nuevo lo devuelve al catálogo', (await P_(G2.jar, 'PATCH', `/${pid}/activo`, { activo: true })).status === 200 && (await pedir(null, '/api/catalogo')).json.some(p => p.nombre === 'Prueba Helecho'));
    await P_(G2.jar, 'PATCH', `/${pid}/activo`, { activo: false });   // el producto de prueba no debe contar en lo que sigue
    check('activar sin indicar el estado -> 400', (await P_(G2.jar, 'PATCH', `/${pid}/activo`, {})).status === 400);
    check('la base rechaza un IVA o una ganancia fuera de rango aunque se salte la API',
      !(await comoApp(cfg.negocio, cfg.negocio.database, "INSERT INTO producto(nombre, precio_base, precio_venta, pct_iva) VALUES ('x', 1, 1, 150)")).ok
      && !(await comoApp(cfg.negocio, cfg.negocio.database, "INSERT INTO producto(nombre, precio_base, precio_venta, pct_ganancia) VALUES ('x', 1, 1, 5000)")).ok);
    const pf = await import(pathToFileURL(path.join(RAIZ, 'public/js/precios.js')).href), pb = require('../compartido/precios');
    let iguales = true; for (let i = 0; i < 500; i++) { const a = Math.floor(Math.random() * 5e6), g = Math.round(Math.random() * 100000) / 100, v = Math.round(Math.random() * 10000) / 100; if (pf.calcularPrecioVenta(a, g, v) !== pb.calcularPrecioVenta(a, g, v)) iguales = false; }
    check('la fórmula del formulario (navegador) y la del servidor dan siempre lo mismo (500 casos)', iguales);

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

    console.log('\n── Teléfonos y WhatsApp de proveedores ──');
    const n = v => { const r = normalizar(v); return r.ok ? r.e164 : null; };
    check('celular sin indicativo (3101234567) -> +573101234567', n('3101234567') === '+573101234567');
    check('con espacios, guiones o paréntesis -> mismo resultado', ['310 123 4567', '(310) 123-4567', '310-123-4567', '+57 310 123 4567', '573101234567', '0057 310 123 4567'].every(v => n(v) === '+573101234567'));
    check('prefijo incorrecto: "+" sin el 57 (+3101234567) -> se corrige', n('+3101234567') === '+573101234567');
    check('prefijo incorrecto: 57 repetido (+57 57 310…) -> se corrige', n('+57 57 310 123 4567') === '+573101234567');
    check('un fijo (601…) se normaliza pero NO recibe WhatsApp', n('6011234567') === '+576011234567' && !puedeWhatsapp('+576011234567') && puedeWhatsapp('+573101234567'));
    check('número extranjero válido se respeta (+1 555…)', n('+1 555 123 4567') === '+15551234567');
    check('7 dígitos, texto o número corto NO se aceptan (no se inventa nada)', !normalizar('1234567').ok && !normalizar('abc').ok && !normalizar('+57 12').ok);
    check('vacío es válido y queda sin teléfono', normalizar('').ok && normalizar('   ').e164 === null && normalizar(null).e164 === null);
    const provs = (await pedir(G2.jar, '/api/proveedores')).json;
    check('los 20 proveedores quedan con teléfono internacional', provs.length === 20 && provs.every(p => /^\+57[36][0-9]{9}$/.test(p.telefono)), provs.find(p => !/^\+57/.test(p.telefono))?.telefono);
    check('...y todos tienen WhatsApp (son celulares), igual al teléfono', provs.every(p => p.whatsapp === p.telefono));
    const insApp = sql => comoApp(cfg.negocio, cfg.negocio.database, sql);
    check('la base rechaza un teléfono sin indicativo en un registro nuevo', !(await insApp("INSERT INTO proveedor(nombre, telefono) VALUES ('Prueba', '3101234567')")).ok);
    check('la base rechaza un WhatsApp sin formato internacional', !(await insApp("INSERT INTO proveedor(nombre, whatsapp) VALUES ('Prueba', '3101234567')")).ok);
    const ui = await import(pathToFileURL(path.join(RAIZ, 'public/js/ui.js')).href);
    check('el enlace de WhatsApp usa solo dígitos (wa.me no admite el "+")', ui.urlWhatsapp('+573101234567', 'Hola mundo') === 'https://wa.me/573101234567?text=Hola%20mundo');
    check('el teléfono se muestra legible (+57 310 123 4567)', ui.fmtTel('+573101234567') === '+57 310 123 4567' && ui.fmtTel('+15551234567') === '+15551234567');

    console.log('\n── Mi perfil ──');
    const mi = (await pedir(G2.jar, '/api/me')).json;
    check('/api/me incluye teléfono y foto (vacíos al inicio)', mi.telefono === '' && mi.fotoUrl === null);
    const tel = await pedir(G2.jar, '/api/me', { method: 'PATCH', body: { telefono: '+57 300 123 4567' } });
    check('actualizar el teléfono propio -> 200 (se guarda en formato internacional)', tel.status === 200 && tel.json.telefono === '+573001234567', tel.json?.telefono);
    check('intentar cambiar el rol desde el perfil -> 400', (await pedir(G2.jar, '/api/me', { method: 'PATCH', body: { rol: 'administrador' } })).status === 400);
    check('intentar cambiar el correo desde el perfil -> 400', (await pedir(G2.jar, '/api/me', { method: 'PATCH', body: { email: 'otro@x.co' } })).status === 400);
    check('teléfono inválido -> 400', (await pedir(G2.jar, '/api/me', { method: 'PATCH', body: { telefono: 'abc' } })).status === 400);
    check('nombre vacío -> 400', (await pedir(G2.jar, '/api/me', { method: 'PATCH', body: { nombre: '   ' } })).status === 400);
    check('sin cambios -> 400', (await pedir(G2.jar, '/api/me', { method: 'PATCH', body: {} })).status === 400);
    check('sin sesión no se edita el perfil (401)', (await pedir(null, '/api/me', { method: 'PATCH', body: { telefono: '3001234567' } })).status === 401);
    await pedir(G2.jar, '/api/me', { method: 'PATCH', body: { telefono: '' } });

    console.log('\n── Foto de perfil y archivos ──');
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const gId = (await pedir(G2.jar, '/api/me')).json.id;
    const up = await pedir(G2.jar, '/api/me/foto', { method: 'PUT', raw: PNG, tipo: 'image/png' });
    check('subir una foto PNG válida -> 200 con su URL', up.status === 200 && /^\/api\/archivos\/[0-9a-f-]{36}$/.test(up.json?.fotoUrl || ''), up.json?.fotoUrl);
    const bajar = (jar, url) => fetch(NG + url, { headers: jar ? { Cookie: jar.header } : {} });
    const f1 = await bajar(G2.jar, up.json.fotoUrl);
    check('el dueño descarga su foto con tipo y cabeceras de seguridad', f1.status === 200 && f1.headers.get('content-type') === 'image/png'
      && f1.headers.get('x-content-type-options') === 'nosniff' && /sandbox/.test(f1.headers.get('content-security-policy') || '') && Buffer.from(await f1.arrayBuffer()).equals(PNG));
    check('otro empleado NO ve la foto (403)', (await bajar(E.jar, up.json.fotoUrl)).status === 403);
    check('quien administra usuarios sí la ve (200)', (await bajar(A.jar, up.json.fotoUrl)).status === 200);
    check('sin sesión no se descarga (401)', (await bajar(null, up.json.fotoUrl)).status === 401);
    check('un id que no es UUID -> 404 (no hay rutas por nombre de archivo)', (await bajar(G2.jar, '/api/archivos/..%2F..%2F.env')).status === 404);
    const reg = (await ngDb.query('SELECT * FROM archivo WHERE id = $1', [up.json.fotoUrl.split('/').pop()])).rows[0];
    const enDisco = path.join(RAIZ, 'almacenamiento', reg.ruta);
    check('queda registrada con huella SHA-256, en la carpeta del usuario y con nombre ordenado', reg.sha256.length === 64 && reg.ruta.startsWith(`usuarios/${gId}/foto_`) && /foto_\d{8}-\d{6}_[0-9a-f]{8}\.png$/.test(reg.ruta), reg.ruta);
    check('el archivo existe en disco y su huella coincide con la registrada', fs.existsSync(enDisco) && crypto.createHash('sha256').update(fs.readFileSync(enDisco)).digest('hex') === reg.sha256);
    const up2 = await pedir(G2.jar, '/api/me/foto', { method: 'PUT', raw: PNG, tipo: 'image/png' });
    check('subir otra foto reemplaza a la anterior (la vieja deja de servirse)', up2.status === 200 && up2.json.fotoUrl !== up.json.fotoUrl && (await bajar(G2.jar, up.json.fotoUrl)).status === 404 && (await bajar(G2.jar, up2.json.fotoUrl)).status === 200);
    check('...pero la foto anterior NO se borra: queda marcada como eliminada (evidencia)', (await ngDb.query('SELECT eliminado_en FROM archivo WHERE id = $1', [reg.id])).rows[0].eliminado_en !== null && fs.existsSync(enDisco));
    check('foto con bytes que no son imagen -> 400', (await pedir(G2.jar, '/api/me/foto', { method: 'PUT', raw: Buffer.from('<html><script>alert(1)</script></html>'), tipo: 'image/png' })).status === 400);
    check('PNG declarado como JPEG -> 400 (no se confía en lo que diga el navegador)', (await pedir(G2.jar, '/api/me/foto', { method: 'PUT', raw: PNG, tipo: 'image/jpeg' })).status === 400);
    check('SVG (puede llevar código) -> 415', (await pedir(G2.jar, '/api/me/foto', { method: 'PUT', raw: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), tipo: 'image/svg+xml' })).status === 415);
    check('foto de más de 600 KB -> 413', (await pedir(G2.jar, '/api/me/foto', { method: 'PUT', raw: Buffer.concat([PNG, Buffer.alloc(700 * 1024)]), tipo: 'image/png' })).status === 413);
    check('sin sesión no se sube foto (401)', (await pedir(null, '/api/me/foto', { method: 'PUT', raw: PNG, tipo: 'image/png' })).status === 401);
    const quitar = await pedir(G2.jar, '/api/me/foto', { method: 'DELETE' });
    check('quitar la foto -> el perfil queda sin foto y el archivo deja de servirse', quitar.status === 200 && quitar.json.fotoUrl === null && (await bajar(G2.jar, up2.json.fotoUrl)).status === 404);
    const lista2 = await pedir(A.jar, '/api/admin/usuarios');
    check('la lista de usuarios del administrador incluye fotoUrl', lista2.json.every(u => 'fotoUrl' in u));

    console.log('\n── Parámetros del sistema ──');
    check('gerente NO ve parámetros (403)', (await pedir(G2.jar, '/api/parametros')).status === 403);
    const par = await pedir(A.jar, '/api/parametros');
    check('el administrador ve los parámetros por grupo', par.status === 200 && par.json.length === 11 && par.json.some(p => p.clave === 'empresa.nombre'));
    const put = (clave, valor, jar = A.jar) => pedir(jar, `/api/parametros/${clave}`, { method: 'PUT', body: { valor } });
    check('cambiar un parámetro válido -> 200', (await put('alertas.meses_proveedor_inactivo', '4')).status === 200);
    check('valor no numérico -> 400', (await put('alertas.meses_proveedor_inactivo', 'abc')).status === 400);
    check('por debajo del mínimo (0) -> 400', (await put('alertas.meses_proveedor_inactivo', '0')).status === 400);
    check('por encima del máximo (61) -> 400', (await put('alertas.meses_proveedor_inactivo', '61')).status === 400);
    check('parámetro inexistente -> 404', (await put('no.existe', '1')).status === 404);
    check('gerente NO cambia parámetros (403)', (await put('alertas.meses_proveedor_inactivo', '5', G2.jar)).status === 403);
    check('WhatsApp sin indicativo -> 400', (await put('empresa.whatsapp', '3001234567')).status === 400);
    const wa = await put('empresa.whatsapp', '+57 300 123 4567');
    check('WhatsApp con indicativo se guarda compacto', wa.status === 200 && wa.json.valor === '+573001234567');
    const info = await pedir(null, '/api/catalogo/info');
    check('el catálogo público muestra solo datos marcados como públicos', info.status === 200 && info.json.nombre === 'Vivero Las Magnolias' && info.json.whatsapp === '+573001234567' && !('nit' in info.json) && !('correo' in info.json), JSON.stringify(info.json));
    await put('alertas.meses_proveedor_inactivo', '3'); await put('empresa.whatsapp', '');

    console.log('\n── Notificaciones ──');
    const nG = await pedir(G2.jar, '/api/notificaciones');
    check('el gerente ve la alerta de stock bajo', nG.status === 200 && nG.json.items.some(i => i.tipo === 'stock_bajo' && /23 productos/.test(i.titulo)), nG.json?.items?.[0]?.titulo);
    check('el proveedor no recibe alertas de inventario', (await pedir(P.jar, '/api/notificaciones')).json?.total === 0);
    check('sin sesión no hay notificaciones (401)', (await pedir(null, '/api/notificaciones')).status === 401);

    console.log('\n── Actualización de datos, rol por rol ──');
    {
      const H = (jar, metodo, ruta, body) => pedir(jar, ruta, { method: metodo, body });
      const roles = { admin: A.jar, gerente: G2.jar, empleado: E.jar, proveedor: P.jar };
      const permitido = async (jar, metodo, ruta, body) => { const s = (await H(jar, metodo, ruta, body)).status; return s !== 403 && s !== 401; };
      const matriz = async (etiqueta, metodo, ruta, body, esperado) => {
        const real = {}; for (const [rol, jar] of Object.entries(roles)) real[rol] = await permitido(jar, metodo, ruta, body);
        check(`${etiqueta}: ${JSON.stringify(esperado)}`, Object.entries(esperado).every(([r, v]) => real[r] === v), JSON.stringify(real));
      };
      await matriz('editar productos', 'PUT', '/api/productos/999999', prodBase, { admin: true, gerente: true, empleado: false, proveedor: false });
      await matriz('editar cualquier proveedor', 'PUT', '/api/proveedores/999999', { ciudad: 'X' }, { admin: true, gerente: true, empleado: false, proveedor: false });
      await matriz('editar la empresa propia (Mi empresa)', 'GET', '/api/mi-proveedor', undefined, { admin: true, gerente: false, empleado: false, proveedor: true });
      await matriz('administrar usuarios', 'GET', '/api/admin/usuarios', undefined, { admin: true, gerente: false, empleado: false, proveedor: false });
      await matriz('cambiar parámetros del sistema', 'GET', '/api/parametros', undefined, { admin: true, gerente: false, empleado: false, proveedor: false });
      const propios = {}; for (const [rol, jar] of Object.entries(roles)) propios[rol] = (await H(jar, 'PATCH', '/api/me', { telefono: '3151112233' })).status;
      check('todos los roles actualizan su propio perfil', Object.values(propios).every(s => s === 200), JSON.stringify(propios));
      for (const jar of Object.values(roles)) await H(jar, 'PATCH', '/api/me', { telefono: '' });
      const mePatch = await H(G2.jar, 'PATCH', '/api/me', { ciudad: 'Bucaramanga', direccion: 'Calle 10 # 5-20', telefono: '300 123 4567' });
      check('Mi perfil: ciudad, dirección y teléfono (normalizado) se guardan', mePatch.status === 200 && mePatch.json.ciudad === 'Bucaramanga' && mePatch.json.direccion === 'Calle 10 # 5-20' && mePatch.json.telefono === '+573001234567');
      const noPropio = await H(G2.jar, 'PATCH', '/api/me', { cargo: 'Dueño' });
      check('Mi perfil: el cargo y el documento NO los cambia el usuario (los define el administrador)', noPropio.status === 400 && /administrador/.test(noPropio.json?.error) && (await H(G2.jar, 'PATCH', '/api/me', { numero_doc: '123456' })).status === 400 && (await H(G2.jar, 'PATCH', '/api/me', { tipo_doc: 'NIT' })).status === 400);
      await H(G2.jar, 'PATCH', '/api/me', { ciudad: '', direccion: '', telefono: '' });

      console.log('\n── Proveedores: edición por gerente y administrador ──');
      const lis = id => (jar) => H(jar, 'GET', '/api/proveedores').then(r => r.json.find(p => p.id === id));
      const provs2 = (await H(G2.jar, 'GET', '/api/proveedores')).json;
      const pA = provs2[0], pB = provs2[1];
      const orig = (await ngDb.query('SELECT id, telefono, whatsapp, correo, ciudad, direccion FROM proveedor WHERE id = ANY($1)', [[pA.id, pB.id]])).rows;
      check('quien solo consulta NO ve documento ni dirección del proveedor; quien edita sí', !('numero_doc' in (await H(E.jar, 'GET', '/api/proveedores')).json[0]) && 'numero_doc' in provs2[0] && 'direccion' in provs2[0]);
      check('las opciones del formulario (categorías y tipos de documento) son solo para quien edita', (await H(E.jar, 'GET', '/api/proveedores/opciones')).status === 403 && (await H(G2.jar, 'GET', '/api/proveedores/opciones')).json.categorias.length === 4);
      check('sin sesión no se edita un proveedor (401)', (await H(null, 'PUT', `/api/proveedores/${pA.id}`, { ciudad: 'X' })).status === 401);
      check('empleado y proveedor NO editan proveedores (403)', (await H(E.jar, 'PUT', `/api/proveedores/${pA.id}`, { ciudad: 'X' })).status === 403 && (await H(P.jar, 'PUT', `/api/proveedores/${pA.id}`, { ciudad: 'X' })).status === 403);
      const nuevosDatos = { telefono: '310 555 0101', whatsapp: '3105550101', correo: 'Contacto@Prueba.CO', ciudad: 'Medellín', direccion: 'Calle 1 # 2-3' };
      const ed = await H(G2.jar, 'PUT', `/api/proveedores/${pA.id}`, nuevosDatos);
      check('el gerente actualiza teléfono, WhatsApp, correo y dirección (todo se normaliza)', ed.status === 200 && ed.json.telefono === '+573105550101' && ed.json.whatsapp === '+573105550101' && ed.json.correo === 'contacto@prueba.co' && ed.json.ciudad === 'Medellín', JSON.stringify([ed.json?.telefono, ed.json?.correo]));
      const audP = (await ngDb.query("SELECT detalle FROM auditoria WHERE accion = 'proveedor_modificado' AND entidad_id = $1 ORDER BY id DESC LIMIT 1", [pA.id])).rows[0];
      check('la auditoría guarda cada campo como [antes, después]', audP && JSON.parse(audP.detalle).telefono[1] === '+573105550101' && JSON.parse(audP.detalle).correo[1] === 'contacto@prueba.co');
      const cuenta = (await ngDb.query("SELECT count(*)::int n FROM auditoria WHERE accion = 'proveedor_modificado' AND entidad_id = $1", [pA.id])).rows[0].n;
      await H(G2.jar, 'PUT', `/api/proveedores/${pA.id}`, nuevosDatos);
      check('guardar sin cambios no ensucia la auditoría', (await ngDb.query("SELECT count(*)::int n FROM auditoria WHERE accion = 'proveedor_modificado' AND entidad_id = $1", [pA.id])).rows[0].n === cuenta);
      const malP = async (cambios, etiqueta) => check(`proveedor, validación: ${etiqueta} -> 400`, (await H(G2.jar, 'PUT', `/api/proveedores/${pA.id}`, cambios)).status === 400);
      await malP({ telefono: '123' }, 'teléfono corto'); await malP({ telefono: 'abc' }, 'teléfono con letras'); await malP({ whatsapp: '601 123 4567' }, 'WhatsApp que es un fijo');
      await malP({ correo: 'no-es-correo' }, 'correo inválido'); await malP({ nombre: 'A' }, 'nombre de 1 letra'); await malP({ categoria_id: 9999 }, 'categoría inexistente');
      await malP({ tipo_doc: 'Licencia' }, 'tipo de documento inválido'); await malP({ activo: false }, 'campo no permitido'); await malP({}, 'sin cambios');
      const otraCat = (await H(G2.jar, 'GET', '/api/proveedores/opciones')).json.categorias.find(c => c.id !== pA.categoria_id).id;
      const cambioCat = await H(G2.jar, 'PUT', `/api/proveedores/${pA.id}`, { categoria_id: otraCat });
      check('no se cambia la categoría de un proveedor con productos asociados', cambioCat.status === 400 && /producto/.test(cambioCat.json?.error), cambioCat.json?.error);
      check('el administrador también edita proveedores', (await H(A.jar, 'PUT', `/api/proveedores/${pB.id}`, { ciudad: 'Cali' })).status === 200);
      check('proveedor inexistente -> 404', (await H(G2.jar, 'PUT', '/api/proveedores/999999', { ciudad: 'X' })).status === 404);

      console.log('\n── Mi empresa: el proveedor actualiza lo suyo ──');
      const mio = await H(P.jar, 'GET', '/api/mi-proveedor');
      check('el proveedor ve los datos de SU empresa, sin calificaciones', mio.status === 200 && !!mio.json.nombre && !/promedio|calificacion|puntaje/i.test(JSON.stringify(mio.json)), mio.json?.nombre);
      const miosDatos = { telefono: '3201112233', whatsapp: '3201112233', correo: 'Nuevo@Plantas.co', ciudad: 'Cali', direccion: 'Carrera 5 # 6-7' };
      const mput = await H(P.jar, 'PUT', '/api/mi-proveedor', miosDatos);
      check('el proveedor actualiza su teléfono, WhatsApp, correo y dirección sin el administrador', mput.status === 200 && mput.json.telefono === '+573201112233' && mput.json.correo === 'nuevo@plantas.co' && mput.json.direccion === 'Carrera 5 # 6-7');
      const misId = mio.json.id;
      check('el vivero ve el cambio en la ficha del proveedor', (await lis(misId)(G2.jar)).telefono === '+573201112233');
      check('la auditoría registra que lo hizo el propio proveedor', (await ngDb.query("SELECT 1 FROM auditoria a JOIN perfil p ON p.cuenta_id = a.usuario_id WHERE a.accion = 'proveedor_modificado' AND a.entidad_id = $1 AND p.nombre = 'Gustavo'", [misId])).rowCount >= 1);
      for (const [campo, valor] of [['nombre', 'Otro nombre'], ['categoria_id', 1], ['numero_doc', '999999'], ['tipo_doc', 'NIT'], ['pais', 'Chile']])
        check(`el proveedor NO puede cambiar "${campo}" (lo define el vivero)`, (await H(P.jar, 'PUT', '/api/mi-proveedor', { [campo]: valor })).status === 400);
      check('el proveedor tampoco puede editar OTRA empresa (403)', (await H(P.jar, 'PUT', `/api/proveedores/${pA.id}`, { ciudad: 'X' })).status === 403);
      check('gerente y empleado no usan Mi empresa (403); sin sesión (401)', (await H(G2.jar, 'GET', '/api/mi-proveedor')).status === 403 && (await H(E.jar, 'GET', '/api/mi-proveedor')).status === 403 && (await H(null, 'GET', '/api/mi-proveedor')).status === 401);
      check('una cuenta de proveedor sin empresa vinculada recibe un aviso claro (404)', (await H(A.jar, 'GET', '/api/mi-proveedor')).status === 404);
      for (const o of orig) await ngDb.query('UPDATE proveedor SET telefono = $2, whatsapp = $3, correo = $4, ciudad = $5, direccion = $6 WHERE id = $1', [o.id, o.telefono, o.whatsapp, o.correo, o.ciudad, o.direccion]);
      await ngDb.query("DELETE FROM auditoria WHERE accion = 'proveedor_modificado' AND creado_en >= $1", [inicio]);

      console.log('\n── Panel de usuarios del administrador: todos los campos ──');
      const emailU = `test-full-${sufijo}@vivero.test`, emailU2 = `test-nuevo-${sufijo}@vivero.test`;
      const antesN = (await H(A.jar, 'GET', '/api/admin/usuarios')).json.length;
      const completo = { email: emailU, rol: 'empleado', nombre: 'Laura', apellidos: 'De la Cruz Pérez', telefono: '300 444 5566', tipo_doc: 'Cédula', numero_doc: '1098765432', cargo: 'Vendedora', ciudad: 'Bucaramanga', direccion: 'Carrera 27 # 10-15' };
      check('crear usuario con teléfono inválido -> 400 y NO queda una cuenta a medias', (await H(A.jar, 'POST', '/api/admin/usuarios', { ...completo, telefono: 'abc' })).status === 400 && (await H(A.jar, 'GET', '/api/admin/usuarios')).json.length === antesN);
      check('crear usuario con tipo de documento inválido -> 400', (await H(A.jar, 'POST', '/api/admin/usuarios', { ...completo, tipo_doc: 'Licencia' })).status === 400);
      check('número de documento sin indicar el tipo -> 400', (await H(A.jar, 'POST', '/api/admin/usuarios', { ...completo, tipo_doc: '' })).status === 400);
      const cre = await H(A.jar, 'POST', '/api/admin/usuarios', completo);
      check('crear usuario con todos los datos -> 201', cre.status === 201 && cre.json.claveTemporal?.length === 14);
      const uu = (await H(A.jar, 'GET', '/api/admin/usuarios')).json.find(u => u.email === emailU);
      check('el panel muestra teléfono (internacional), documento, cargo, ciudad y dirección', uu && uu.telefono === '+573004445566' && uu.tipoDoc === 'Cédula' && uu.numeroDoc === '1098765432' && uu.cargo === 'Vendedora' && uu.ciudad === 'Bucaramanga' && uu.direccion === 'Carrera 27 # 10-15' && !!uu.creadaEn);
      const idU = cre.json.id;
      const p1 = await H(A.jar, 'PATCH', `/api/admin/usuarios/${idU}`, { telefono: '3109998877', cargo: 'Jefa de ventas', ciudad: 'Floridablanca' });
      const uu2 = (await H(A.jar, 'GET', '/api/admin/usuarios')).json.find(u => u.id === idU);
      check('editar teléfono, cargo y ciudad de otro usuario', p1.status === 200 && uu2.telefono === '+573109998877' && uu2.cargo === 'Jefa de ventas' && uu2.ciudad === 'Floridablanca');
      check('vaciar un campo opcional lo deja vacío', (await H(A.jar, 'PATCH', `/api/admin/usuarios/${idU}`, { cargo: '' })).status === 200 && (await H(A.jar, 'GET', '/api/admin/usuarios')).json.find(u => u.id === idU).cargo === '');
      const mixto = await H(A.jar, 'PATCH', `/api/admin/usuarios/${idU}`, { rol: 'gerente', telefono: 'abc' });
      check('si un dato es inválido NO se aplica nada (ni el rol)', mixto.status === 400 && (await H(A.jar, 'GET', '/api/admin/usuarios')).json.find(u => u.id === idU).rol === 'empleado');
      check('campos que no existen o intentan colarse (password) -> 400', (await H(A.jar, 'PATCH', `/api/admin/usuarios/${idU}`, { password: 'x' })).status === 400 && (await H(A.jar, 'PATCH', `/api/admin/usuarios/${idU}`, {})).status === 400);
      const sesionU = await entrar(emailU, cre.json.claveTemporal);
      const cmail = await H(A.jar, 'PATCH', `/api/admin/usuarios/${idU}`, { email: emailU2 });
      check('el administrador cambia el correo de otra cuenta y se cierran sus sesiones', cmail.status === 200 && (await pedir(sesionU.jar, '/api/auth/refresh', { method: 'POST' })).status === 401);
      check('con el correo nuevo entra; con el viejo ya no', (await entrar(emailU2, cre.json.claveTemporal)).status === 200 && (await entrar(emailU, cre.json.claveTemporal)).status === 401);
      check('correo repetido (de otra cuenta) -> 409', (await H(A.jar, 'PATCH', `/api/admin/usuarios/${idU}`, { email: 'gerente@vivero.com' })).status === 409);
      check('correo inválido -> 400', (await H(A.jar, 'PATCH', `/api/admin/usuarios/${idU}`, { email: 'no-es-correo' })).status === 400);
      const miIdA = (await H(A.jar, 'GET', '/api/me')).json.id;
      check('el administrador NO se cambia su propio rol ni su propio correo', (await H(A.jar, 'PATCH', `/api/admin/usuarios/${miIdA}`, { email: 'otro@vivero.com' })).status === 400 && (await H(A.jar, 'PATCH', `/api/admin/usuarios/${miIdA}`, { rol: 'gerente' })).status === 400);
      check('...pero sí sus datos personales (teléfono, cargo)', (await H(A.jar, 'PATCH', `/api/admin/usuarios/${miIdA}`, { cargo: 'Administrador del sistema', telefono: '3001230000' })).status === 200);
      await H(A.jar, 'PATCH', `/api/admin/usuarios/${miIdA}`, { cargo: '', telefono: '' });
      check('el gerente NO edita usuarios (403)', (await H(G2.jar, 'PATCH', `/api/admin/usuarios/${idU}`, { cargo: 'x' })).status === 403);

      console.log('\n── Coherencia de datos y formato en la base ──');
      check('ningún producto tiene un proveedor de otra categoría', (await ngDb.query('SELECT count(*)::int n FROM producto p JOIN proveedor v ON v.id = p.proveedor_id WHERE p.categoria_id <> v.categoria_id')).rows[0].n === 0);
      const cat2 = (await H(G2.jar, 'GET', '/api/productos/opciones')).json;
      const ajeno = cat2.proveedores.find(x => x.categoria_id !== prov0.categoria_id);
      const mism = await H(G2.jar, 'POST', '/api/productos', { ...prodBase, nombre: 'Prueba Ajeno', proveedor_id: ajeno.id });
      check('un producto NO se crea con un proveedor de otra categoría', mism.status === 400 && /categor/.test(mism.json?.error), mism.json?.error);
      check('las opciones del formulario traen la categoría de cada proveedor (para filtrar)', cat2.proveedores.every(x => Number.isInteger(x.categoria_id)));
      check('la base rechaza un teléfono de persona sin formato internacional', !(await comoApp(cfg.negocio, cfg.negocio.database, "INSERT INTO perfil(cuenta_id, telefono) VALUES (gen_random_uuid(), '3101234567')")).ok);
    }

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
    check('los archivos nunca se borran desde la app (sin DELETE ni TRUNCATE)', !(await comoApp(cfg.negocio, cfg.negocio.database, 'DELETE FROM archivo')).ok && !(await comoApp(cfg.negocio, cfg.negocio.database, 'TRUNCATE archivo')).ok);
    check('...ni se les puede alterar la huella, solo marcarlos como eliminados', !(await comoApp(cfg.negocio, cfg.negocio.database, "UPDATE archivo SET sha256 = 'x' WHERE false")).ok && (await comoApp(cfg.negocio, cfg.negocio.database, 'UPDATE archivo SET eliminado_en = eliminado_en WHERE false')).ok);
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
        await ngDb.query("DELETE FROM producto WHERE nombre LIKE 'Prueba %'");
        await ngDb.query("DELETE FROM auditoria WHERE entidad = 'producto' AND creado_en >= $1", [inicio]);
        await ngDb.query('UPDATE proveedor SET activo = true WHERE NOT activo');
        const subidos = (await ngDb.query('SELECT ruta FROM archivo WHERE creado_en >= $1', [inicio])).rows;
        await ngDb.query('UPDATE perfil SET foto_id = NULL WHERE foto_id IN (SELECT id FROM archivo WHERE creado_en >= $1)', [inicio]);
        await ngDb.query('DELETE FROM archivo WHERE creado_en >= $1', [inicio]);
        for (const f of subidos) fs.rmSync(path.join(RAIZ, 'almacenamiento', f.ruta), { force: true });
      }
    } catch (e) { console.error('Limpieza:', e.message); }
    await idDb?.end().catch(() => {}); await ngDb?.end().catch(() => {});
    hijos.forEach(h => h.kill());
  }
  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodo correcto');
  process.exit(fallos ? 1 : 0);
})();
