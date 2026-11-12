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


---
# Fase 0 — Reorganización del front

## Qué cambió respecto al prototipo
| Antes | Ahora |
|---|---|
| 55 HTML, 53 JS y 46 CSS (tres copias por rol) | 2 HTML (`index.html` login y `app.html`) + 1 router + una página por función |
| Menú copiado en cada página | Un solo menú definido por rol en `public/js/app.js` |
| Colores y fuentes sueltos en cada CSS | Sistema de diseño en `public/css/tokens.css` (con modo oscuro) |
| Fotos de hasta 5,2 MB en el inicio (7,4 MB en total) | WebP optimizado: 0,7 MB en total (-93 %) |
| Pantalla en blanco mientras carga | Esqueletos de carga en pantallas e imágenes |
| Datos desde JSON y `localStorage` | API real con sesión por cookie |

## Estructura
    public/            front (lo sirve Express)
      index.html       inicio de sesión
      app.html         aplicación (menú + pantallas)
      css/             tokens.css (diseño) · app.css (componentes)
      js/              api.js · ui.js · app.js (router y menú) · login.js
      js/pages/        dashboard · inventario · proveedores  (una pantalla = un archivo)
      img/             imágenes optimizadas
    src/               API (rutas, middleware)
    db/                esquema y carga de datos
    legacy/            JSON originales del prototipo (solo para el seed)

## Cómo agregar una pantalla nueva
1. Crea `public/js/pages/nombre.js` exportando `title` y `async render(root, ctx)`.
2. Regístrala en `PAGES` y en `NAV` (con los roles que la ven) dentro de `public/js/app.js`.
3. Si necesita datos, crea su ruta en `src/routes/` protegida con `requireRole(...)`.

## Fases siguientes
1. **Órdenes de compra**: un solo flujo con estados (solicitada → cotizada → aceptada → en entrega → por validar → completada → calificada).
2. **Cotizaciones comparativas**: pedir precio a varios proveedores y elegir con una tabla comparativa.
3. **Reposición sugerida**: crear la orden desde "stock bajo" con el proveedor habitual ya elegido.
4. **Desempeño del proveedor**: puntualidad, calidad y cumplimiento calculados de las entregas reales.
5. **Empleados y auditoría**.


---
# Fase 0.1 — Catálogo público, tema y perfil de usuario

## Rutas del sitio
| Ruta | Quién | Qué es |
|---|---|---|
| `/` | Cualquiera (sin cuenta) | **Catálogo público** de productos disponibles |
| `/login.html` | Personal | Ingreso de gerente, empleado y proveedor |
| `/app.html` | Con sesión | Aplicación interna (menú según el rol) |

## Catálogo público (`GET /api/catalogo`)
No requiere sesión y solo entrega nombre, categoría, imagen, precio y disponibilidad
(`disponible`, `pocas` = stock en o bajo el mínimo, `agotado`). **Nunca** expone proveedor, costo,
margen ni cantidades exactas de stock. La prueba `npm test` lo verifica.

## Tema claro / oscuro
Claro por defecto (fondo verde claro), sin importar el modo del sistema operativo. El interruptor está en el menú
lateral (y arriba a la derecha en el catálogo y el login). Se recuerda en el navegador. Los colores salen de `public/css/tokens.css`.

## Perfil del usuario
La tabla `usuario` ahora separa `nombre` y `apellidos`. La API devuelve `primerNombre`, `primerApellido` y `nombreCorto`
(p. ej. "Miguel Ray"); los apellidos con partícula cuentan como uno ("De la Cruz Rojas" → "De la Cruz").
El menú lateral muestra nombre corto y rol; el saludo del inicio usa el primer nombre.
Los nombres de los usuarios demo están en `db/seed.js` (constante `DEMO`).

## Sin JSON en el front
Login, inicio, inventario, proveedores y catálogo consumen la API (`/api/...`). Los archivos de `legacy/jsons`
solo los lee `db/seed.js` una vez para llenar la base.
