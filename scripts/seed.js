// Carga los JSON del prototipo (legacy/jsons) en ambas bases. Se puede repetir: vacía y vuelve a cargar.   Uso: npm run db:seed
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { hash: hashClave } = require('../identidad/lib/password');
const { Client } = require('pg');
const cfg = require('../src/config');
cfg.exigir(['PG_ADMIN_PASSWORD', 'IDENTIDAD_DB', 'NEGOCIO_DB']);
if (process.env.NODE_ENV === 'production') { console.error('El seed de demostración está bloqueado en producción.'); process.exit(1); }

const DEMO_PASSWORD = 'Vivero2026!';   // SOLO desarrollo
// Los usuarios del prototipo no tenían apellido: se completan con nombres de demostración
const DEMO = { administrador: ['Admin', 'Sistema'], gerente: ['Miguel Ángel', 'Ray Soto'], empleado: ['Juan', 'Vargas'], proveedor: ['Gustavo', 'Mejía Rojas'] };
const DIR = path.join(__dirname, '..', process.argv[2] || 'legacy/jsons');
const J = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const pesos = v => typeof v === 'number' ? Math.round(v) : (parseInt(String(v).replace(/[^\d]/g, ''), 10) || 0); // el prototipo guardaba "$15,000" y decimales
const dia = s => (/^\d{4}-\d{2}-\d{2}/.test(s || '') ? s.slice(0, 10) : null);
const hora = s => { const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/.exec(s || ''); return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00-05:00` : null; }; // hora de Colombia
const IMG = { 'Plantas': 'plantas', 'Materas': 'materas', 'Artesanías': 'artesanias', 'Abonos-Tierra': 'abonos' };
const imgCat = c => `/img/cat-${IMG[c]}.webp`;
const conectar = async c => { const cl = new Client({ ...cfg.pg, user: cfg.admin.user, password: cfg.admin.password, database: c.database }); await cl.connect(); return cl; };
const ins = async (cl, sql, p) => (await cl.query(sql + ' RETURNING id', p)).rows[0].id;

(async () => {
  const idc = await conectar(cfg.identidad), neg = await conectar(cfg.negocio);
  try {
    await idc.query('BEGIN'); await neg.query('BEGIN');
    await idc.query('TRUNCATE evento_seguridad, sesion, cuenta RESTART IDENTITY CASCADE');
    await neg.query('TRUNCATE auditoria, calificacion, orden_item, orden_compra, producto, proveedor, empleado, categoria, perfil RESTART IDENTITY CASCADE');

    // Cuentas (identidad) y perfiles (negocio) con el mismo id
    const uid = {};
    const cuentas = [{ email: 'admin@vivero.com', position: 'administrador' }, ...J('usuarios.json').map(u => ({ email: u.email, position: u.position }))];
    for (const u of cuentas) {
      const id = crypto.randomUUID(); uid[u.position] = id;
      await idc.query('INSERT INTO cuenta(id, email, password_hash, rol) VALUES ($1,$2,$3,$4)', [id, u.email, await hashClave(DEMO_PASSWORD), u.position]);
      await neg.query('INSERT INTO perfil(cuenta_id, nombre, apellidos) VALUES ($1,$2,$3)', [id, DEMO[u.position][0], DEMO[u.position][1]]);
    }

    const cat = {};
    for (const n of new Set([...J('productos.json'), ...J('proveedores.json')].map(x => x.category)))
      cat[n] = await ins(neg, 'INSERT INTO categoria(nombre) VALUES ($1)', [n]);

    for (const e of J('empleado.json'))
      await neg.query(`INSERT INTO empleado(nombre,apellidos,tipo_doc,numero_doc,pais,ciudad,direccion,telefono,cargo,antecedentes,eliminado)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [e.nombre, e.apellidos, e.tipoIdentificacion, e.numeroIdentificacion, e.pais, e.ciudad, e.direccion, e.telefono, e.cargo, e.antecedentes, !!e.eliminado]);

    const pid = {}, pidNombre = {}, primeroDeCat = {}, provPorCat = {}, legacyCalif = {};
    for (const p of J('proveedores.json')) {
      const id = await ins(neg, `INSERT INTO proveedor(nombre,tipo_doc,numero_doc,pais,ciudad,direccion,telefono,correo,categoria_id,creado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [p.nombre, p.tipoIdentificacion, p.numeroIdentificacion, p.pais, p.ciudad, p.direccion, p.telefono, p.correo, cat[p.category], uid.gerente]);
      pid[p.id] = id; pidNombre[p.nombre] = id; primeroDeCat[p.category] ??= id; (provPorCat[p.category] ||= []).push(id); legacyCalif[id] = p.calificacion;
    }

    // 77 de 100 productos apuntaban a un proveedor inexistente: se asigna el primero de su categoría
    let reasignados = 0;
    for (const p of J('productos.json')) {
      let prov = pid[p.supplierId]; if (!prov) { prov = primeroDeCat[p.category]; reasignados++; }
      await neg.query(`INSERT INTO producto(nombre,categoria_id,proveedor_id,descripcion,imagen_url,precio_base,pct_ganancia,pct_iva,precio_venta,stock,stock_minimo,creado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [p.name, cat[p.category], prov, p.description, imgCat(p.category), pesos(p.basePrice), p.ultPercentage, p.vatPercentage, pesos(p.sellingPrice), p.quantityToAdd, p.quantityToAlert, uid.empleado]);
    }

    // Órdenes: el "proveedor" del prototipo era un nombre de persona; se reparte por la categoría que sugieren los productos
    const catDe = items => { const t = items.map(i => i.nombre).join(' ').toLowerCase();
      return /maceta|matera|jardinera/.test(t) ? 'Materas' : /abono|tierra|sustrato|fertiliz|humus/.test(t) ? 'Abonos-Tierra' : /artesan|decorativ|adorno/.test(t) ? 'Artesanías' : 'Plantas'; };
    const mapEstado = { Pendiente: 'aceptada', Validar: 'por_validar', Completado: 'completada', Calificado: 'calificada' };
    let k = 0; const cuenta = {};
    for (const c of J('compras.json')) {
      const lista = provPorCat[catDe(c.productos)], prov = lista[k++ % lista.length], estado = mapEstado[c.estado] || 'aceptada';
      const oid = await ins(neg, `INSERT INTO orden_compra(nombre,proveedor_id,creada_por,estado,direccion_entrega,fecha_entrega,total,creada_en)
        VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz, now()))`,
        [c.nombrePedido, prov, uid.gerente, estado, c.direccionEntrega, dia(c.fechaEntrega), pesos(c.valorTotal), dia(c.fechaCreacion)]);
      for (const it of c.productos)
        await neg.query('INSERT INTO orden_item(orden_id,descripcion,cantidad,valor_unitario) VALUES ($1,$2,$3,$4)', [oid, it.nombre, it.cantidad, pesos(it.valorUnitario)]);
      cuenta[prov] = (cuenta[prov] || 0) + 1;
      if (estado === 'calificada') {
        const base = Math.round(legacyCalif[prov] || 4), v = n => Math.max(1, Math.min(5, base + ((oid + n) % 3) - 1));
        await neg.query('INSERT INTO calificacion(orden_id,proveedor_id,puntaje,puntualidad,calidad,calificado_por) VALUES ($1,$2,$3,$4,$5,$6)', [oid, prov, v(0), v(1), v(2), uid.gerente]);
      }
    }
    // La cuenta "proveedor" del demo queda enlazada al proveedor con más órdenes
    const miProv = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a])[0];
    await neg.query('UPDATE proveedor SET cuenta_id = $1 WHERE id = $2', [uid.proveedor, Number(miProv)]);

    for (const h of J('historialDecambios.json'))
      await neg.query('INSERT INTO auditoria(usuario_id,accion,detalle,creado_en) VALUES ($1,$2,$3,COALESCE($4::timestamptz, now()))',
        [uid[String(h.rol).toLowerCase()] || null, h.accion, h.descripcion, hora(h.fechaHora)]);

    await neg.query('COMMIT'); await idc.query('COMMIT');
    for (const t of ['categoria', 'empleado', 'proveedor', 'producto', 'orden_compra', 'orden_item', 'calificacion', 'auditoria'])
      console.log(t.padEnd(14), (await neg.query(`SELECT COUNT(*)::int n FROM ${t}`)).rows[0].n);
    console.log(`cuenta         ${(await idc.query('SELECT COUNT(*)::int n FROM cuenta')).rows[0].n}`);
    console.log(`productos reasignados a un proveedor de su categoría: ${reasignados}`);
    console.log(`Listo. Usuarios demo: admin@vivero.com, gerente@vivero.com, empleado@vivero.com, proveedor@vivero.com / clave: ${DEMO_PASSWORD}`);
  } catch (e) { await idc.query('ROLLBACK').catch(() => {}); await neg.query('ROLLBACK').catch(() => {}); throw e; }
  finally { await idc.end(); await neg.end(); }
})().catch(e => { console.error('Falló el seed:', e.message); process.exit(1); });
