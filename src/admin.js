export const STATES = ['CREADO', 'ASIGNADO', 'EN PROCESO', 'PENDIENTE', 'RESUELTO', 'CERRADO', 'CANCELADO'];
export const OPEN_STATES = STATES.slice(0, 4);
export const FINAL_STATES = ['RESUELTO', 'CERRADO'];
export function summarizeTickets(tickets) {
  const counts = Object.fromEntries(STATES.map(state => [state, 0]));
  for (const ticket of tickets) counts[ticket.estado] = (counts[ticket.estado] || 0) + 1;
  return { counts, total: tickets.length, open: tickets.filter(t => OPEN_STATES.includes(t.estado)).length, finished: tickets.filter(t => FINAL_STATES.includes(t.estado)).length, cancelled: counts.CANCELADO, urgent: tickets.filter(t => OPEN_STATES.includes(t.estado) && ['ALTA','CRITICA'].includes(t.prioridad)).length };
}
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function filterTickets(tickets, { search = '', status = '', priority = '' }) {
  return tickets.filter(t => (!status || (status === 'ABIERTOS' ? OPEN_STATES.includes(t.estado) : status === 'FINALIZADOS' ? FINAL_STATES.includes(t.estado) : t.estado === status)) && (!priority || t.prioridad === priority) && normalize([t.numeroTicket, t.solicitante, t.sede, t.area, t.categoria, t.nombreTecnicoAsignado, t.descripcion].join(' ')).includes(normalize(search).trim()));
}
export function safeAttachmentUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}
export function userPayload(fields) {
  if (!['ADMINISTRADOR','TECNICO'].includes(fields.rol)) throw new Error('Selecciona un rol válido.');
  if (fields.rol === 'TECNICO' && !fields.idTecnico) throw new Error('Selecciona una ficha técnica activa.');
  return { correo: fields.correo.trim().toLowerCase(), rol: fields.rol, idTecnico: fields.rol === 'TECNICO' ? fields.idTecnico : '', contrasenaTemporal: fields.password };
}
