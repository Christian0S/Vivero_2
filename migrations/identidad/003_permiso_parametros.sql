-- Fase 3C: permiso para editar los parámetros del sistema (el administrador lo tiene siempre).
INSERT INTO permiso (codigo, descripcion) VALUES ('parametros.admin', 'Editar los parámetros del sistema (datos del vivero, alertas)');
INSERT INTO rol_permiso (rol, permiso) VALUES ('administrador', 'parametros.admin');
