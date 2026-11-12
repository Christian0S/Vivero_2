-- Base de IDENTIDAD: solo credenciales y eventos de seguridad. Nada del negocio vive aquí.
CREATE TABLE cuenta (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- no adivinable
  email         text NOT NULL,
  password_hash text NOT NULL,
  rol           text NOT NULL CHECK (rol IN ('administrador', 'gerente', 'empleado', 'proveedor')),
  activo        boolean NOT NULL DEFAULT true,
  creada_en     timestamptz NOT NULL DEFAULT now(),
  ultimo_acceso timestamptz
);
CREATE UNIQUE INDEX cuenta_email_unico ON cuenta (lower(email));

CREATE TABLE evento_seguridad (                                 -- solo inserción (ver migrate.js)
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cuenta_id       uuid REFERENCES cuenta(id) ON DELETE SET NULL,
  email_intentado text,
  tipo            text NOT NULL CHECK (tipo IN ('login_ok', 'login_fallido', 'bloqueo')),
  ip              text,
  agente          text,
  creado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_evento_cuenta ON evento_seguridad (cuenta_id, creado_en DESC);
