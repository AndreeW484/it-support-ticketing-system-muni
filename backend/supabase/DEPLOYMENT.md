# Activación del backend Supabase

El código está preparado para las tablas ya importadas del proyecto
`owmftldakqphkvccsnyf`. No volver a importar datos ni ejecutar
`existing-schema.sql`: ese archivo es únicamente una referencia del esquema.

## Arquitectura y alcance

- Frontend → Edge Function `ticketing` → PostgreSQL de Supabase.
- Autenticación heredada en `usuarios`, HMAC-SHA256 compatible con Apps Script;
  no requiere crear cuentas en Supabase Auth. Nunca leer `usuarios` desde React.
- Cada operación interna verifica sesión, expiración, estado, cambio obligatorio
  de contraseña, rol y asignación de ticket en el servidor.
- Fotos → puente separado de Apps Script → carpeta de Drive existente. No escribe
  en Sheets ni modifica permisos de los archivos.
- Operaciones de ticket e historial dentro de una transacción. Se usa un advisory
  lock compartido para evitar carreras en IDs, sesiones y transiciones.
- Incluye todas las acciones utilizadas por el frontend actual: `login`, `logout`,
  `changePassword`, `getCurrentUser`, `createTicket`, `trackTicket`, `getTickets`,
  `getTicket`, `getTicketHistory`, `getUsers`, `getTechnicians`,
  `getActiveTechnicians`, `createTechnician`, `createUser`, `assignTicket`,
  `changePriority`, `changeStatus`, `finishTicket`, `cancelTicket`,
  `addTicketComment`.
- Acciones del Apps Script antiguo que la interfaz no utiliza (editar/desactivar
  usuarios, reabrir tickets, etc.) no están expuestas por esta versión.

## 1. Preparar el corte

Programar una ventana sin nuevas escrituras en el sistema antiguo. Si Sheets
recibió cambios después de la importación, reconciliarlos antes del corte; no
asumir que Supabase está actualizado. Conservar una copia de seguridad de las
tablas importadas y exportar el esquema/permisos actuales antes de la migración.
El código no ejecuta sincronización ni doble escritura.

Confirmar que los hashes y salts importados corresponden al mismo valor de
`AUTHENTICATION_PEPPER` del Apps Script original. No cambiar ese valor.

## 2. Aplicar la migración de seguridad

En Supabase → SQL Editor, abrir una consulta nueva y ejecutar el contenido de:

`supabase/migrations/202610060001_ticketing_security.sql`

No borra ni reimporta las cuatro tablas. Activa RLS, revoca acceso directo para
`anon` y `authenticated`, corrige valores predeterminados y ajusta la secuencia
de historial para continuar después de los IDs importados. Agrega índices de
correo sin distinción de mayúsculas y una tabla privada para límites de uso.
Si hay duplicados de correo equivalentes, la migración falla sin aplicar el
conjunto de cambios; resolver esos registros primero.

Los valores importados `CREATED` y `NORMAL` se presentan como `CREADO` y `MEDIA`
sin reescribir el historial. También se reconocen los estados ingleses usuales.
Revisar los valores distintos reales antes del corte; un estado desconocido se
conserva visible pero no habilita transiciones.

## 3. Publicar el puente de fotos

Crear un **proyecto nuevo** de Apps Script y copiar
`backend/drive-bridge/Code.gs`. No sustituir el backend anterior todavía.

En Configuración del proyecto → Propiedades de la secuencia de comandos:

| Nombre | Valor |
| --- | --- |
| `ATTACHMENTS_FOLDER_ID` | ID de la carpeta de Drive utilizada actualmente |
| `DRIVE_BRIDGE_SECRET` | Secreto aleatorio nuevo, distinto del pepper, de al menos 32 bytes |

Generar ese secreto con un gestor de contraseñas. Usar exactamente el mismo valor
en la Edge Function. No enviarlo por chat ni guardarlo en el frontend.

Implementar → Nueva implementación → Aplicación web; ejecutar como propietario
de la carpeta y permitir acceso a Cualquiera. La firma HMAC protege la carga.
Autorizar Drive y copiar la URL terminada en `/exec`. Si el dominio institucional
impide aplicaciones web públicas, esa restricción debe resolverse con el
administrador o sustituir el puente por otro acceso a Drive; no basta con
publicarlo para usuarios autenticados de Google.

## 4. Configurar secretos de la Edge Function

En Supabase → Edge Functions → Secrets, guardar:

| Nombre | Valor |
| --- | --- |
| `AUTHENTICATION_PEPPER` | Valor exacto de la propiedad del Apps Script original |
| `TICKETING_DATABASE_URL` | Cadena PostgreSQL del Transaction pooler (Connect → Transaction pooler, puerto 6543), con contraseña real de la BD |
| `ALLOWED_ORIGINS` | Orígenes permitidos separados por comas; por ejemplo `http://127.0.0.1:5173,https://tu-dominio` |
| `DRIVE_BRIDGE_URL` | URL `/exec` del nuevo puente de fotos |
| `DRIVE_BRIDGE_SECRET` | Mismo secreto nuevo configurado en el puente |

En `TICKETING_DATABASE_URL`, codificar caracteres especiales de la contraseña
como parte de una URL. No es la URL pública del proyecto ni la clave pública.
Usar la cadena exacta de conexión del panel; el host del pooler depende de la
región. La conexión utiliza TLS y desactiva prepared statements para el pooler.
No poner ninguno de estos secretos en variables `VITE_*`, archivos versionados
o mensajes. No hace falta compartirlos con Codex.

Para probar sin fotos, pueden omitirse ambos secretos de Drive. En ese caso el
backend acepta tickets sin adjuntos y responde `ATTACHMENTS_DISABLED` si los hay.

## 5. Desplegar la función

Desde la raíz del repositorio, con Supabase CLI disponible y la cuenta autorizada:

```powershell
npx supabase login
npx supabase functions deploy ticketing --project-ref owmftldakqphkvccsnyf
```

`supabase/config.toml` configura `verify_jwt = false` porque hay acciones públicas
y las sesiones son las del sistema heredado, no JWT de Supabase Auth. Las acciones
privadas sí exigen y verifican `sessionToken` dentro de la función. La clave
`publishable` identifica el proyecto, no otorga permisos de administrador.

La URL final es:
`https://owmftldakqphkvccsnyf.supabase.co/functions/v1/ticketing`.

## 6. Validar y activar el frontend

Actualización: `.env.production` ahora está incluido en Git y contiene únicamente
la URL, clave publishable y `VITE_BACKEND=supabase`. Vite carga ese archivo al
compilar en producción, por lo que Netlify recibirá estos valores al desplegar
el nuevo código. Si ya existen esas variables en Netlify, tienen prioridad sobre
el archivo: comprobar que coincidan. Los secretos del backend siguen solo en
Supabase; `.env.local` y los temporales del CLI permanecen excluidos.

En `.env.local` ya están la URL y la clave pública proporcionadas. Agregar:

```dotenv
VITE_BACKEND=supabase
```

Reiniciar Vite con `npm run dev`. Para el sitio publicado, configurar las mismas
variables públicas en su entorno, ejecutar `npm run build` y desplegar ese build.
No basta con cambiar `.env.local` para cambiar un sitio publicado.

Verificar con cuentas autorizadas y un ticket de prueba identificado:

1. Login del administrador con contraseña existente.
2. Lectura de tickets, usuarios, técnicos y reportes migrados.
3. Crear ticket sin fotos y consultar con número y nombre.
4. Crear ticket con foto, comprobar el enlace con permisos de Drive.
5. Asignar, iniciar, comentar, resolver como técnico y cerrar como administrador.
6. Confirmar que otro técnico no ve el ticket y que el seguimiento público no
   expone notas internas ni fotos.
7. Crear un usuario de prueba, cambiar su contraseña temporal y cerrar sesión.

Esas comprobaciones reales requieren acceso al proyecto y no se ejecutaron al
preparar el código. No eliminar el backend antiguo hasta confirmar el corte.

## Límites y recuperación

- Cuotas públicas globales por hora: 60 creaciones, 300 intentos de login y 600
  consultas de seguimiento, configuradas en `index.ts`. Son compartidas por todos
  los usuarios. Ajustarlas a la carga real; si se agotan, se responde HTTP 429.
  No sustituyen protección contra abuso de red; una persona podría consumirlas.
- Mantiene cinco fotos de hasta 5 MB, con validación de formato y cabecera binaria.
- El puente reutiliza cargas repetidas con el mismo requestId firmado, pero la
  aplicación no reintenta automáticamente un envío. Una repetición manual después
  de perder la respuesta puede crear otro ticket; confirmar primero.
- Drive y PostgreSQL no comparten transacciones. Si Drive termina y después falla
  la BD o se pierde la respuesta, puede quedar una carpeta sin ticket confirmado.
  Cada carga se agrupa por número y requestId, con manifiesto `_upload.json`, para
  su revisión manual. No se borran automáticamente cargas completas.
- Los enlaces importados siguen apuntando a los archivos anteriores; no se mueven.
- Las operaciones se serializan y `getTickets` devuelve el conjunto autorizado
  completo para conservar los reportes actuales. Evaluar paginación en servidor y
  bloqueos más específicos si el volumen crece. No se ha hecho una prueba de carga.
- Se conservan contraseñas con el algoritmo heredado; no se cambia a Supabase Auth.
- Antes de nuevas escrituras, se puede volver al frontend antiguo usando
  `VITE_BACKEND=apps-script`. Después de escribir en Supabase, volver a Sheets
  exige reconciliar esos cambios: las bases no se sincronizan automáticamente.

## Verificación local

```powershell
npm ci
node --test --test-isolation=none tests/*.test.js
npm run build
npx --yes deno check --node-modules-dir=none --no-lock supabase/functions/ticketing/index.ts
```

Las pruebas usan PostgreSQL en memoria (PGlite), el esquema suministrado y la
migración real. No usan datos de producción. PGlite no reproduce la red, el pooler
ni concurrencia entre instancias de Edge Functions.

Referencias: [PostgreSQL desde Edge Functions](https://supabase.com/docs/guides/functions/connect-to-postgres),
[configuración de funciones](https://supabase.com/docs/guides/functions/function-configuration),
[claves públicas](https://supabase.com/docs/guides/getting-started/api-keys).
