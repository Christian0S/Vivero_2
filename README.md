# SRM Vivero Las Magnolias

Gestión de inventario y proveedores para un vivero. Catálogo público para clientes y aplicación interna por rol.

## Puesta en marcha (Windows, PowerShell)
Requisitos: Node.js, Git y Docker Desktop abierto (ver la lista de instalación).

    npm install
    npm run setup:env     # crea/completa .env con claves aleatorias (no toca lo que ya tengas)
    npm run db:up         # levanta PostgreSQL en Docker (la primera vez descarga la imagen)
    npm run db:reset      # crea las dos bases, migra y carga los datos de demostración
    npm test              # 33 pruebas, incluida la seguridad de las bases
    npm start             # http://localhost:3000

Usuarios demo (solo desarrollo): `gerente@vivero.com`, `empleado@vivero.com`, `proveedor@vivero.com` — clave `Vivero2026!`.

## Comandos
| Comando | Qué hace |
|---|---|
| `npm run setup:env` | Genera `.env` (JWT y contraseñas de base de datos) sin imprimir secretos |
| `npm run db:up` / `db:down` | Enciende / apaga PostgreSQL (`db:down` NO borra los datos) |
| `npm run db:setup` | Crea las bases y sus usuarios (si no existen) |
| `npm run db:migrate` | Aplica migraciones pendientes y ajusta permisos |
| `npm run db:seed` | Vacía y recarga los datos de demostración desde `legacy/jsons` |
| `npm run db:reset` | Recrea todo desde cero: setup + migrate + seed (solo desarrollo) |
| `npm start` / `npm run dev` | Servidor / servidor con recarga automática |

## Estructura
    public/        front (login, catálogo público, aplicación interna)
    src/           API: server.js, db.js, config.js, rutas y middleware
    migrations/    SQL versionado, una carpeta por base (identidad, negocio)
    scripts/       init-env, db-setup, migrate, seed
    legacy/jsons   datos del prototipo (solo los lee el seed)
    test/          pruebas de humo de API y seguridad

## Dos bases de datos, dos usuarios
| Base | Contiene | Usuario de la app |
|---|---|---|
| `srm_identidad` | Cuentas (correo, hash de contraseña, rol) y eventos de seguridad | `srm_identidad_app` |
| `srm_negocio` | Perfiles, productos, proveedores, órdenes, auditoría | `srm_negocio_app` |

- Cada usuario solo puede **entrar a su base** y solo con permisos de datos (leer/escribir): no puede crear ni borrar tablas.
- `auditoria` y `evento_seguridad` son **solo inserción**: la app no puede modificarlas ni borrarlas.
- La cuenta y el perfil comparten el mismo UUID, sin llave foránea entre bases a propósito.
- El superusuario (`PG_ADMIN_*`) solo lo usan los scripts de `scripts/`, nunca el servidor.

## Migraciones
Los cambios de estructura son archivos nuevos `migrations/<base>/00N_nombre.sql`. Una migración ya aplicada **no se edita**
(el sistema lo detecta y se detiene): se crea una nueva. `npm run db:migrate` las aplica en orden y dentro de una transacción.

## Problemas frecuentes
| Síntoma | Causa y solución |
|---|---|
| `No se pudo conectar a PostgreSQL` | Docker Desktop no está abierto, o falta `npm run db:up` |
| `password authentication failed` | Cambiaste `PG_ADMIN_PASSWORD` después de crear el contenedor. Para empezar de cero: `docker compose down -v` (borra los datos), luego `db:up` y `db:reset` |
| `port is already allocated` (5432) | Otro PostgreSQL usa el puerto. Cambia `PG_PORT` en `.env` y repite `db:up` |
| `Faltan variables en .env` | Corre `npm run setup:env` |

## Historial de fases
1. Base de datos y carga de datos del prototipo.
2. API de login y roles.
2.5. Front reorganizado: catálogo público, tema claro/oscuro, perfil de usuario.
3A. PostgreSQL en Docker, dos bases con usuarios separados, migraciones versionadas, auditoría inalterable.
   También: el proveedor ya no recibe calificaciones (ni las suyas).
