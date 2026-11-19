# Arquitectura

## Visión general

```
Navegador ──► Negocio (:3000) ──proxy /api/auth──► Identidad (:3001)
                 │  verifica tokens (llave PÚBLICA)      │  firma tokens (llave PRIVADA)
                 ▼                                       ▼
              BD srm_negocio                         BD srm_identidad
              almacenamiento/ (archivos)
```

| Servicio | Hace | Conoce |
|---|---|---|
| **Identidad** (`identidad/`) | Login, sesiones, roles y permisos, administración de cuentas | Solo `srm_identidad` y la llave privada |
| **Negocio** (`src/`) | Catálogo, inventario, proveedores, perfiles, parámetros, archivos, auditoría | Solo `srm_negocio` y la llave pública |

`npm start` arranca los dos como procesos separados y entrega a cada uno solo sus credenciales (`scripts/lib-env.js`). Identidad escucha únicamente en `127.0.0.1`. Si identidad se cae, quien ya tiene sesión sigue trabajando (el negocio solo verifica la firma); iniciar sesión da un 502 claro.

## Sesión

- **Token de acceso**: JWT firmado con EdDSA (Ed25519), dura 10 minutos, viaja en cookie `httpOnly`. Lleva rol y permisos. El negocio solo puede **verificar**: aunque lo comprometan no puede fabricar sesiones. Se rechazan `alg: none`, firmas de otra llave, confusión HS256, tokens vencidos o emitidos para otra aplicación.
- **Token de renovación**: 256 bits aleatorios en cookie `httpOnly` + `SameSite=Strict` que solo viaja a `/api/auth`. En la base solo se guarda su huella SHA-256. **Rota en cada uso**; si alguien reutiliza uno ya usado se cierran todas las sesiones de esa cadena y queda un evento de seguridad. Dura 7 días, con tope absoluto de 30.
- El front renueva solo cuando el token vence (`public/js/api.js`).
- **Contraseñas**: argon2id (`hash-wasm`, no compila nada). Mínimo 10 caracteres. Las cuentas nuevas o restablecidas usan una clave temporal y la aplicación obliga a cambiarla.
- **Límite de intentos** guardado en la base (5 fallos por correo / 50 por IP cada 15 minutos).
- **Anti-CSRF**: `SameSite` y verificación de `Origin` en toda petición que modifica datos.

## Roles y permisos

Los permisos son datos que edita el administrador en la pantalla *Permisos*; el administrador siempre tiene todos. Los cambios rigen en el siguiente inicio de sesión o renovación (máximo 10 minutos). Para proteger una ruta: `requirePermiso('inventario.ver')` (`compartido/auth.js`).

| Permiso | Admin | Gerente | Empleado | Proveedor |
|---|:-:|:-:|:-:|:-:|
| dashboard.ver | ✓ | ✓ | ✓ | ✓ |
| inventario.ver | ✓ | ✓ | ✓ | |
| inventario.editar | ✓ | ✓ | | |
| proveedores.ver | ✓ | ✓ | ✓ | |
| proveedores.editar | ✓ | ✓ | | |
| proveedor.editar_propio | ✓* | | | ✓ |
| usuarios.admin | ✓ | | | |
| permisos.admin | ✓ | | | |
| parametros.admin | ✓ | | | |

\* El administrador tiene todos los permisos, pero *Mi empresa* solo aparece en cuentas de proveedor vinculadas a una empresa.

### Qué puede actualizar cada rol

| Dato | Admin | Gerente | Empleado | Proveedor |
|---|:-:|:-:|:-:|:-:|
| Su propio perfil: nombre, apellidos, teléfono, ciudad, dirección, foto y contraseña | ✓ | ✓ | ✓ | ✓ |
| Su propio documento y cargo | – | – | – | – |
| Documento, cargo y datos personales de cualquier usuario | ✓ | – | – | – |
| Correo, rol y estado de **otro** usuario | ✓ | – | – | – |
| Su propio correo, rol y estado | – | – | – | – |
| Productos (crear, editar, activar/desactivar) | ✓ | ✓ | – | – |
| Cualquier proveedor (todos sus datos) | ✓ | ✓ | – | – |
| El contacto de **su propia** empresa (teléfono, WhatsApp, correo, dirección) | – | – | – | ✓ |
| Nombre, documento y categoría de su empresa | – | – | – | – |
| Parámetros del sistema y matriz de permisos | ✓ | – | – | – |

Cada cambio queda en la auditoría con el valor de antes y el de después y quién lo hizo.

El administrador no puede cambiar su propio rol ni su propio correo ni desactivarse, y siempre debe quedar al menos un administrador activo. El proveedor nunca recibe calificaciones. Quien solo consulta inventario no ve costos ni márgenes.

## Bases de datos

| Base | Contiene | Usuario de la aplicación |
|---|---|---|
| `srm_identidad` | Cuentas, roles, permisos, sesiones, eventos de seguridad | `srm_identidad_app` |
| `srm_negocio` | Perfiles, productos, proveedores, órdenes, parámetros, archivos, auditoría | `srm_negocio_app` |

- Cada usuario entra **solo a su base** y solo con permisos de datos (nada de DDL).
- `auditoria` y `evento_seguridad` son de **solo inserción**; `archivo` solo permite marcar como eliminado.
- Cuenta y perfil comparten el mismo UUID, sin llave foránea entre bases a propósito.
- El superusuario (`PG_ADMIN_*`) solo lo usan los scripts de `scripts/`; el servidor nunca.

## Archivos

La base guarda los **datos** del archivo (tabla `archivo`) y el archivo vive en disco, en `almacenamiento/` (configurable con `ALMACEN_DIR`).

- **Ruta y nombre**: `usuarios/{id}/foto_20261113-051530_a1b2c3d4.webp` — qué es, fecha y hora (UTC), sufijo aleatorio.
- **Se confía en los bytes, no en el nombre**: solo PNG, JPEG y WebP (el SVG se rechaza porque puede llevar código); la foto de perfil admite hasta 600 KB y el navegador la reduce a 256 px antes de subirla.
- **Huella SHA-256** de cada archivo: prueba de que no fue alterado.
- **Nunca se borran desde la aplicación**: se marcan como eliminados. La base impide borrar el registro o cambiar la huella.
- **Se descargan solo con sesión** y permiso sobre ese archivo (`/api/archivos/:id`), con `nosniff` y CSP `sandbox`. No hay carpetas públicas.

## Teléfonos y WhatsApp

Los teléfonos se guardan en formato internacional (`+573101234567`), que es lo que necesitan WhatsApp (`https://wa.me/573101234567`) y `tel:`. En proveedores hay dos campos: `telefono` (llamadas) y `whatsapp` (mensajes), porque un fijo no recibe WhatsApp.

- `compartido/telefonos.js` normaliza lo que se escriba: celular sin indicativo, con espacios o guiones, el `+` sin el 57, el 57 repetido, etc. Lo que no puede interpretar se rechaza en lugar de adivinar.
- La base misma rechaza registros nuevos con un formato incorrecto, tanto en proveedores como en las personas.
- En el computador un enlace `tel:` no hace nada, así que no hay botón de llamar: el número se muestra y, al pulsarlo (o con *Copiar teléfono*), se copia con el aviso «Teléfono copiado exitosamente».
- Al migrar se avisa si queda algún proveedor con un teléfono que no pudo corregirse.

## Productos y proveedores

Un producto solo puede tener un proveedor de **su categoría**: el formulario filtra la lista según la categoría elegida y el servidor lo exige. La categoría de un proveedor no se puede cambiar mientras tenga productos asociados.

## Precios

`precio de venta = costo × (1 + ganancia %) × (1 + IVA %)`, al peso. Siempre lo calcula el servidor (`compartido/precios.js`); el navegador solo muestra una vista previa con la misma fórmula, y una prueba automática garantiza que nunca se separen.

## Migraciones

Los cambios de estructura son archivos nuevos `migrations/<base>/00N_nombre.sql`. Una migración ya aplicada no se edita (el sistema lo detecta y se detiene): se crea otra. `npm run db:migrate` las aplica en orden, cada una dentro de una transacción, y al terminar ajusta los permisos y muestra avisos de calidad de datos.

## Estructura de carpetas

```
public/          front (login, catálogo público, aplicación interna)
src/             servicio de negocio
identidad/       servicio de identidad
compartido/      verificación de tokens, permisos, teléfonos y precios (usado por ambos)
migrations/      SQL versionado, una carpeta por base
scripts/         setup:env, db-setup, migrate, seed, arrancar
keys/            llaves de firma (no se suben a Git)
almacenamiento/  archivos subidos (no se suben a Git)
legacy/jsons     datos del prototipo (solo los lee el seed)
test/            pruebas automáticas
docs/            esta documentación
```

## Cómo extender

- **Pantalla nueva**: crea `public/js/pages/nombre.js` (exporta `title` y `render`), regístrala en `PAGES` y `NAV` de `public/js/app.js` y, si necesita datos, su ruta en `src/routes/` con `requirePermiso(...)`.
- **Permiso nuevo**: una migración en `migrations/identidad/` (inserta en `permiso` y en `rol_permiso`); aparece solo en la matriz.
- **Cambio de estructura**: una migración nueva en la carpeta de la base que corresponda.
- **Tipo de archivo nuevo**: amplía el `CHECK` de `archivo.tipo` con una migración y su regla de acceso en `src/routes/archivos.js`.
- **Parámetro nuevo**: una migración que inserte en `parametro` (con tipo y rango); aparece solo en la pantalla.

## Límites conocidos

- Las cookies llevan `Secure` solo con `NODE_ENV=production`; en producción hace falta HTTPS y un proxy inverso delante.
- El límite de intentos usa la IP que informe el proxy local; detrás de otro proxy hay que configurar `trust proxy`.
- Falta la verificación en dos pasos para administrador y gerente.
