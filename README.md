# SRM Vivero Las Magnolias

Sistema web para que un vivero —una microempresa— controle su inventario, compre a sus proveedores sin errores y sepa, con datos, quién le cumple. Incluye un catálogo público para que los clientes vean lo disponible sin crear cuenta.

## El problema

- Los pedidos a proveedores se hacen por WhatsApp, a mano: listados desordenados, cantidades que se olvidan, errores humanos.
- Cuando algo llega incompleto o dañado no hay evidencia clara para reclamar.
- Nadie se entera a tiempo de qué producto se está agotando, ni de qué proveedor lleva meses sin usarse.
- La opinión sobre cada proveedor depende de la memoria de quien lo atendió.
- Los clientes preguntan por WhatsApp qué hay disponible, una y otra vez.
- Un software comercial de gestión cuesta más de lo que una microempresa puede pagar.

## Qué se quiere lograr

1. **Una sola fuente de verdad** de productos, proveedores y pedidos, en lugar de hojas sueltas y chats.
2. **Pedidos claros y sin errores humanos.** El empleado elige proveedor, productos y cantidades en la aplicación; el sistema arma el listado ordenado, lo envía por WhatsApp y guarda un PDF con número consecutivo.
3. **Recepción verificada.** Al llegar la mercancía se compara lo recibido contra lo pedido, con fotos y soporte.
4. **Reclamos con evidencia.** Si algo falla, el reclamo sale redactado, con el PDF del pedido y las fotos, y con una huella digital que prueba que nada fue alterado.
5. **Evaluación objetiva de proveedores** (puntualidad, calidad, cumplimiento), calculada de entregas reales. Es información interna: el proveedor nunca ve su propia calificación.
6. **Alertas a tiempo**: stock bajo, entregas sin confirmar, pedidos sin calificar, proveedores inactivos.
7. **Un catálogo público** que responde la pregunta "¿qué tienen disponible?" sin atención manual.
8. **Costo cero en licencias** y operación sencilla: software libre, un servidor pequeño.
9. **Seguridad por diseño**, porque se manejan datos de personas, proveedores y evidencia.

## Cómo funciona

### El ciclo de compra, con WhatsApp como canal

El proveedor casi nunca va a abrir una aplicación: la conversación sigue siendo por WhatsApp. En lugar de pelear con eso, el sistema lo aprovecha y pone el orden de su lado.

1. **Alerta**: un producto baja de su stock mínimo y la campana lo avisa.
2. **Pedido**: se eligen los productos del proveedor y las cantidades; el sistema genera el listado y un PDF con consecutivo.
3. **Envío**: se abre WhatsApp con el mensaje ya redactado (pedido, consulta, seguimiento) para enviarlo con un toque.
4. **Recepción**: al llegar la entrega se registra lo recibido contra lo pedido, con fotos.
5. **Reclamo o calificación**: si hay diferencias, se genera el reclamo con evidencia; si todo salió bien, se califica al proveedor.

Todo queda registrado: quién hizo qué y cuándo, y los archivos nunca se borran.

### El catálogo público

Los clientes entran a la página principal, buscan por nombre o categoría, ven precio y disponibilidad, y escriben al vivero por WhatsApp. No ven proveedores, costos ni cantidades exactas de stock.

## Quién la usa

| Rol | Qué hace |
|---|---|
| **Cliente** (sin cuenta) | Consulta el catálogo y escribe al vivero. |
| **Administrador** | Configura el sistema: usuarios, permisos y parámetros. |
| **Gerente** | Representante legal. Gestiona el negocio: inventario, proveedores, pedidos, calificaciones. Hace también las funciones del empleado. |
| **Empleado** | Opera el día a día: consulta inventario, recibe pedidos. |
| **Proveedor** | Usuario externo y opcional, con acceso limitado a lo suyo. Si no quiere usar la aplicación, todo sigue funcionando por WhatsApp. |

Lo que puede hacer cada rol no está escrito en el código: son **permisos que el administrador ajusta** desde la propia aplicación.

## Estado actual

### Ya funciona
- **Catálogo público** con búsqueda, categorías, disponibilidad y contacto por WhatsApp.
- **Inventario**: consulta con filtros y alertas de stock bajo; creación y edición de productos (el proveedor se elige entre los de la categoría del producto), precio de venta calculado por el sistema, activar y desactivar, e historial de cada cambio.
- **Proveedores**: ficha con contacto directo (WhatsApp, copiar el teléfono o correo) y calificación interna. El gerente edita los datos de cualquier proveedor, y cada proveedor actualiza su propio contacto desde **Mi empresa**, sin depender del administrador. Los teléfonos están en formato internacional para que los enlaces funcionen.
- **Usuarios y permisos**: cuentas por rol con sus datos completos (documento, cargo, teléfono, ciudad, dirección), permisos editables por el administrador, clave temporal con cambio obligatorio al primer ingreso.
- **Mi perfil**: datos personales, foto y cambio de contraseña.
- **Parámetros del sistema**: datos del vivero, valores por defecto y plazos de alerta.
- **Notificaciones**: campana en el encabezado (hoy avisa de stock bajo).
- **Cimientos de evidencia**: auditoría inalterable y archivos con huella digital, que no se borran desde la aplicación.

### En construcción
- Fotos de productos organizadas y pantalla de detalle con características por categoría.
- Documentos de cada usuario (hoja de vida y similares).
- Ventana de detalle de cada proveedor, con su historial.
- Pedidos: selección de productos, PDF con consecutivo y envío por WhatsApp.
- Recepción con soporte, facturas y reclamos con evidencia.
- Notificaciones completas: entregas por confirmar, calificaciones pendientes, proveedores inactivos.
- Cotizaciones comparativas, reposición sugerida y desempeño de proveedores con datos reales.
- Verificación en dos pasos para administrador y gerente.

## Principios de diseño

- **El canal es el del proveedor, no el nuestro.** La aplicación se adapta a WhatsApp, no al revés.
- **La evidencia no se altera.** Los archivos nunca se borran (se marcan como eliminados), cada uno lleva su huella SHA-256 y la auditoría es de solo inserción.
- **Cada pieza ve solo lo que necesita.** Identidad y negocio son servicios separados con bases de datos y credenciales distintas, y cada usuario de base de datos tiene los mínimos permisos.
- **Seguridad desde el diseño**: sesiones con renovación rotativa, tokens firmados que el negocio solo puede verificar, contraseñas con argon2id, límites de intentos y archivos que solo se descargan con sesión.
- **Simple de operar.** Software libre (Node.js, PostgreSQL, Docker), dos servicios y un solo servidor pequeño.
- **Todo cambio de estructura queda versionado**, y cada capacidad nueva llega con pruebas automáticas.

## Documentación y puesta en marcha

Para correrlo en tu equipo (Windows, con Node.js, Git y Docker Desktop):

```
npm install
npm run setup:env
npm run db:up
npm run db:reset
npm test
npm start          # abre http://localhost:3000
```

- [Guía de uso local](docs/guia-local.md): requisitos, comandos, usuarios de demostración y problemas frecuentes.
- [Arquitectura](docs/arquitectura.md): servicios, sesión, permisos, bases de datos, archivos y cómo extender el sistema.
