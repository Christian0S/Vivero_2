// Carga los JSON del prototipo en la BD. Uso: node db/seed.js "<carpeta jsons>"
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const DEMO_PASSWORD = 'Vivero2026!'; // SOLO desarrollo: cámbiala
const fs = require('fs'), path = require('path');
const dir = process.argv[2] || './legacy/jsons';
const J = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const money = s => typeof s === 'number' ? s : parseInt(String(s).replace(/[^\d]/g, ''), 10) || 0;
const imgCat = c => '/img/cat-' + ({ 'Plantas':'plantas','Materas':'materas','Artesanías':'artesanias','Abonos-Tierra':'abonos' }[c]) + '.webp';
const iso = s => { const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : (s || null); };

(async () => {
const SQL = await initSqlJs();
const raw = new SQL.Database();
raw.exec(fs.readFileSync('db/schema.sql', 'utf8'));
// mini-adaptador para mantener el mismo estilo prepare().run()/get()
const db = {
  exec: q => raw.exec(q),
  prepare: q => ({
    run: (...a) => { raw.run(q, a); return { lastInsertRowid: raw.exec('SELECT last_insert_rowid()')[0].values[0][0] }; },
    get: (...a) => { const st = raw.prepare(q); st.bind(a); const r = st.step() ? st.getAsObject() : undefined; st.free(); return r; },
  }),
};
const run = () => { raw.run('BEGIN');
 try { const r = (() => {
  // categorías
  const cat = {}; const insCat = db.prepare('INSERT INTO categoria(nombre) VALUES (?)');
  for (const n of new Set([...J('productos.json'), ...J('proveedores.json')].map(x => x.category)))
    cat[n] = insCat.run(n).lastInsertRowid;

  // usuarios de ejemplo (hash temporal: se reemplaza por bcrypt al montar la API)
  // Los usuarios del prototipo no tenían apellido: se completan con nombres de demostración (cámbialos a gusto)
  const DEMO = { gerente: ['Miguel Ángel', 'Ray Soto'], empleado: ['Juan', 'Vargas'], proveedor: ['Gustavo', 'Mejía Rojas'] };
  const insU = db.prepare('INSERT INTO usuario(nombre,apellidos,email,password_hash,rol) VALUES (?,?,?,?,?)');
  const uid = {};
  for (const u of J('usuarios.json')) uid[u.position] = insU.run(DEMO[u.position][0], DEMO[u.position][1], u.email, bcrypt.hashSync(DEMO_PASSWORD, 10), u.position).lastInsertRowid;

  // empleados (solo no eliminados)
  const insE = db.prepare(`INSERT INTO empleado(nombre,apellidos,tipo_doc,numero_doc,pais,ciudad,direccion,telefono,cargo,antecedentes,hoja_vida_url,avatar_url,eliminado)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const e of J('empleado.json')) insE.run(e.nombre, e.apellidos, e.tipoIdentificacion, e.numeroIdentificacion, e.pais, e.ciudad, e.direccion, e.telefono, e.cargo, e.antecedentes, null, null, e.eliminado ? 1 : 0);

  // proveedores: se conserva el id viejo en un mapa para reenlazar productos
  const insP = db.prepare(`INSERT INTO proveedor(nombre,tipo_doc,numero_doc,pais,ciudad,direccion,telefono,correo,categoria_id,imagen_url,creado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const pid = {}, pidByName = {};
  for (const p of J('proveedores.json')) {
    const id = insP.run(p.nombre, p.tipoIdentificacion, p.numeroIdentificacion, p.pais, p.ciudad, p.direccion, p.telefono, p.correo, cat[p.category], null, uid.gerente).lastInsertRowid;
    pid[p.id] = id; pidByName[p.nombre] = id;
  }
  const provDeCategoria = c => db.prepare('SELECT id FROM proveedor WHERE categoria_id=? ORDER BY id LIMIT 1').get(cat[c]).id;

  // productos: 77 de 100 tenían supplierId inexistente -> se asigna proveedor de su categoría
  const insPr = db.prepare(`INSERT INTO producto(nombre,categoria_id,proveedor_id,descripcion,imagen_url,precio_base,pct_ganancia,pct_iva,precio_venta,stock,stock_minimo,creado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  let huerfanos = 0;
  for (const p of J('productos.json')) {
    let prov = pid[p.supplierId]; if (!prov) { prov = provDeCategoria(p.category); huerfanos++; }
    insPr.run(p.name, cat[p.category], prov, p.description, imgCat(p.category), p.basePrice, p.ultPercentage, p.vatPercentage, p.sellingPrice, p.quantityToAdd, p.quantityToAlert, uid.empleado);
  }

  // órdenes: compras.json. El proveedor del prototipo era un nombre de persona (no un proveedor),
  // así que se asigna uno de la categoría que sugieren los productos del pedido, rotando entre ellos.
  const catDe = items => { const t = items.map(i => i.nombre).join(' ').toLowerCase();
    return /maceta|matera|jardinera/.test(t) ? 'Materas' : /abono|tierra|sustrato|fertiliz|humus/.test(t) ? 'Abonos-Tierra' : /artesan|decorativ|adorno/.test(t) ? 'Artesanías' : 'Plantas'; };
  const provPorCat = {}; for (const p of J('proveedores.json')) (provPorCat[p.category] ||= []).push(pid[p.id]);
  const legacyCalif = {}; for (const p of J('proveedores.json')) legacyCalif[pid[p.id]] = p.calificacion;
  const mapEstado = { Pendiente: 'aceptada', Validar: 'por_validar', Completado: 'completada', Calificado: 'calificada' };
  const insO = db.prepare(`INSERT INTO orden_compra(nombre,proveedor_id,creada_por,estado,direccion_entrega,fecha_entrega,total,creada_en)
    VALUES (?,?,?,?,?,?,?,?)`);
  const insI = db.prepare('INSERT INTO orden_item(orden_id,descripcion,cantidad,valor_unitario) VALUES (?,?,?,?)');
  const insC = db.prepare('INSERT INTO calificacion(orden_id,proveedor_id,puntaje,puntualidad,calidad,calificado_por) VALUES (?,?,?,?,?,?)');
  let k = 0; const cuenta = {};
  for (const c of J('compras.json')) {
    const lista = provPorCat[catDe(c.productos)]; const prov = lista[k++ % lista.length];
    const estado = mapEstado[c.estado] || 'aceptada';
    const oid = insO.run(c.nombrePedido, prov, uid.gerente, estado, c.direccionEntrega, c.fechaEntrega, money(c.valorTotal), c.fechaCreacion).lastInsertRowid;
    for (const it of c.productos) insI.run(oid, it.nombre, it.cantidad, money(it.valorUnitario));
    cuenta[prov] = (cuenta[prov] || 0) + 1;
    if (estado === 'calificada') {   // puntajes alrededor de la calificación histórica del proveedor
      const base = Math.round(legacyCalif[prov] || 4), v = n => Math.max(1, Math.min(5, base + ((oid + n) % 3) - 1));
      insC.run(oid, prov, v(0), v(1), v(2), uid.gerente);
    }
  }
  // el usuario "proveedor" del demo queda enlazado al proveedor con más órdenes
  const miProv = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a])[0];
  db.prepare('UPDATE proveedor SET usuario_id = ? WHERE id = ?').run(uid.proveedor, Number(miProv));
  const sinProv = 0;

  // auditoría
  const insA = db.prepare('INSERT INTO auditoria(usuario_id,accion,detalle,creado_en) VALUES (?,?,?,?)');
  for (const h of J('historialDecambios.json')) insA.run(uid[h.rol.toLowerCase()] || null, h.accion, h.descripcion, iso(h.fechaHora));
  return { huerfanos, sinProv };
 })(); raw.run('COMMIT'); return r; } catch (e) { raw.run('ROLLBACK'); throw e; } };
const r = run();
for (const t of ['usuario','empleado','categoria','proveedor','producto','orden_compra','orden_item','auditoria'])
  console.log(t.padEnd(14), db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n);
console.log('productos reasignados a proveedor de su categoría:', r.huerfanos, '| órdenes repartidas por categoría (el prototipo las tenía a nombre de personas)');
fs.writeFileSync('db/srm.db', Buffer.from(raw.export()));
console.log('Listo: db/srm.db creada. Usuarios demo: gerente@vivero.com, empleado@vivero.com, proveedor@vivero.com / clave:', DEMO_PASSWORD);
})();
