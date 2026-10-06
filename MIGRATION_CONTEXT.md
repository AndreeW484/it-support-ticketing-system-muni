# Migración del ticketing a Supabase

## Estado más reciente: backend publicado y comprobado

- A petición del usuario sobre gitignore, se agregó excepción para `.env.production` y se creó ese archivo con VITE_BACKEND=supabase, URL y clave publishable públicas. Se incluirá al subir el repositorio; no contiene secretos de servidor. `.env.local` sigue excluido y se agregó `supabase/.temp/` para excluir archivos temporales del CLI.
- Netlify recibirá la configuración pública mediante `.env.production` al compilar el nuevo código. Variables ya definidas en Netlify tienen prioridad: deben coincidir con Supabase. Aún falta subir cambios y comprobar el despliegue.

- Confirmación posterior del usuario: login local correcto con Supabase; creó el ticket de prueba con foto y confirmó que puede abrirla desde el detalle.
- Usuario confirmó configurar y publicar el puente nuevo de Drive, guardar DRIVE_BRIDGE_SECRET en ambos servicios y DRIVE_BRIDGE_URL en Supabase.
- Próximo paso actual: configurar las tres variables públicas VITE_* en Netlify, subir los cambios locales al repositorio y desplegar el frontend. Revisado: rama main, origin https://github.com/AndreeW484/it-support-ticketing-system-muni.git; cambios todavía sin commit. No se ha hecho push ni activado Netlify desde esta sesión.
- Lo anterior sustituye los pendientes históricos de login y puente que aparecen más abajo.

- Cliente local activado: `.env.local` ahora contiene `VITE_BACKEND=supabase`. Vite iniciado en http://127.0.0.1:5173 para que el usuario pruebe su login. Netlify aún no activado. Pendiente resultado del inicio de sesión real; no solicitar contraseñas por chat.

- El usuario ejecutó la migración de seguridad y obtuvo `setval = 1`; confirmó que `historial_tickets` estaba vacío.
- Confirmó haber guardado AUTHENTICATION_PEPPER, TICKETING_DATABASE_URL y ALLOWED_ORIGINS en Supabase.
- Sitio actual: https://it-support-ticketing-system-munig.netlify.app.
- ALLOWED_ORIGINS incluye ese origen y las direcciones locales de puerto 5173.
- Tras el despliegue realizado por el usuario, comprobación remota: OPTIONS devuelve 204 con el origen de Netlify permitido; POST getTickets sin sesión devuelve UNAUTHENTICATED con HTTP 200.
- Esta respuesta confirma que el handler arranca y la transacción conecta con PostgreSQL (se abre antes de exigir sesión). No confirma credenciales de usuarios ni la coincidencia del pepper con los hashes importados.
- No se crearon tickets ni se consultaron registros privados durante esa comprobación.
- Próximo paso: probar el login real desde el cliente local con Supabase antes de activar Netlify. El puente de Drive y sus dos secretos siguen pendientes de confirmación/configuración.
- Las secciones siguientes documentan la preparación anterior; el backend ya está publicado, pero la activación de Netlify todavía no está confirmada.

Actualizado: 2026-10-06.

## Acuerdos confirmados

- El usuario ya creó las tablas y migró los datos a Supabase. No repetir la importación.
- Proyecto: https://owmftldakqphkvccsnyf.supabase.co.
- La clave pública fue proporcionada y se guarda en `.env.local`, excluido de Git.
- Objetivo: sustituir Apps Script/Sheets como backend de datos conservando los formularios y paneles.
- Conservar fotos en Google Drive para evitar costos adicionales. Será necesario un puente de carga a Drive; el endpoint actual crea tickets en Sheets y no debe usarse para subir fotos de nuevos tickets de Supabase sin adaptarlo.
- Nuevo backend implementado en `supabase/functions/ticketing/`; cliente seleccionable con `VITE_BACKEND=supabase`. No se ha desplegado ni activado en producción; actualmente se sigue usando Apps Script.

## Esquema recibido

Ver `backend/supabase/existing-schema.sql`: referencia del SQL ya ejecutado por el usuario, no una migración pendiente.
Tablas: tecnicos, usuarios, tickets, historial_tickets.
No se proporcionaron políticas RLS ni funciones de API.
Los valores predeterminados de tickets son NORMAL y CREATED, mientras que la app usa MEDIA y CREADO. Verificar los valores efectivamente migrados y normalizar el contrato sin reimportar datos.

## Hallazgos que condicionan la integración

- `usuarios` almacena autenticación propia; migrar sus filas no equivale a crear usuarios en Supabase Auth.
- `backend/Code.gs` calcula HMAC-SHA256 de `PASSWORD|salt|password` usando `AUTHENTICATION_PEPPER` de Script Properties. Los hashes migrados requieren ese secreto para conservar las contraseñas.
- El pepper nunca debe estar en el navegador, en Git ni compartirse por chat. Si se conserva la autenticación, configurarlo en el backend de destino como secreto.
- Decisión tomada: conservar autenticación y contraseñas heredadas con el pepper confirmado. Supabase Auth no se usa en esta entrega.
- No exponer hashes de contraseña ni sesión con la clave pública. Diseñar permisos y operaciones del servidor antes de activar el cliente.

## Implementación preparada en esta sesión

- Usuario confirmó que existe `AUTHENTICATION_PEPPER`. Se conserva autenticación heredada, sin restablecimiento de contraseñas.
- Backend Edge Function con todas las acciones que usa la interfaz actual, transacciones PostgreSQL, permisos por rol y técnico, sesiones, bloqueo de intentos y cambio obligatorio de contraseña.
- Migración de permisos/RLS y secuencia de historial, sin reimportar datos.
- Puente independiente de fotos con firma HMAC y manifiesto de carga; no escribe en Sheets.
- Cliente `src/supabaseApi.js` y selector en `src/main.jsx`; todavía no activado.
- Pruebas de integración con PGlite y esquema real, incluyendo permisos SQL, autenticación, tickets, historial, rollback y contrato HTTP.
- Instrucciones completas en `backend/supabase/DEPLOYMENT.md`.

## Próximos pasos (requieren configuración privada en los paneles)

1. Reconciliar cambios en Sheets posteriores a la importación y acordar el corte sin doble escritura.
2. Ejecutar la migración SQL de seguridad en Supabase.
3. Publicar el puente nuevo de Drive y configurar sus dos propiedades.
4. Configurar secretos de Edge Functions: pepper original, conexión PostgreSQL del Transaction pooler, orígenes permitidos, URL y secreto del puente. No pedir valores privados por chat.
5. Desplegar `ticketing`, activar cliente y validar con cuentas autorizadas.

No se han consultado ni modificado datos de producción en esta sesión.

## Validación completada

- 59 pruebas aprobadas con `node --test --test-isolation=none tests/*.test.js`.
- Compilación Vite aprobada tanto con Apps Script como con Supabase seleccionado.
- Comprobación Deno aprobada: `npx --yes deno check --node-modules-dir=none --no-lock supabase/functions/ticketing/index.ts`.
- `dist/` quedó regenerado con la configuración actual (Apps Script), no con Supabase aún sin desplegar.
- El sandbox de Windows impide los subprocesos del runner normal y Vite (`EPERM`): las pruebas se ejecutaron sin aislamiento y los builds con escalación autorizada automáticamente.
- No se hicieron pruebas contra Supabase ni Drive reales; faltan secretos privados, despliegue y validación integral en el entorno del usuario.
