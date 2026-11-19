-- Teléfonos de proveedores en formato internacional (+573101234567): lo que necesitan WhatsApp y tel:.
-- 'telefono' es para llamar; 'whatsapp' es para escribir (un fijo no recibe WhatsApp, por eso son campos distintos).
ALTER TABLE proveedor ADD COLUMN whatsapp text;

-- Corrige lo que ya está guardado (cada regla cubre un error común; lo que no reconoce se deja tal cual y se avisa al migrar)
UPDATE proveedor p SET telefono = CASE
    WHEN trim(coalesce(p.telefono, '')) = ''                              THEN NULL                             -- vacío
    WHEN d.dig ~ '^3[0-9]{9}$'                                            THEN '+57' || d.dig                   -- 310 123 4567 y también "+310 123 4567"
    WHEN p.telefono ~ '^\+[1-9][0-9]{7,14}$'                              THEN p.telefono                       -- ya está bien
    WHEN d.dig ~ '^573[0-9]{9}$'                                          THEN '+' || d.dig                     -- 57 sin "+"
    WHEN d.dig ~ '^57573[0-9]{9}$'                                        THEN '+' || substr(d.dig, 3)          -- 57 repetido
    WHEN d.dig ~ '^60[0-9]{8}$'                                           THEN '+57' || d.dig                   -- fijo con indicativo de ciudad
    WHEN d.dig ~ '^5760[0-9]{8}$'                                         THEN '+' || d.dig
    WHEN p.telefono ~ '^\+' AND d.dig ~ '^[1-9][0-9]{7,14}$'              THEN '+' || d.dig                     -- internacional con espacios o guiones
    ELSE p.telefono END
  FROM (SELECT id, regexp_replace(coalesce(telefono, ''), '[^0-9]', '', 'g') AS dig FROM proveedor) d
  WHERE d.id = p.id;

-- WhatsApp: celulares colombianos (los fijos no lo reciben) y números extranjeros (no se puede comprobar, se permite)
UPDATE proveedor SET whatsapp = telefono WHERE telefono ~ '^\+573[0-9]{9}$' OR (telefono ~ '^\+[1-9][0-9]{7,14}$' AND telefono !~ '^\+57');

-- Los datos nuevos deben venir bien. El de 'telefono' no revisa las filas viejas (las que no se pudieron corregir se avisan al migrar).
ALTER TABLE proveedor ADD CONSTRAINT proveedor_telefono_e164 CHECK (telefono IS NULL OR telefono ~ '^\+[1-9][0-9]{7,14}$') NOT VALID;
ALTER TABLE proveedor ADD CONSTRAINT proveedor_whatsapp_e164 CHECK (whatsapp IS NULL OR whatsapp ~ '^\+[1-9][0-9]{7,14}$');
