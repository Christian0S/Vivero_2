# SRM Vivero Las Magnolias

Gestión de inventario y proveedores para un vivero. Catálogo público para clientes y aplicación interna por rol.

## Puesta en marcha (Windows, PowerShell)
Requisitos: Node.js, Git y Docker Desktop abierto.

    npm install
    npm run setup:env     # crea/completa .env (claves aleatorias) y las llaves de firma en keys/
    npm run db:up         # levanta PostgreSQL en Docker (la primera vez descarga la imagen)
    npm run db:reset      # crea las dos bases, migra y carga los datos de demostración
    npm test              # pruebas de API, tokens, permisos y seguridad de las bases
    npm start             # abre http://localhost:3000

Usuarios demo (solo desarrollo), todos con clave `Vivero2026!`:
`admin@vivero.com`, `gerente@vivero.com`, `empleado@vivero.com`, `proveedor@vivero.com`.

## Arquitectura: dos servicios, dos bases
    Navegador ──► Negocio (:3000) ──proxy /api/auth──► Identidad (:3001)
                     │  verifica tokens (llave PÚBLICA)      │  firma tokens (llave PRIVADA)
                     ▼                                       ▼
                  BD srm_negocio                         BD srm_identidad

| Servicio | Hace | Conoce |
|---|---|---|
| **Identidad** (`identidad/`) | Login, sesiones, roles y permisos, administración de cuentas | Solo `srm_identidad` y la llave privada |
| **Negocio** (`src/`) | Catálogo, inventario, proveedores, perfiles, auditoría | Solo `srm_negocio` y la llave pública |

`npm start` arranca los dos como procesos separados y a cada uno solo le entrega sus propias credenciales
(`scripts/lib-env.js`). Identidad escucha únicamente en `127.0.0.1`.
Si identidad se cae, quien ya inició sesión sigue trabajando (el negocio solo verifica la firma); iniciar sesión da un 502 claro.

## Cómo funciona la sesión
- **Token de acceso**: JWT firmado con **EdDSA (Ed25519)**, dura 10 minutos, viaja en cookie `httpOnly`. Lleva rol y permisos.
  El negocio solo puede **verificar** (llave pública): aunque lo comprometan no puede fabricar sesiones. Se rechazan `alg: none`,
  firmas de otra llave, ataques de confusión HS256, tokens vencidos o de otra aplicación.
- **Token de renovación**: 256 bits aleatorios, cookie `httpOnly` + `SameSite=Strict` que **solo viaja a `/api/auth`**.
  En la base solo se guarda su huella SHA-256. **Rota en cada uso**; si alguien reutiliza uno ya usado (robo), se cierran todas las sesiones
  de esa cadena y queda un evento de seguridad. Dura 7 días con tope absoluto de 30.
- El front renueva solo cuando el token vence (ver `public/js/api.js`).
- **Contraseñas**: argon2id (`hash-wasm`, sin compilar nada). Mínimo 10 caracteres. Las cuentas nuevas o restablecidas usan una clave temporal y
  la app obliga a cambiarla antes de continuar.
- **Límite de intentos** guardado en la base de datos (5 fallos por correo / 50 por IP cada 15 min): sobrevive a reinicios.
- **Anti-CSRF**: `SameSite` + verificación de `Origin` en los cambios de datos.

## Roles y permisos
Los permisos son **datos** que edita el administrador en la pantalla *Permisos* (los cambios rigen en el próximo login o renovación, máx. 10 min).
El administrador siempre tiene todos. Para proteger una ruta: `requirePermiso('inventario.ver')` (`compartido/auth.js`).
Para agregar un permiso: una migración nueva en `migrations/identidad/` y listo; aparece solo en la matriz.

| Permiso | Admin | Gerente | Empleado | Proveedor |
|---|:-:|:-:|:-:|:-:|
| dashboard.ver | ✓ | ✓ | ✓ | ✓ |
| inventario.ver | ✓ | ✓ | ✓ | |
| proveedores.ver | ✓ | ✓ | ✓ | |
| usuarios.admin | ✓ | | | |
| permisos.admin | ✓ | | | |
| parametros.admin | ✓ | | | |

El administrador no puede cambiar su propio rol ni desactivarse, y siempre debe quedar al menos un administrador activo.
El proveedor **nunca** recibe calificaciones (ni las suyas).

## Bases de datos
| Base | Contiene | Usuario de la app |
|---|---|---|
| `srm_identidad` | Cuentas, roles, permisos, sesiones, eventos de seguridad | `srm_identidad_app` |
| `srm_negocio` | Perfiles, productos, proveedores, órdenes, auditoría | `srm_negocio_app` |

Cada usuario solo entra a su base, solo con permisos de datos (nada de DDL), y `auditoria` y `evento_seguridad` son **solo inserción**.
Cuenta y perfil comparten el mismo UUID, sin llave foránea entre bases a propósito.
Los cambios de estructura son archivos nuevos `migrations/<base>/00N_nombre.sql` (una migración aplicada no se edita: el sistema lo detecta).

## Archivos
La base guarda los **datos** del archivo (tabla `archivo`) y el archivo vive en disco, en `almacenamiento/` (configurable con `ALMACEN_DIR`).
- **Ruta y nombre**: `usuarios/{id}/foto_20261113-051530_a1b2c3d4.webp` → qué es, fecha y hora (UTC), sufijo aleatorio.
- **Se confía en los bytes, no en el nombre**: solo PNG, JPEG y WebP (el SVG se rechaza porque puede llevar código); máximo 600 KB.
  El navegador reduce la foto a 256 px antes de subirla.
- **Huella SHA-256** de cada archivo: prueba de que no fue alterado.
- **Nunca se borran desde la app**: se marcan como eliminados (la app no tiene `DELETE` ni puede cambiar la huella). Es la base de la evidencia en pedidos y reclamos.
- **Se descargan solo con sesión** y permiso sobre ese archivo (`/api/archivos/:id`), con `nosniff` y CSP `sandbox`. No hay carpetas públicas.
- Para sumar un tipo de archivo (producto, soporte, factura): ampliar el `CHECK` de `archivo.tipo` con una migración y su regla de acceso en `src/routes/archivos.js`.

## Mi perfil, parámetros y notificaciones
- **Mi perfil** (todos los roles): nombre, apellidos, teléfono, foto y cambio de contraseña. El rol, el correo y el estado NO se editan ahí.
- **Parámetros** (solo administrador): datos del vivero, IVA y stock mínimo por defecto, plazos de alerta, prefijo de pedidos. Cada uno se valida según su tipo y rango.
  Los marcados como públicos (nombre, teléfono, WhatsApp, dirección) aparecen en el catálogo, que muestra un botón de WhatsApp si se configuró.
- **Campana**: notificaciones calculadas al momento según los permisos de quien pregunta. Hoy: stock bajo. La Fase 8 agrega entregas por confirmar, calificaciones pendientes y proveedores inactivos.

## Comandos
| Comando | Qué hace |
|---|---|
| `npm run setup:env` | Genera `.env` y las llaves de firma sin imprimir secretos |
| `npm run db:up` / `db:down` | Enciende / apaga PostgreSQL (`db:down` NO borra los datos) |
| `npm run db:reset` | Recrea todo desde cero (solo desarrollo): setup + migrate + seed |
| `npm run db:migrate` | Aplica migraciones pendientes y ajusta permisos |
| `npm run db:seed` | Vacía y recarga los datos de demostración |
| `npm start` / `npm run dev` | Los dos servicios / con recarga automática |
| `npm run start:identidad` / `start:negocio` | Un servicio por separado |
| `npm test` | Levanta ambos servicios y corre todas las pruebas |

## Estructura
    public/        front (login, catálogo público, aplicación interna)
    src/           servicio de negocio
    identidad/     servicio de identidad
    compartido/    verificación de tokens, permisos y anti-CSRF (usado por ambos)
    migrations/    SQL versionado, una carpeta por base
    scripts/       setup:env, db-setup, migrate, seed, arrancar
    keys/          llaves de firma (NO se suben a Git)
    almacenamiento/ archivos subidos (fotos, luego documentos). NO se sube a Git
    legacy/jsons   datos del prototipo (solo los lee el seed)

## Problemas frecuentes
| Síntoma | Causa y solución |
|---|---|
| `No se pudo conectar a PostgreSQL` | Docker Desktop cerrado o falta `npm run db:up` |
| `password authentication failed` | Cambiaste `PG_ADMIN_PASSWORD` después de crear el contenedor. De cero: `docker compose down -v` (borra datos), luego `db:up` y `db:reset` |
| `No se encuentra la llave pública` | Corre `npm run setup:env` |
| Al iniciar sesión sale "servicio de identidad no disponible" | Arrancaste solo el negocio; usa `npm start` |
| `EADDRINUSE` en 3000/3001 | Hay otro servidor corriendo; ciérralo (o cambia `PORT` / `IDENTIDAD_PORT` en `.env`) |
| Un cambio de rol/permiso no se nota | Rige en el próximo login o renovación (máx. 10 min) |

## Historial de fases
1. Base de datos y carga de datos del prototipo. 2. API de login y roles. 2.5. Front reorganizado: catálogo público, tema, perfil.
3A. PostgreSQL en Docker, dos bases, migraciones, auditoría inalterable.
3B. Servicio de identidad separado: tokens EdDSA, renovación rotativa, roles y permisos editables, administración de usuarios, cambio obligatorio de clave.
3C. Encabezado nuevo (campana, tema, menú de usuario), Mi perfil con foto, parámetros del sistema, base de archivos con huella SHA-256 y catálogo con WhatsApp.
