-- Base del NEGOCIO. El acceso (correo, contraseña, sesiones) vive en la base de identidad.
-- perfil.cuenta_id es el mismo id que cuenta.id allá; no hay llave foránea entre bases a propósito.
CREATE TABLE perfil (
  cuenta_id uuid PRIMARY KEY,
  nombre    text NOT NULL DEFAULT '',
  apellidos text NOT NULL DEFAULT '',
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categoria (
  id     integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL UNIQUE
);

CREATE TABLE empleado (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cuenta_id     uuid UNIQUE REFERENCES perfil(cuenta_id),
  nombre        text NOT NULL,
  apellidos     text,
  tipo_doc      text, numero_doc text,
  pais text, ciudad text, direccion text, telefono text,
  cargo         text,
  antecedentes  text,
  hoja_vida_url text,
  avatar_url    text,
  eliminado     boolean NOT NULL DEFAULT false,
  creado_en     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE proveedor (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cuenta_id    uuid UNIQUE REFERENCES perfil(cuenta_id),      -- NULL si aún no tiene acceso al portal
  nombre       text NOT NULL,
  tipo_doc     text, numero_doc text,
  pais text, ciudad text, direccion text, telefono text, correo text,
  categoria_id integer REFERENCES categoria(id),
  imagen_url   text,
  activo       boolean NOT NULL DEFAULT true,
  creado_por   uuid REFERENCES perfil(cuenta_id),
  creado_en    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_proveedor_categoria ON proveedor (categoria_id);

CREATE TABLE producto (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre       text NOT NULL,
  categoria_id integer REFERENCES categoria(id),
  proveedor_id integer REFERENCES proveedor(id),               -- proveedor habitual
  descripcion  text,
  imagen_url   text,
  precio_base  integer NOT NULL CHECK (precio_base >= 0),      -- COP, pesos enteros
  pct_ganancia numeric(6,2) NOT NULL DEFAULT 0,
  pct_iva      numeric(5,2) NOT NULL DEFAULT 19,
  precio_venta integer NOT NULL CHECK (precio_venta >= 0),
  stock        integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  stock_minimo integer NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  activo       boolean NOT NULL DEFAULT true,
  creado_por   uuid REFERENCES perfil(cuenta_id),
  creado_en    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_producto_proveedor ON producto (proveedor_id);
CREATE INDEX ix_producto_categoria ON producto (categoria_id);

CREATE TABLE orden_compra (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre            text NOT NULL,
  proveedor_id      integer NOT NULL REFERENCES proveedor(id),
  creada_por        uuid NOT NULL REFERENCES perfil(cuenta_id),
  estado            text NOT NULL DEFAULT 'solicitada' CHECK (estado IN
                    ('solicitada','cotizada','aceptada','rechazada','en_entrega','por_validar','completada','calificada')),
  direccion_entrega text,
  fecha_entrega     date,
  total             integer CHECK (total >= 0),
  motivo_rechazo    text,
  creada_en         timestamptz NOT NULL DEFAULT now(),
  actualizada_en    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_orden_estado ON orden_compra (estado);
CREATE INDEX ix_orden_proveedor ON orden_compra (proveedor_id);

CREATE TABLE orden_item (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  orden_id       integer NOT NULL REFERENCES orden_compra(id) ON DELETE CASCADE,
  producto_id    integer REFERENCES producto(id),
  descripcion    text NOT NULL,                                -- permite pedir algo que aún no está en inventario
  cantidad       integer NOT NULL CHECK (cantidad > 0),
  valor_unitario integer CHECK (valor_unitario >= 0)
);
CREATE INDEX ix_item_orden ON orden_item (orden_id);

CREATE TABLE calificacion (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  orden_id       integer NOT NULL UNIQUE REFERENCES orden_compra(id),
  proveedor_id   integer NOT NULL REFERENCES proveedor(id),
  puntaje        integer NOT NULL CHECK (puntaje BETWEEN 1 AND 5),
  puntualidad    integer CHECK (puntualidad BETWEEN 1 AND 5),
  calidad        integer CHECK (calidad BETWEEN 1 AND 5),
  comentario     text,
  calificado_por uuid REFERENCES perfil(cuenta_id),
  creada_en      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_calif_proveedor ON calificacion (proveedor_id);

-- El promedio es una vista, no una columna: nunca queda desactualizado.
CREATE VIEW proveedor_desempeno AS
  SELECT proveedor_id, ROUND(AVG(puntaje), 2) AS promedio, COUNT(*) AS n
  FROM calificacion GROUP BY proveedor_id;

CREATE TABLE auditoria (                                        -- solo inserción (ver migrate.js)
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id uuid REFERENCES perfil(cuenta_id),
  accion     text NOT NULL,
  entidad    text,
  entidad_id integer,
  detalle    text,
  creado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_auditoria_fecha ON auditoria (creado_en DESC);
