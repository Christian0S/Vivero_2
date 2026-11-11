# SRM Vivero Las Magnolias — Paso 1: limpieza y base de datos

## Uso
    npm install
    npm run seed        # crea db/srm.db desde legacy/jsons

## Decisión de base de datos
SQLite (archivo único) con `sql.js` (JS puro: no requiere Python ni compilar en Windows). El esquema usa SQL estándar:
migrar a PostgreSQL más adelante es cambiar tipos y el driver, no el diseño.

## Hallazgos del prototipo (qué limpiar)
1. **Sin backend real**: sesión, usuarios, chat y productos viven en `localStorage`; los JSON se leen con `fetch`.
2. **Login inseguro**: SHA-256 en el navegador y usuarios en localStorage. Pasa a bcrypt + sesión/JWT en servidor.
3. **Rutas rotas fuera de Windows**: 8 archivos usan `/JSONs/` y otros `/jsons/`; hay `CHAT` vs `chat`; una URL a github.io.
4. **Duplicación por rol**: `empleado/` y `gerente/` repiten casi todo el JS (`anadirInventario.js` y `contratarServicio.js` son idénticos).
   Solución: una sola página por función y permisos por rol, no tres copias.
5. **Datos sucios**: 77 de 100 productos apuntan a un proveedor inexistente; los valores son texto ("$15,000");
   fechas mezcladas (dd/mm/aaaa e ISO); las compras nombran personas como proveedor; el historial tiene acciones duplicadas
   ("Enviar/Envío de Cotización").
6. **Cuatro JSON para el mismo proceso** (compras, cotizaciones, comprasRechazadas, HistoriaComprea) → una tabla `orden_compra` con `estado`.
7. **Nombres con typos**: `Assent`, `InvetarioBajo`, `inicoProcesos`, `REgistroUsuario`, `HistoriaComprea`.
8. Sin uso: 7 imágenes. Todo el JS/CSS/HTML está referenciado.

## Flujo de estados (orden_compra)
solicitada → cotizada → aceptada | rechazada → en_entrega → por_validar → completada → calificada

---
# Paso 2 — API de login y roles

## Puesta en marcha
    npm install
    npm run seed                 # regenera la BD (ahora con contraseñas bcrypt)
    copy .env.example .env       # y completa JWT_SECRET (ver abajo)
    npm start                    # http://localhost:3000
    npm test                     # prueba de humo (11 casos)

Generar el secreto (pégalo en `.env` como `JWT_SECRET=...`):

    node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

Usuarios demo (solo desarrollo): `gerente@vivero.com`, `empleado@vivero.com`, `proveedor@vivero.com` — clave `Vivero2026!`.
Las claves originales del prototipo eran SHA-256 sin sal y no se reutilizan.

## Endpoints
| Método | Ruta | Acceso |
|---|---|---|
| POST | /api/auth/login `{email, password}` | público (máx. 5 intentos fallidos / 15 min) |
| POST | /api/auth/logout | público |
| GET  | /api/auth/me | sesión iniciada |
| GET  | /api/proveedores | gerente, empleado (ejemplo de ruta por rol) |

## Decisiones de seguridad
- La sesión es un JWT en cookie **httpOnly** (JavaScript del navegador no puede leerlo; ya no hay `localStorage`). Dura 8 h.
- Mismo mensaje de error para correo inexistente y clave incorrecta.
- `JWT_SECRET` obligatorio (mínimo 32 caracteres); sin él el servidor no arranca. `.env` está en `.gitignore`.
- Pendiente para producción: HTTPS (activa `NODE_ENV=production` para cookie `secure`), protección CSRF si el front se sirve desde otro dominio, y que el usuario proveedor quede enlazado a su fila de `proveedor`.
