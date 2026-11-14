-- Fase 3C: teléfono y foto en el perfil, base de archivos (con huella digital) y parámetros del sistema.

-- Archivos: la base guarda los DATOS; el archivo vive en disco (almacenamiento/). Nunca se borra: se marca como eliminado.
CREATE TABLE archivo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo            text NOT NULL CHECK (tipo IN ('foto_perfil')),       -- cada fase agrega sus tipos con una migración
  ruta            text NOT NULL UNIQUE,                                -- relativa a almacenamiento/
  nombre_original text,
  mime            text NOT NULL CHECK (mime IN ('image/webp', 'image/jpeg', 'image/png', 'application/pdf')),
  bytes           integer NOT NULL CHECK (bytes > 0),
  sha256          text NOT NULL,                                       -- prueba de que el archivo no fue alterado
  subido_por      uuid NOT NULL REFERENCES perfil(cuenta_id),
  entidad         text NOT NULL,                                       -- a qué pertenece: 'perfil', luego 'producto', 'pedido'...
  entidad_id      text NOT NULL,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  eliminado_en    timestamptz,
  eliminado_por   uuid REFERENCES perfil(cuenta_id)
);
CREATE INDEX ix_archivo_entidad ON archivo (entidad, entidad_id);

ALTER TABLE perfil ADD COLUMN telefono text, ADD COLUMN foto_id uuid REFERENCES archivo(id);

-- Parámetros: ajustes que el administrador cambia sin tocar código
CREATE TABLE parametro (
  clave          text PRIMARY KEY,
  valor          text NOT NULL DEFAULT '',
  tipo           text NOT NULL CHECK (tipo IN ('texto', 'entero', 'decimal', 'telefono', 'whatsapp', 'correo')),
  grupo          text NOT NULL,
  descripcion    text NOT NULL,
  minimo         numeric,
  maximo         numeric,
  publico        boolean NOT NULL DEFAULT false,                       -- true: se muestra en el catálogo público
  actualizado_por uuid,                                                -- sin FK a propósito: el seed puede reiniciar perfiles
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
INSERT INTO parametro (clave, valor, tipo, grupo, descripcion, minimo, maximo, publico) VALUES
  ('empresa.nombre',    'Vivero Las Magnolias', 'texto',    'Empresa',    'Nombre del vivero',                                    NULL, NULL, true),
  ('empresa.telefono',  '',                     'telefono', 'Empresa',    'Teléfono de contacto',                                 NULL, NULL, true),
  ('empresa.whatsapp',  '',                     'whatsapp', 'Empresa',    'WhatsApp de atención, con indicativo (ej. +57 300 123 4567)', NULL, NULL, true),
  ('empresa.direccion', '',                     'texto',    'Empresa',    'Dirección del vivero',                                 NULL, NULL, true),
  ('empresa.correo',    '',                     'correo',   'Empresa',    'Correo de contacto',                                   NULL, NULL, false),
  ('empresa.nit',       '',                     'texto',    'Empresa',    'NIT o documento de la empresa',                        NULL, NULL, false),
  ('inventario.iva_por_defecto',          '19', 'decimal',  'Inventario', 'IVA por defecto para productos nuevos (%)',            0, 100,  false),
  ('inventario.stock_minimo_por_defecto', '5',  'entero',   'Inventario', 'Stock mínimo por defecto para productos nuevos',       0, 9999, false),
  ('alertas.dias_entrega_sin_confirmar',  '3',  'entero',   'Alertas',    'Días tras los cuales una entrega sin confirmar genera alerta', 1, 90, false),
  ('alertas.meses_proveedor_inactivo',    '3',  'entero',   'Alertas',    'Meses sin pedidos para considerar inactivo a un proveedor',    1, 60, false),
  ('pedidos.prefijo',   'PED',                  'texto',    'Pedidos',    'Prefijo del consecutivo de pedidos',                   NULL, NULL, false);
