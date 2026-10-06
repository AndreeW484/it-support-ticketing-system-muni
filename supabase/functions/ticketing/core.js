// Lógica compartida entre Edge Runtime y las pruebas de Node. Sin secretos locales.
export class AppError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new AppError(code, message); };
const text = value => String(value ?? '').trim();
const upper = value => text(value).toUpperCase();
const search = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const required = (data, key, max = 10000) => {
  const value = text(data[key]);
  if (!value || value.length > max) fail('VALIDATION_ERROR', `Revisa el campo ${key}.`);
  return value;
};
const email = value => {
  const result = text(value).toLowerCase();
  if (result.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail('INVALID_EMAIL', 'Revisa el correo electrónico.');
  return result;
};
const password = value => {
  if (typeof value !== 'string' || value.length < 10 || value.length > 256 || !/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value))
    fail('WEAK_PASSWORD', 'Incluye entre 10 y 256 caracteres, mayúscula, minúscula y número.');
  return value;
};
export const states = ['CREADO', 'ASIGNADO', 'EN PROCESO', 'PENDIENTE', 'RESUELTO', 'CERRADO', 'CANCELADO'];
const priorities = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];
const aliases = { CREATED: 'CREADO', ASSIGNED: 'ASIGNADO', IN_PROGRESS: 'EN PROCESO', 'IN PROGRESS': 'EN PROCESO', PENDING: 'PENDIENTE', RESOLVED: 'RESUELTO', CLOSED: 'CERRADO', CANCELLED: 'CANCELADO', CANCELED: 'CANCELADO' };
export const state = value => aliases[upper(value)] || upper(value);
export const priority = value => upper(value) === 'NORMAL' ? 'MEDIA' : upper(value);
const member = (value, values) => { if (!values.includes(value)) fail('VALIDATION_ERROR', 'Valor no permitido.'); return value; };
const roles = ['ADMINISTRADOR', 'TECNICO'];
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(48)), b => b.toString(16).padStart(2, '0')).join('');
export async function hmac(value, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
export function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let result = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return result === 0;
}
export function localDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
export const mapUser = u => ({ idUsuario: u.id_usuario, correo: u.correo, rol: u.rol, idTecnico: u.id_tecnico || '', estado: u.estado, intentosFallidos: u.intentos_fallidos || 0, bloqueadoHasta: localDate(u.bloqueado_hasta), debeCambiarContrasena: u.debe_cambiar_contrasena === true });
const mapTechnician = t => ({ idTecnico: t.id_tecnico, nombreCompleto: t.nombre_completo, correo: t.correo_electronico, telefono: t.telefono || '', especialidad: t.especialidad || '', estado: t.estado, fechaCreacion: localDate(t.fecha_creacion), fechaActualizacion: localDate(t.fecha_actualizacion) });
function attachments(value) {
  if (!value) return [];
  try { const parsed = typeof value === 'string' ? JSON.parse(value) : value; if (Array.isArray(parsed)) return parsed; } catch { /* Enlaces heredados de Drive. */ }
  return String(value).split(/[\n,]/).map(url => url.trim()).filter(url => /^https:\/\//.test(url)).map(url => ({ nombre: 'Adjunto', url }));
}
export const mapTicket = (t, technicians = []) => ({ numeroTicket: t.no_ticket, fechaCreacion: localDate(t.fecha_hora_creacion), solicitante: t.solicitante, sede: t.sede, area: t.area_departamento, tipo: t.tipo, categoria: t.categoria, descripcion: t.descripcion_detallada, adjuntos: attachments(t.adjuntos), prioridad: priority(t.prioridad), estado: state(t.estado), idTecnicoAsignado: t.tecnico_asignado || '', nombreTecnicoAsignado: technicians.find(x => x.id_tecnico === t.tecnico_asignado)?.nombre_completo || '', fechaAsignacion: localDate(t.fecha_asignacion), fechaResolucion: localDate(t.fecha_resolucion), resolucion: t.resolucion || '', observaciones: t.observaciones || '' });
const mapHistory = h => ({ idHistorial: String(h.id_historial), numeroTicket: h.no_ticket, fechaHora: localDate(h.fecha_hora), tipoEvento: h.tipo_evento, responsable: h.responsable, campoModificado: h.campo_modificado || '', valorAnterior: h.valor_anterior || '', valorNuevo: h.valor_nuevo || '', detalle: h.detalle || '' });

export function validateAttachments(files = []) {
  if (!Array.isArray(files) || files.length > 5) fail('INVALID_ATTACHMENT', 'Puedes adjuntar hasta cinco fotos.');
  return files.map(file => {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimeType)) fail('INVALID_ATTACHMENT', 'Selecciona imágenes JPG, PNG o WebP.');
    const data = String(file.data || '').replace(/^data:[^,]*;base64,/, '');
    if (!data || data.length > 6990508 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 !== 0) fail('INVALID_ATTACHMENT', 'La imagen no contiene Base64 válido o supera 5 MB.');
    let bytes;
    try { bytes = atob(data); } catch { fail('INVALID_ATTACHMENT', 'La imagen no contiene Base64 válido.'); }
    if (bytes.length > 5 * 1024 * 1024) fail('ATTACHMENT_TOO_LARGE', 'Cada foto debe pesar como máximo 5 MB.');
    const valid = file.mimeType === 'image/jpeg' ? bytes.startsWith('\xff\xd8\xff') : file.mimeType === 'image/png' ? bytes.startsWith('\x89PNG\r\n\x1a\n') : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
    if (!valid) fail('INVALID_ATTACHMENT', 'El contenido no corresponde al tipo de imagen.');
    return { name: required(file, 'name', 200), mimeType: file.mimeType, data };
  });
}

// repo.transaction debe serializar operaciones y revertirlas si el callback lanza.
// Los errores de login se devuelven, no se lanzan, para conservar el contador.
export function createBackend({ repo, pepper, drive, now = () => new Date() }) {
  if (!pepper) throw new Error('Falta AUTHENTICATION_PEPPER');
  const hashPassword = (value, salt) => hmac(`PASSWORD|${salt}|${value}`, pepper);
  const hashSession = token => hmac(`SESSION|${token}`, pepper);
  const denied = () => fail('FORBIDDEN', 'No tienes permisos para realizar esta acción.');
  const access = (user, ticket) => { if (user.rol !== 'ADMINISTRADOR' && (!user.id_tecnico || user.id_tecnico !== ticket.tecnico_asignado)) denied(); };
  return async function execute(request) {
    const { action, data = {}, sessionToken } = request || {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('VALIDATION_ERROR', 'Solicitud no válida.');
    return repo.transaction(async db => {
      const stamp = now().toISOString();
      const one = async (table, where, code = 'NOT_FOUND') => (await db.list(table, where))[0] || fail(code, code === 'TICKET_NOT_FOUND' ? 'No fue posible encontrar el ticket con los datos proporcionados.' : 'No se encontró el registro.');
      const ticket = async () => one('tickets', { no_ticket: upper(required(data, 'numeroTicket', 80)) }, 'TICKET_NOT_FOUND');
      const mapped = async t => mapTicket(t, await db.list('tecnicos'));
      const history = (t, type, responsible, field, before, after, detail) => db.insert('historial_tickets', { no_ticket: t.no_ticket, fecha_hora: stamp, tipo_evento: type, responsable: responsible, campo_modificado: field, valor_anterior: String(before ?? ''), valor_nuevo: String(after ?? ''), detalle: text(detail) });
      const session = async u => {
        const token = random();
        const expiration = new Date(now().getTime() + 8 * 3600000).toISOString();
        const updated = await db.update('usuarios', u.id_usuario, { hash_sesion: await hashSession(token), expiracion_sesion: expiration, intentos_fallidos: 0, bloqueado_hasta: null });
        return { token, expiraEn: localDate(expiration), usuario: mapUser(updated) };
      };
      if (action === 'login') {
        const correo = email(data.correo);
        if (typeof data.contrasena !== 'string' || !data.contrasena || data.contrasena.length > 256) fail('INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
        const u = (await db.list('usuarios', { correo }))[0];
        const supplied = await hashPassword(data.contrasena, u?.salt_contrasena || 'dummy');
        if (!u) return { authError: ['INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.'] };
        if (upper(u.estado) !== 'ACTIVO') fail('USER_INACTIVE', 'El usuario se encuentra inactivo.');
        if (u.bloqueado_hasta && new Date(u.bloqueado_hasta) > now()) fail('LOGIN_TEMPORARILY_LOCKED', 'Acceso bloqueado temporalmente. Intenta en 15 minutos.');
        if (!equal(supplied, u.hash_contrasena)) {
          const attempts = (u.bloqueado_hasta ? 0 : Number(u.intentos_fallidos || 0)) + 1;
          await db.update('usuarios', u.id_usuario, { intentos_fallidos: attempts >= 5 ? 0 : attempts, bloqueado_hasta: attempts >= 5 ? new Date(now().getTime() + 900000).toISOString() : null });
          return { authError: [attempts >= 5 ? 'LOGIN_TEMPORARILY_LOCKED' : 'INVALID_CREDENTIALS', attempts >= 5 ? 'Acceso bloqueado durante 15 minutos.' : 'Correo o contraseña incorrectos.'] };
        }
        return session(u);
      }
      if (action === 'trackTicket') {
        const requester = required(data, 'solicitante', 200);
        const t = await ticket();
        if (search(t.solicitante) !== search(requester)) fail('TICKET_NOT_FOUND', 'No fue posible encontrar el ticket con los datos proporcionados.');
        const { adjuntos, observaciones, idTecnicoAsignado, nombreTecnicoAsignado, ...result } = await mapped(t);
        return { ...result, tecnicoAsignado: nombreTecnicoAsignado };
      }
      if (action === 'createTicket') {
        const fields = { solicitante: required(data, 'solicitante', 200), sede: required(data, 'sede', 200), area_departamento: required(data, 'area', 200), tipo: required(data, 'tipo', 100), categoria: required(data, 'categoria', 200), descripcion_detallada: required(data, 'descripcion'), observaciones: text(data.observaciones).slice(0, 10000) };
        if (fields.descripcion_detallada.length < 10) fail('VALIDATION_ERROR', 'Describe la solicitud con al menos 10 caracteres.');
        const files = validateAttachments(data.adjuntos);
        if (files.length && !drive) fail('ATTACHMENTS_DISABLED', 'La carga de fotos todavía no está configurada. Puedes enviar el ticket sin fotos.');
        const number = await db.nextId('tickets', `TIC-${localDate(stamp).slice(0, 4)}-`);
        // El puente es idempotente por requestId. No usar el antiguo createTicket de Sheets.
        const uploaded = files.length ? await drive.upload(files, number, random()) : [];
        const t = await db.insert('tickets', { ...fields, no_ticket: number, fecha_hora_creacion: stamp, prioridad: 'MEDIA', estado: 'CREADO', adjuntos: uploaded.length ? JSON.stringify(uploaded) : null });
        await history(t, 'CREACION', fields.solicitante, 'ticket', '', number, 'Ticket registrado por el solicitante.');
        return mapped(t);
      }
      if (!sessionToken || typeof sessionToken !== 'string' || sessionToken.length > 512) fail('UNAUTHENTICATED', 'Debes iniciar sesión para continuar.');
      const u = (await db.list('usuarios', { hash_sesion: await hashSession(sessionToken) }))[0];
      if (!u) fail('INVALID_SESSION', 'Inicia sesión nuevamente.');
      if (upper(u.estado) !== 'ACTIVO') fail('USER_INACTIVE', 'El usuario se encuentra inactivo.');
      if (!u.expiracion_sesion || new Date(u.expiracion_sesion) <= now()) fail('SESSION_EXPIRED', 'La sesión expiró. Inicia sesión nuevamente.');
      if (action === 'logout') { await db.update('usuarios', u.id_usuario, { hash_sesion: null, expiracion_sesion: null }); return { loggedOut: true }; }
      if (action === 'changePassword') {
        if (!equal(await hashPassword(String(data.contrasenaActual || ''), u.salt_contrasena), u.hash_contrasena)) fail('INVALID_CURRENT_PASSWORD', 'La contraseña actual es incorrecta.');
        const value = password(data.contrasenaNueva);
        const salt = random();
        return session(await db.update('usuarios', u.id_usuario, { hash_contrasena: await hashPassword(value, salt), salt_contrasena: salt, debe_cambiar_contrasena: false }));
      }
      if (action === 'getCurrentUser') return mapUser(u);
      if (u.debe_cambiar_contrasena) fail('PASSWORD_CHANGE_REQUIRED', 'Debes cambiar la contraseña temporal antes de continuar.');
      if (!roles.includes(u.rol)) denied();
      const admin = () => { if (u.rol !== 'ADMINISTRADOR') denied(); };
      if (action === 'getTickets') {
        if (u.rol === 'TECNICO' && !u.id_tecnico) return [];
        const rows = await db.list('tickets', u.rol === 'TECNICO' ? { tecnico_asignado: u.id_tecnico } : {});
        const techs = await db.list('tecnicos');
        return rows.map(t => mapTicket(t, techs)).filter(t => (!data.estado || t.estado === state(data.estado)) && (!data.prioridad || t.prioridad === priority(data.prioridad)) && (!data.idTecnico || t.idTecnicoAsignado === data.idTecnico) && (!data.sede || search(t.sede).includes(search(data.sede))) && (!data.buscar || search([t.numeroTicket,t.solicitante,t.sede,t.area,t.categoria,t.descripcion].join(' ')).includes(search(data.buscar)))).sort((a,b) => b.fechaCreacion.localeCompare(a.fechaCreacion));
      }
      if (action === 'getUsers') { admin(); return (await db.list('usuarios')).map(mapUser); }
      if (['getTechnicians', 'getActiveTechnicians'].includes(action)) { admin(); return (await db.list('tecnicos', action === 'getActiveTechnicians' ? { estado: 'ACTIVO' } : {})).map(mapTechnician); }
      if (action === 'createTechnician') {
        admin();
        return mapTechnician(await db.insert('tecnicos', { id_tecnico: await db.nextId('tecnicos', 'TEC-'), nombre_completo: required(data, 'nombreCompleto', 200), correo_electronico: email(data.correo), telefono: text(data.telefono).slice(0, 100), especialidad: text(data.especialidad).slice(0, 500), estado: 'ACTIVO', fecha_creacion: stamp, fecha_actualizacion: stamp }));
      }
      if (action === 'createUser') {
        admin();
        const role = member(upper(data.rol), roles);
        const id = role === 'TECNICO' ? required(data, 'idTecnico', 80) : null;
        if (id && (await one('tecnicos', { id_tecnico: id })).estado !== 'ACTIVO') fail('TECHNICIAN_INACTIVE', 'Selecciona un técnico activo.');
        const salt = random();
        return mapUser(await db.insert('usuarios', { id_usuario: await db.nextId('usuarios', 'USR-'), correo: email(data.correo), rol: role, id_tecnico: id, salt_contrasena: salt, hash_contrasena: await hashPassword(password(data.contrasenaTemporal), salt), estado: 'ACTIVO', intentos_fallidos: 0, debe_cambiar_contrasena: true }));
      }
      const ticketActions = ['getTicket', 'getTicketHistory', 'assignTicket', 'changePriority', 'changeStatus', 'finishTicket', 'cancelTicket', 'addTicketComment'];
      if (!ticketActions.includes(action)) fail('INVALID_ACTION', 'La acción no está disponible.');
      if (['assignTicket', 'changePriority', 'cancelTicket'].includes(action)) admin();
      const t = await ticket();
      access(u, t);
      if (action === 'getTicket') return mapped(t);
      if (action === 'getTicketHistory') return (await db.list('historial_tickets', { no_ticket: t.no_ticket })).sort((a,b) => new Date(a.fecha_hora) - new Date(b.fecha_hora) || Number(a.id_historial) - Number(b.id_historial)).map(mapHistory);
      const oldState = state(t.estado);
      const patch = {};
      let event, field, before, after, detail = text(data.detalle).slice(0, 10000);
      if (action === 'assignTicket') {
        if (!states.slice(0,4).includes(oldState)) fail('INVALID_TICKET_STATE', 'Solo se pueden asignar tickets abiertos.');
        const id = required(data, 'idTecnico', 80);
        if ((await one('tecnicos', { id_tecnico: id })).estado !== 'ACTIVO') fail('TECHNICIAN_INACTIVE', 'Selecciona un técnico activo.');
        if (id === t.tecnico_asignado) fail('NO_CHANGES', 'El ticket ya está asignado a este técnico.');
        Object.assign(patch, { tecnico_asignado: id, fecha_asignacion: stamp, estado: oldState === 'CREADO' ? 'ASIGNADO' : oldState });
        [event, field, before, after] = [t.tecnico_asignado ? 'REASIGNACION' : 'ASIGNACION', 'tecnicoAsignado', t.tecnico_asignado, id];
      } else if (action === 'changePriority') {
        patch.prioridad = member(priority(data.prioridad), priorities);
        if (patch.prioridad === priority(t.prioridad)) fail('NO_CHANGES', 'El ticket ya posee esa prioridad.');
        [event, field, before, after] = ['CAMBIO_PRIORIDAD', 'prioridad', priority(t.prioridad), patch.prioridad];
      } else if (action === 'changeStatus') {
        const next = member(state(data.nuevoEstado), states);
        const transitions = { ASIGNADO: ['EN PROCESO', 'PENDIENTE'], 'EN PROCESO': ['PENDIENTE'], PENDIENTE: ['EN PROCESO'], RESUELTO: ['CERRADO'] };
        if (next === 'CERRADO') admin();
        if (!(transitions[oldState] || []).includes(next)) fail('INVALID_TICKET_STATE', 'La transición solicitada no está permitida. Actualiza el ticket.');
        patch.estado = next;
        [event, field, before, after] = ['CAMBIO_ESTADO', 'estado', oldState, next];
      } else if (action === 'finishTicket') {
        if (!['EN PROCESO', 'PENDIENTE'].includes(oldState)) fail('INVALID_TICKET_STATE', 'El ticket debe estar en proceso o pendiente.');
        Object.assign(patch, { estado: 'RESUELTO', fecha_resolucion: stamp, resolucion: required(data, 'resolucion') });
        [event, field, before, after, detail] = ['RESOLUCION', 'estado', oldState, 'RESUELTO', patch.resolucion];
      } else if (action === 'cancelTicket') {
        if (!states.slice(0,4).includes(oldState)) fail('INVALID_TICKET_STATE', 'Solo se pueden cancelar tickets abiertos.');
        patch.estado = 'CANCELADO';
        [event, field, before, after, detail] = ['CANCELACION', 'estado', oldState, 'CANCELADO', required(data, 'motivo')];
      } else if (action === 'addTicketComment') {
        const comment = required(data, 'comentario');
        patch.observaciones = [t.observaciones, `[${localDate(stamp)}] ${u.correo}: ${comment}`].filter(Boolean).join('\n');
        [event, field, before, after, detail] = ['COMENTARIO', 'observaciones', '', comment, comment];
      }
      const updated = await db.update('tickets', t.no_ticket, patch);
      await history(t, event, u.correo, field, before, after, detail);
      if (action === 'assignTicket' && oldState !== patch.estado) await history(t, 'CAMBIO_ESTADO', u.correo, 'estado', oldState, patch.estado, 'Cambio automático por asignación.');
      return mapped(updated);
    }).then(result => { if (result?.authError) throw new AppError(...result.authError); return result; });
  };
}
