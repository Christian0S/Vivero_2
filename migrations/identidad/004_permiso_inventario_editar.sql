-- Fase 4A: quién puede crear y editar productos (el administrador lo tiene siempre; se le asigna también al gerente).
INSERT INTO permiso (codigo, descripcion) VALUES ('inventario.editar', 'Crear y editar productos, y ajustar su stock');
INSERT INTO rol_permiso (rol, permiso) VALUES ('administrador', 'inventario.editar'), ('gerente', 'inventario.editar');
