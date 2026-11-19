-- Fase 4A: quién y cuándo modificó cada producto, y topes que la base misma hace cumplir.
ALTER TABLE producto ADD COLUMN actualizado_en timestamptz NOT NULL DEFAULT now(),
                     ADD COLUMN actualizado_por uuid REFERENCES perfil(cuenta_id);
ALTER TABLE producto ADD CONSTRAINT producto_ganancia_rango CHECK (pct_ganancia BETWEEN 0 AND 1000),
                     ADD CONSTRAINT producto_iva_rango CHECK (pct_iva BETWEEN 0 AND 100);
