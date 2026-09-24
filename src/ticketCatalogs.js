// Catálogos del formulario público. El backend original admite texto en estos campos.
export const SITES = ['Palacio Municipal', 'Mini Muni Alamos', 'Mini Muni Galerias del Sur', 'Mini Muni Plazuela España', 'Mini Muni Galerias Primma', 'Mini Muni Atanasio', 'Munitec Zona 3', 'Munitec Zona 21'];
export const AREAS = ['ATV', 'Jefatura', 'Empagua', 'Emetra', 'Otro'];
export const TICKET_TYPES = [
  { value: 'INCIDENTE', label: 'Incidente · algo está fallando', hint: 'Para fallas o interrupciones: equipo lento, sin conexión, correo que no funciona o errores de un sistema.' },
  { value: 'SOLICITUD', label: 'Solicitud de servicio · necesito una gestión', hint: 'Para crear o habilitar usuarios, cambiar contraseñas, liberar accesos o solicitar una configuración.' },
  { value: 'MANTENIMIENTO', label: 'Mantenimiento preventivo · revisión o limpieza', hint: 'Para limpieza y revisión programada de equipos. Si ya existe una falla, selecciona Incidente.' },
];
export const CATEGORY_GROUPS = [
  { label: 'Sistema de colas', items: [
    { label: 'Usuarios del sistema de colas', hint: 'Creación, cambio de contraseña o liberación de usuarios. Indica el usuario y la gestión solicitada; no incluyas contraseñas.' },
    { label: 'Ventanillas del sistema de colas', hint: 'Asignación o traslado de usuarios a ventanillas. Indica usuario, sede y ventanilla de destino.' },
    { label: 'Funcionamiento del sistema de colas', hint: 'Errores al atender, llamar o gestionar turnos. Describe el mensaje de error y la ventanilla afectada.' },
  ] },
  { label: 'Equipos de la sede', items: [
    { label: 'Computadoras y periféricos', hint: 'PC, monitor, teclado, mouse o impresora de oficina: lentitud, calentamiento, reparación o limpieza. Indica la ventanilla o ubicación.' },
    { label: 'Kioscos de información', hint: 'Indica el kiosco, su ubicación y si la falla es de pantalla, navegación o funcionamiento general.' },
    { label: 'Tablets de calificación', hint: 'Indica la ventanilla y el problema del dispositivo: encendido, pantalla, carga o funcionamiento.' },
    { label: 'Máquina dispensadora de tickets', hint: 'Problemas al emitir turnos, imprimir tickets o utilizar la pantalla. Indica qué sucede al solicitar un turno.' },
    { label: 'Televisores y pantallas', hint: 'Problemas de imagen, encendido o visualización de turnos. Indica la pantalla y su ubicación.' },
    { label: 'Audio y altavoces', hint: 'Problemas con sonido, volumen o llamado de turnos. Indica el área donde ocurre.' },
    { label: 'Cámaras de seguridad', hint: 'Problemas de imagen, conexión o funcionamiento de cámaras. Indica la ubicación afectada.' },
  ] },
  { label: 'Infraestructura y conectividad', items: [
    { label: 'Red e internet', hint: 'Falta de conexión, desconexiones o lentitud de red. Indica si afecta a un equipo o a toda la sede.' },
    { label: 'Cableado y puntos de red', hint: 'Cables, conectores o puntos de red dañados; instalación o revisión. Indica la ubicación.' },
    { label: 'Energía eléctrica y respaldo', hint: 'Falta de energía, tomacorrientes, UPS o reguladores. Describe los equipos afectados y la ubicación.' },
  ] },
  { label: 'Aplicaciones y accesos', items: [
    { label: 'Cuentas y accesos de red Muni', hint: 'Alta de usuario, correo institucional o acceso al dominio. Estas solicitudes se trasladan al departamento de Informática; indica nombre, puesto y acceso requerido.' },
    { label: 'Correo institucional', hint: 'Problemas con un correo existente: acceso, envío, recepción o configuración. Indica el correo afectado sin compartir la contraseña.' },
    { label: 'Office y programas de oficina', hint: 'Problemas con Word, Excel, PowerPoint u otros programas de oficina. Indica la aplicación y el mensaje de error.' },
    { label: 'Encuestas y calificación del servicio', hint: 'Problemas al abrir, completar o enviar la encuesta. Para fallas físicas del dispositivo, selecciona Tablets de calificación.' },
    { label: 'Servicios bancarios en sede', hint: 'Soporte a los bancos presentes en la sede. Indica el banco, equipo o servicio afectado, sin incluir datos de cuentas o transacciones.' },
  ] },
  { label: 'Otras necesidades', items: [
    { label: 'Otro', hint: 'Describe el sistema o equipo involucrado y la atención que necesitas. Si elegiste Otro en área, especifica el departamento.' },
  ] },
];
export const CATEGORIES = CATEGORY_GROUPS.flatMap(group => group.items);
