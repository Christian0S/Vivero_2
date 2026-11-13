-- Fase 3B: roles y permisos como DATOS (los edita el administrador), sesiones con renovación rotativa
-- y más tipos de evento de seguridad.
CREATE TABLE rol (
  nombre      text PRIMARY KEY,
  descripcion text NOT NULL
);
CREATE TABLE permiso (
  codigo      text PRIMARY KEY,
  descripcion text NOT NULL
);
CREATE TABLE rol_permiso (
  rol     text NOT NULL REFERENCES rol(nombre) ON DELETE CASCADE,
  permiso text NOT NULL REFERENCES permiso(codigo) ON DELETE CASCADE,
  PRIMARY KEY (rol, permiso)
);

INSERT INTO rol (nombre, descripcion) VALUES
  ('administrador', 'Configura el sistema, los usuarios y los permisos'),
  ('gerente',       'Representante legal; gestiona el negocio'),
  ('empleado',      'Opera inventario y recepción de pedidos'),
  ('proveedor',     'Usuario externo con acceso limitado');
INSERT INTO permiso (codigo, descripcion) VALUES
  ('dashboard.ver',   'Ver el panel de inicio'),
  ('inventario.ver',  'Ver el inventario de productos'),
  ('proveedores.ver', 'Ver la lista de proveedores'),
  ('usuarios.admin',  'Crear y administrar cuentas de usuario'),
  ('permisos.admin',  'Cambiar qué puede hacer cada rol');
INSERT INTO rol_permiso (rol, permiso) VALUES
  ('administrador', 'dashboard.ver'), ('administrador', 'inventario.ver'), ('administrador', 'proveedores.ver'),
  ('administrador', 'usuarios.admin'), ('administrador', 'permisos.admin'),
  ('gerente', 'dashboard.ver'), ('gerente', 'inventario.ver'), ('gerente', 'proveedores.ver'),
  ('empleado', 'dashboard.ver'), ('empleado', 'inventario.ver'), ('empleado', 'proveedores.ver'),
  ('proveedor', 'dashboard.ver');

ALTER TABLE cuenta DROP CONSTRAINT cuenta_rol_check;
ALTER TABLE cuenta ADD CONSTRAINT cuenta_rol_fk FOREIGN KEY (rol) REFERENCES rol(nombre);
ALTER TABLE cuenta ADD COLUMN debe_cambiar_clave boolean NOT NULL DEFAULT false;

-- Una "familia" es una cadena de renovaciones iniciada en un login. Cada renovación invalida la anterior;
-- si alguien reutiliza una ya usada, se revoca toda la familia (robo de sesión).
CREATE TABLE sesion (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id      uuid NOT NULL REFERENCES cuenta(id) ON DELETE CASCADE,
  familia        uuid NOT NULL,
  refresh_huella text NOT NULL UNIQUE,            -- SHA-256 del token; el token en sí nunca se guarda
  familia_inicio timestamptz NOT NULL,
  expira_en      timestamptz NOT NULL,
  rotada_en      timestamptz,
  revocada       boolean NOT NULL DEFAULT false,
  ip             text,
  agente         text,
  creada_en      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_sesion_cuenta  ON sesion (cuenta_id);
CREATE INDEX ix_sesion_familia ON sesion (familia);

ALTER TABLE evento_seguridad ADD COLUMN actor_id uuid, ADD COLUMN detalle text;
ALTER TABLE evento_seguridad DROP CONSTRAINT evento_seguridad_tipo_check;
ALTER TABLE evento_seguridad ADD CONSTRAINT evento_seguridad_tipo_check CHECK (tipo IN
  ('login_ok','login_fallido','bloqueo','logout','refresh','refresh_reutilizado','clave_cambiada',
   'cuenta_creada','cuenta_modificada','clave_restablecida','permisos_modificados'));
CREATE INDEX ix_evento_correo ON evento_seguridad (lower(email_intentado), tipo, creado_en DESC);
CREATE INDEX ix_evento_ip     ON evento_seguridad (ip, tipo, creado_en DESC);
