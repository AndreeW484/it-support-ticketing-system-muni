# Soporte TI · Municipalidad de Guatemala

Frontend React + Vite, en negro y verde neón. Una sola aplicación: formulario público como inicio y botón Acceso de informática para técnicos y administradores.

## Migración a Supabase (preparada, pendiente de despliegue)

El nuevo backend está en `supabase/functions/ticketing/`, con migración de seguridad
en `supabase/migrations/` y puente de fotos en `backend/drive-bridge/Code.gs`.
Las tablas y los datos ya fueron importados por el usuario; no repetir la importación.
Consultar [los pasos de despliegue](backend/supabase/DEPLOYMENT.md) y
[el contexto guardado](MIGRATION_CONTEXT.md).
El frontend se activa con `VITE_BACKEND=supabase` después del despliegue y validación.
Por ahora sigue seleccionado Apps Script. El resto de este README describe ese
funcionamiento anterior.

## Ejecutar

Node.js 22.12+ (validado con Node 24).

```powershell
npm install
npm run dev
npm test
npm run build
```

La URL entregada de Apps Script está en `.env.local` como VITE_APPS_SCRIPT_URL. Para otro entorno usa `.env.example` y reinicia Vite. Edita `src/`; `dist/` se genera con build.

## Backend original, sin cambios requeridos

El frontend usa `createTicket` público y `login`, `changePassword`, `logout` existentes. No necesitas publicar el backend de registro que se había propuesto, ejecutar migraciones ni agregar columnas. `backend/Code.gs` vuelve a ser una copia exacta del archivo original proporcionado en Downloads. Es una referencia con marcadores de configuración: NO sustituir por ella el backend que ya funciona y tiene sus IDs reales.

Se retiraron los componentes de registro, verificación de correo, perfil y rol Solicitante. No hay registro de cuentas para quienes solicitan soporte. Si ya publicaste por tu cuenta la ampliación anterior, esta interfaz usa los endpoints originales igualmente; restaurar aquella implementación es una operación distinta que no se ha ejecutado desde aquí.

## Ticket público

Solicita nombre completo, sede/agencia, área/departamento, tipo, categoría y descripción. El correo de contacto es opcional y se guarda en Observaciones del ticket, pues el backend original no tiene una columna independiente para ese correo. No se guarda un perfil ni se escribe en Usuarios. Prioridad inicial MEDIA. Permite hasta 5 fotos opcionales (JPG, PNG o WebP), de hasta 5 MB cada una, con vista previa y opción de quitar. Se envían como name, mimeType y data (Data URL Base64) al createTicket existente. No se suben hasta enviar el ticket.

Al enviar se muestra el número real devuelto por Apps Script. El borrador permanece en memoria al alternar entre ticket e ingreso de informática y se limpia al confirmar el envío. No hay envío automático ni reintentos automáticos. Si se interrumpe la conexión tras enviar, confirmar con informática antes de repetir para evitar duplicados.

El acceso del personal conserva las sesiones del backend y el cambio de contraseña temporal. Los administradores acceden al dashboard y directorio descritos abajo; los técnicos acceden a su bandeja personal de atención descrita abajo. Los solicitantes no necesitan entrar a ese panel.

## Diseño y validación

Logo `public/muniguate-transparente.png`, generado con imagegen desde la referencia del usuario: contornos monocromos, alfa real y sin cumple. Presentación compacta de dos columnas, adaptable a móvil. Se conserva el patrón de circuitos.

Pruebas locales de autenticación y del contrato público: envío sin token, datos solo del ticket, validaciones, acceso público permitido y consultas internas protegidas. No se crearon tickets ni usuarios reales durante la validación.

## Configuración existente de adjuntos

No se modificó Code.gs. El backend publicado debe tener CONFIG.ATTACHMENTS_FOLDER_ID configurado con una carpeta de Drive accesible para la cuenta que ejecuta Apps Script. Si ya está configurada, no requiere cambios; si está vacía, el backend original responde ATTACHMENTS_DISABLED y la interfaz permite quitar las fotos para enviar sin adjuntos. No se cambian los permisos de Drive. Se amplió a 120 segundos el tiempo de espera al enviar fotos, sin reintentos automáticos. Las fotos seleccionadas se conservan si falla el envío y se descartan tras confirmación.

## Consulta pública de estado

El enlace Consultar mi ticket está en la navegación y en la confirmación de envío. Usa el endpoint GET `trackTicket` original con `numeroTicket` y `solicitante` (nombre utilizado al crear la solicitud). No requiere sesión ni modificaciones de Code.gs. El número y nombre se envían como parámetros a Apps Script, según su contrato existente; no se agregan al URL de navegación de la aplicación ni se guardan localmente. La solicitud evita caché y referrer.

Muestra estado real, prioridad, técnico, sede/área, categoría, descripción, fechas disponibles y resolución. Las fechas solo se muestran cuando existen; no se inventa un historial ni un porcentaje de avance. El backend excluye observaciones internas y adjuntos de esta consulta pública. Se puede consultar de nuevo para actualizar el estado. Las pruebas utilizan respuestas simuladas; no se consultaron tickets reales de terceros.

## Panel administrativo

Se abre después de autenticar un ADMINISTRADOR, una vez cambiada la contraseña temporal si corresponde. Utiliza exclusivamente los endpoints existentes, sin cambios de backend.

- Dashboard: getTickets autenticado; métricas calculadas sobre esa misma respuesta para mantener consistencia. Abiertos = CREADO, ASIGNADO, EN PROCESO, PENDIENTE. Finalizados = RESUELTO y CERRADO. Cancelados se cuentan por separado. Prioridad urgente = ALTA/CRITICA de tickets abiertos.
- Distribución por las siete etapas, filtros combinables por estado, prioridad y búsqueda (incluye técnico), lista paginada de 10 tickets y detalle con descripción, fechas, resolución, observaciones internas y enlaces a adjuntos HTTPS. Los permisos de Drive se mantienen.
- Actualización manual y fecha de última carga. Una falla de actualización conserva los datos previos con aviso; sin carga inicial no se presentan ceros como si fueran datos reales.
- Usuarios: getUsers/getTechnicians. createUser recibe correo, rol ADMINISTRADOR o TECNICO, contraseña temporal y, para técnicos, idTecnico activo. Nunca se muestran ni guardan contraseñas después del éxito.
- Si falta una ficha técnica, el formulario separado usa createTechnician (nombre, correo, teléfono y especialidad opcionales). Al confirmar, queda seleccionada en el registro de usuario. La ficha y el acceso son pasos separados: si falla el acceso, se reutiliza la ficha ya creada; no se repite automáticamente.
- Las contraseñas temporales deben compartirse por el canal interno autorizado. El backend obliga su cambio inicial, no manda correos de alta automáticamente.
- Sesiones inválidas regresan al login; cambio de contraseña requerido redirige al formulario correspondiente. El servidor sigue validando permisos de todas las acciones.

Este panel permite consultar tickets y registrar usuarios/fichas. La edición o desactivación de cuentas no se añadió en esta entrega. No se crearon usuarios ni se modificaron tickets reales durante las pruebas. La comprobación integral requiere iniciar sesión con una cuenta administradora real.
### Asignación y prioridad

En el detalle del ticket, el administrador puede elegir una ficha activa mediante getActiveTechnicians y confirmar assignTicket. Un ticket CREADO pasa a ASIGNADO; una reasignación conserva la etapa. Los tickets RESUELTO, CERRADO o CANCELADO no permiten asignación. No se necesita una segunda cuenta técnica para asignar tickets a la ficha de un administrador.

La prioridad se cambia de forma independiente con changePriority (BAJA, MEDIA, ALTA, CRITICA), sin reasignar ni cambiar el estado. Ambas operaciones aceptan una nota opcional para el historial existente. El detalle, las filas y métricas incorporan el ticket devuelto por el servidor; no se anticipa el éxito. Se bloquea el cierre del detalle y las operaciones concurrentes durante el guardado. No hay reintentos automáticos.
## Panel de técnicos

Se abre al ingresar con rol TECNICO, después del cambio de contraseña temporal si aplica. getTickets filtra en el servidor por la ficha técnica de la sesión; el frontend también limita los resultados a ese id y no consulta si la cuenta no tiene ficha vinculada.

Incluye métricas propias, búsqueda, filtros de estado/prioridad y paginación. Al abrir una solicitud se actualizan getTicket y getTicketHistory antes de habilitar acciones. Muestra datos, adjuntos, observaciones y movimientos.

- ASIGNADO → EN PROCESO o PENDIENTE.
- EN PROCESO → PENDIENTE; PENDIENTE → EN PROCESO.
- addTicketComment agrega avances con fecha y correo sin sustituir notas anteriores.
- finishTicket permite resolver desde EN PROCESO o PENDIENTE, con solución obligatoria visible en seguimiento público. No envía observaciones para evitar reemplazar avances.
- El técnico no puede reasignar, cambiar prioridad, cerrar, cancelar ni reabrir tickets. Puede registrar notas internas en sus tickets finalizados, conforme al backend existente.

Guardados sin reintento automático, con bloqueo de acciones simultáneas. La respuesta del servidor actualiza la bandeja y los contadores; el historial se vuelve a consultar. Si esa consulta falla tras guardar, se indica que el cambio sí se guardó. No se modificó Code.gs ni se realizaron cambios en tickets reales durante las pruebas.
### Cierre y cancelación administrativos

En el detalle, la sección Finalización administrativa permite cerrar exclusivamente tickets RESUELTO mediante changeStatus con nuevoEstado CERRADO. Los tickets abiertos se cancelan mediante cancelTicket con motivo obligatorio. Ambas acciones muestran un formulario de confirmación, conservan datos e historial y actualizan el detalle y dashboard con la respuesta real. No se muestran en el panel técnico. Los tickets CERRADO/CANCELADO no permiten volver a finalizarse. No se modificó el backend ni se cerraron/cancelaron tickets reales durante las pruebas.

## Catálogos para crear tickets

Sede y área se seleccionan de listas en `src/ticketCatalogs.js`: ocho sedes indicadas por el usuario y las áreas ATV, Jefatura, Empagua, Emetra y Otro. Para Otro, el formulario pide especificar el departamento dentro de la descripción.

Tipos: INCIDENTE (falla existente), SOLICITUD (alta/configuración/gestión de acceso) y MANTENIMIENTO (limpieza o revisión preventiva). Las categorías se agrupan por sistema de colas, equipos de sede, infraestructura/conectividad, aplicaciones/accesos y otras necesidades. Las ayudas explican qué información incluir y distinguen altas de correo de problemas de correo existente, o una falla física de tablet de una falla en la encuesta.

Ejemplos: crear/liberar/restablecer un usuario de colas = SOLICITUD + Usuarios del sistema de colas; moverlo a otra ventanilla = SOLICITUD + Ventanillas del sistema de colas; PC lenta o caliente = INCIDENTE + Computadoras y periféricos; limpieza programada = MANTENIMIENTO + Computadoras y periféricos; alta de correo o dominio = SOLICITUD + Cuentas y accesos de red Muni. La clasificación no envía ni deriva solicitudes automáticamente a otro departamento.

El backend original acepta estos campos de texto y no necesita cambios. Los tickets históricos conservan los valores con los que fueron creados.

## Reportería administrativa
La pestaña Reportería reutiliza getTickets sin modificar el backend. Permite filtrar por fecha de creación (límites inclusivos) y sede; muestra estados actuales, prioridades, sedes, categorías, tipos, meses con registros y asignación actual por técnico. Resueltos/cerrados se agrupan como finalizados; cancelados se cuentan aparte. No calcula tiempos de atención ni productividad histórica a partir de la asignación actual.
Exportar PDF abre la impresión del navegador: elegir Guardar como PDF, tamaño A4 y desactivar los encabezados/pies automáticos del navegador. El diseño de impresión usa fondo blanco con acentos verdes, gráficas vectoriales y secciones paginadas. La exportación se deshabilita durante la carga, ante errores, con fechas invertidas o sin resultados. Las gráficas de sedes/categorías muestran hasta ocho elementos; los totales incluyen todos los resultados filtrados. No se exportan descripciones ni datos personales de solicitantes.


## Clonar y configurar

Clona este repositorio y ejecuta npm ci. Copia .env.example a .env.local, configura VITE_APPS_SCRIPT_URL con la URL /exec de tu aplicación web de Apps Script y ejecuta npm run dev. Para generar la versión de producción, ejecuta npm run build; los archivos quedan en dist/.

Los archivos .env.local, las dependencias instaladas, la compilación y los resultados de pruebas locales se excluyen de Git. El repositorio no contiene credenciales ni los registros del lote de tickets ficticios. Las pruebas automatizadas usan datos simulados; los tickets de prueba solicitados se crearon únicamente en el servicio desplegado.
