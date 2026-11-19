# Guía de uso local

## Requisitos

- Node.js, Git y Docker Desktop (abierto antes de empezar).
- PowerShell habilitado para scripts: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.

## Puesta en marcha

```
npm install
npm run setup:env     # crea/completa .env (claves aleatorias) y las llaves de firma en keys/
npm run db:up         # levanta PostgreSQL en Docker (la primera vez descarga la imagen)
npm run db:reset      # crea las dos bases, migra y carga los datos de demostración
npm test              # pruebas de API, tokens, permisos, productos, archivos y seguridad
npm start             # abre http://localhost:3000
```

Usuarios de demostración (solo desarrollo), todos con la clave `Vivero2026!`:
`admin@vivero.com`, `gerente@vivero.com`, `empleado@vivero.com`, `proveedor@vivero.com`.

Los datos de demostración incluyen teléfonos de ejemplo repetidos o inventados. **Antes de usar el botón de WhatsApp de un proveedor reemplaza su número por uno real**: un número inventado puede pertenecer a otra persona.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run setup:env` | Genera `.env` y las llaves de firma sin imprimir secretos |
| `npm run db:up` / `db:down` | Enciende / apaga PostgreSQL (`db:down` no borra los datos) |
| `npm run db:reset` | Recrea todo desde cero (solo desarrollo): setup + migrate + seed |
| `npm run db:migrate` | Aplica migraciones pendientes, ajusta permisos y avisa de datos a corregir |
| `npm run db:seed` | Vacía y recarga los datos de demostración |
| `npm start` / `npm run dev` | Los dos servicios / con recarga automática |
| `npm run start:identidad` / `start:negocio` | Un servicio por separado |
| `npm test` | Levanta ambos servicios y corre todas las pruebas; limpia lo que crea |

## Ver la base de datos

```
docker exec -it srm-postgres psql -U postgres -d srm_negocio
```
Dentro: `\dt` (tablas), `\d producto` (estructura de una tabla), `\dv` (vistas), `\c srm_identidad` (cambiar de base), `\q` (salir). También sirve la extensión SQLTools de VS Code, conectada a `127.0.0.1:5432` con el usuario `postgres` y la clave `PG_ADMIN_PASSWORD` de tu `.env`.

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `No se pudo conectar a PostgreSQL` | Docker Desktop cerrado o falta `npm run db:up` |
| `password authentication failed` | Cambiaste `PG_ADMIN_PASSWORD` después de crear el contenedor. De cero: `docker compose down -v` (borra los datos), luego `db:up` y `db:reset` |
| `No se encuentra la llave pública` | Corre `npm run setup:env` |
| "Servicio de identidad no disponible" al iniciar sesión | Arrancaste solo el negocio; usa `npm start` |
| `EADDRINUSE` en 3000 o 3001 | Hay otro servidor corriendo; ciérralo o cambia `PORT` / `IDENTIDAD_PORT` en `.env` |
| Un cambio de rol o permiso no se nota | Rige en el próximo inicio de sesión o renovación (máximo 10 minutos) |
| Un cambio de imagen (logo, fotos) no se ve | Recarga con `Ctrl+F5`; el navegador guarda imágenes |
| Aviso de proveedores con teléfono sin formato al migrar | Corrígelos desde Proveedores → Editar, con el formato `+57 300 123 4567`; los demás ya están corregidos |
| Aviso de productos cuyo proveedor no es de su categoría | Edítalos desde Inventario y elige un proveedor de su categoría |
| Un usuario no puede entrar tras cambiarle el correo | Se cerraron sus sesiones: debe iniciar sesión con el correo nuevo |
