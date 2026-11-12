-- SRM Vivero Las Magnolias · esquema v1 (SQLite; portable a PostgreSQL)
PRAGMA foreign_keys = ON;

-- 1. Acceso: un solo lugar para login y roles
CREATE TABLE usuario (
  id            INTEGER PRIMARY KEY,
  nombre        TEXT NOT NULL DEFAULT '',
  apellidos     TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,                       -- bcrypt, NO sha256 del front
  rol           TEXT NOT NULL CHECK (rol IN ('gerente','empleado','proveedor')),
  activo        INTEGER NOT NULL DEFAULT 1,
  creado_en     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Personas internas (gerente / empleados)
CREATE TABLE empleado (
  id             INTEGER PRIMARY KEY,
  usuario_id     INTEGER UNIQUE REFERENCES usuario(id),
  nombre         TEXT NOT NULL,
  apellidos      TEXT,
  tipo_doc       TEXT, numero_doc TEXT,
  pais TEXT, ciudad TEXT, direccion TEXT, telefono TEXT,
  cargo          TEXT,
  antecedentes   TEXT,
  hoja_vida_url  TEXT,
  avatar_url     TEXT,
  eliminado      INTEGER NOT NULL DEFAULT 0,          -- borrado lógico
  creado_en      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. Proveedores
CREATE TABLE categoria (
  id INTEGER PRIMARY KEY, nombre TEXT NOT NULL UNIQUE   -- Plantas, Materas, Artesanías, Abonos-Tierra
);

CREATE TABLE proveedor (
  id           INTEGER PRIMARY KEY,
  usuario_id   INTEGER UNIQUE REFERENCES usuario(id),  -- NULL si aún no tiene acceso al portal
  nombre       TEXT NOT NULL,
  tipo_doc     TEXT, numero_doc TEXT,
  pais TEXT, ciudad TEXT, direccion TEXT, telefono TEXT, correo TEXT,
  categoria_id INTEGER REFERENCES categoria(id),
  imagen_url   TEXT,
  activo       INTEGER NOT NULL DEFAULT 1,
  creado_por   INTEGER REFERENCES usuario(id),
  creado_en    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 4. Inventario
CREATE TABLE producto (
  id               INTEGER PRIMARY KEY,
  nombre           TEXT NOT NULL,
  categoria_id     INTEGER REFERENCES categoria(id),
  proveedor_id     INTEGER REFERENCES proveedor(id),   -- proveedor habitual
  descripcion      TEXT,
  imagen_url       TEXT,
  precio_base      INTEGER NOT NULL,                   -- COP, enteros: nunca "$15,000" como texto
  pct_ganancia     REAL    NOT NULL DEFAULT 0,
  pct_iva          REAL    NOT NULL DEFAULT 19,
  precio_venta     INTEGER NOT NULL,
  stock            INTEGER NOT NULL DEFAULT 0,
  stock_minimo     INTEGER NOT NULL DEFAULT 0,         -- dispara "inventario bajo"
  activo           INTEGER NOT NULL DEFAULT 1,
  creado_por       INTEGER REFERENCES usuario(id),
  creado_en        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_producto_proveedor ON producto(proveedor_id);

-- 5. Proceso de compra: cotización -> orden -> entrega/validación -> calificación
--    Una sola tabla "orden_compra" con estado reemplaza compras/cotizaciones/rechazadas/historial.
CREATE TABLE orden_compra (
  id               INTEGER PRIMARY KEY,
  nombre           TEXT NOT NULL,
  proveedor_id     INTEGER NOT NULL REFERENCES proveedor(id),
  creada_por       INTEGER NOT NULL REFERENCES usuario(id),
  estado           TEXT NOT NULL DEFAULT 'solicitada' CHECK (estado IN
                   ('solicitada','cotizada','aceptada','rechazada','en_entrega','por_validar','completada','calificada')),
  direccion_entrega TEXT,
  fecha_entrega    TEXT,                               -- ISO yyyy-mm-dd siempre
  total            INTEGER,                            -- lo fija la cotización aceptada
  motivo_rechazo   TEXT,
  creada_en        TEXT NOT NULL DEFAULT (datetime('now')),
  actualizada_en   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_orden_estado ON orden_compra(estado);

CREATE TABLE orden_item (
  id              INTEGER PRIMARY KEY,
  orden_id        INTEGER NOT NULL REFERENCES orden_compra(id) ON DELETE CASCADE,
  producto_id     INTEGER REFERENCES producto(id),
  descripcion     TEXT NOT NULL,                       -- permite pedir algo que aún no está en inventario
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
  valor_unitario  INTEGER                              -- lo llena el proveedor al cotizar
);

CREATE TABLE factura (
  id INTEGER PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES orden_compra(id),
  archivo_url TEXT, valor INTEGER, enviada_en TEXT DEFAULT (datetime('now'))
);

-- 6. Evaluación del proveedor (alimenta el "desempeño")
CREATE TABLE calificacion (
  id INTEGER PRIMARY KEY,
  orden_id     INTEGER NOT NULL UNIQUE REFERENCES orden_compra(id),
  proveedor_id INTEGER NOT NULL REFERENCES proveedor(id),
  puntaje      INTEGER NOT NULL CHECK (puntaje BETWEEN 1 AND 5),
  puntualidad  INTEGER CHECK (puntualidad BETWEEN 1 AND 5),
  calidad      INTEGER CHECK (calidad BETWEEN 1 AND 5),
  comentario   TEXT,
  calificado_por INTEGER REFERENCES usuario(id),
  creada_en    TEXT NOT NULL DEFAULT (datetime('now'))
);
-- promedio del proveedor = vista, no columna guardada (evita datos desactualizados)
CREATE VIEW proveedor_desempeno AS
  SELECT proveedor_id, ROUND(AVG(puntaje),2) AS promedio, COUNT(*) AS n
  FROM calificacion GROUP BY proveedor_id;

-- 7. Mensajes (chat) y auditoría
CREATE TABLE mensaje (
  id INTEGER PRIMARY KEY,
  de_usuario INTEGER NOT NULL REFERENCES usuario(id),
  a_usuario  INTEGER NOT NULL REFERENCES usuario(id),
  texto TEXT NOT NULL, creado_en TEXT NOT NULL DEFAULT (datetime('now')), leido INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE auditoria (            -- "historial de cambios" de las 3 vistas
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuario(id),
  accion TEXT NOT NULL,             -- catálogo corto: crear|editar|eliminar|cotizar|aceptar|rechazar|validar|calificar
  entidad TEXT, entidad_id INTEGER,
  detalle TEXT, creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
