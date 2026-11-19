-- Edición de proveedores: el gerente y el administrador editan cualquier proveedor;
-- el propio proveedor actualiza SOLO sus datos de contacto (no necesita al administrador).
INSERT INTO permiso (codigo, descripcion) VALUES
  ('proveedores.editar',      'Editar los datos de cualquier proveedor'),
  ('proveedor.editar_propio', 'Que un proveedor actualice los datos de contacto de su propia empresa');
INSERT INTO rol_permiso (rol, permiso) VALUES
  ('administrador', 'proveedores.editar'), ('gerente', 'proveedores.editar'),
  ('administrador', 'proveedor.editar_propio'), ('proveedor', 'proveedor.editar_propio');
