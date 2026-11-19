-- Más datos en el perfil de cada persona; control de cambios en proveedores; y corrección de datos heredados.
ALTER TABLE perfil
  ADD COLUMN tipo_doc text CHECK (tipo_doc IS NULL OR tipo_doc IN ('Cédula', 'Cédula de extranjería', 'NIT', 'Pasaporte', 'Otro')),
  ADD COLUMN numero_doc text, ADD COLUMN cargo text, ADD COLUMN ciudad text, ADD COLUMN direccion text;
ALTER TABLE proveedor
  ADD COLUMN actualizado_en timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN actualizado_por uuid REFERENCES perfil(cuenta_id);

-- Teléfonos de personas en formato internacional, igual que los de proveedores. Lo reconocible se normaliza; lo que no se puede
-- interpretar se vacía, pero el valor anterior queda en la auditoría (nada se pierde sin dejar rastro).
WITH base AS (
  SELECT cuenta_id, telefono AS antes, regexp_replace(telefono, '[^0-9]', '', 'g') AS d FROM perfil WHERE telefono IS NOT NULL
), nuevo AS (
  SELECT cuenta_id, antes, CASE
      WHEN trim(antes) = ''                                  THEN NULL
      WHEN d ~ '^3[0-9]{9}$'                                 THEN '+57' || d
      WHEN d ~ '^573[0-9]{9}$'                               THEN '+' || d
      WHEN d ~ '^60[0-9]{8}$'                                THEN '+57' || d
      WHEN antes ~ '^\+' AND d ~ '^[1-9][0-9]{7,14}$'        THEN '+' || d
      ELSE NULL END AS despues
  FROM base
), cambios AS (
  UPDATE perfil p SET telefono = n.despues FROM nuevo n WHERE n.cuenta_id = p.cuenta_id AND p.telefono IS DISTINCT FROM n.despues
  RETURNING p.cuenta_id, n.antes, n.despues
)
INSERT INTO auditoria (usuario_id, accion, entidad, detalle)
SELECT NULL, 'perfil_actualizado', 'perfil',
       json_build_object('cuenta_id', cuenta_id, 'telefono', json_build_array(antes, despues), 'motivo', 'Migración: formato de teléfono no reconocido, se vació')::text
FROM cambios WHERE despues IS NULL AND trim(antes) <> '';
ALTER TABLE perfil ADD CONSTRAINT perfil_telefono_e164 CHECK (telefono IS NULL OR telefono ~ '^\+[1-9][0-9]{7,14}$');

-- Datos heredados: un producto debe tener un proveedor de SU categoría. Los que venían cruzados se pasan al primer
-- proveedor activo de la categoría correcta, y el cambio queda en la auditoría (sin usuario: lo hizo la migración).
WITH cruzados AS (
  SELECT p.id, p.proveedor_id AS antes,
         (SELECT v.id FROM proveedor v WHERE v.categoria_id = p.categoria_id AND v.activo ORDER BY v.id LIMIT 1) AS despues
  FROM producto p JOIN proveedor v ON v.id = p.proveedor_id
  WHERE p.categoria_id IS NOT NULL AND v.categoria_id IS DISTINCT FROM p.categoria_id
), arreglados AS (
  UPDATE producto p SET proveedor_id = c.despues, actualizado_en = now()
  FROM cruzados c WHERE c.id = p.id AND c.despues IS NOT NULL
  RETURNING p.id, c.antes, c.despues
)
INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle)
SELECT NULL, 'producto_modificado', 'producto', id, '{"proveedor_id":[' || antes || ',' || despues || '],"motivo":["","Migración: el proveedor no era de la categoría del producto"]}' FROM arreglados;
