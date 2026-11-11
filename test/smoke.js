// Prueba de humo de la API: node test/smoke.js  (usa la BD ya sembrada con npm run seed)
const { spawn } = require('child_process');
const crypto = require('crypto');
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

(async () => {
  await sleep(1500);
  try {
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

    let codigos = [];
    for (let i = 0; i < 6; i++) codigos.push((await login('empleado@vivero.com', 'mala')).status);
    check('6.º intento fallido queda bloqueado (429)', codigos.join() === '401,401,401,401,401,429', codigos.join());
    check('ruta inexistente da 404', (await call('/nada')).status === 404);
  } finally { srv.kill(); }
  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodo correcto');
  process.exit(fallos ? 1 : 0);
})();
