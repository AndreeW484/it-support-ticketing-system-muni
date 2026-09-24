import { OPEN_STATES } from './admin.js';
export function assignmentPayload(ticket, technicianId, technicians, detail = '') {
  if (!OPEN_STATES.includes(ticket.estado)) throw new Error('Solo se pueden asignar tickets abiertos.');
  if (!technicians.some(t => t.idTecnico === technicianId && t.estado === 'ACTIVO')) throw new Error('Selecciona un técnico activo.');
  if (ticket.idTecnicoAsignado === technicianId) throw new Error('Este técnico ya tiene asignado el ticket.');
  return { numeroTicket: ticket.numeroTicket, idTecnico: technicianId, ...(detail.trim() ? { detalle: detail.trim() } : {}) };
}
export async function assignTicket(api, token, ticket, technicianId, technicians, detail) {
  const result = await api('assignTicket', assignmentPayload(ticket, technicianId, technicians, detail), token);
  if (result?.numeroTicket !== ticket.numeroTicket || result?.idTecnicoAsignado !== technicianId || !result?.estado) throw new Error('No se recibió la confirmación completa. Actualiza el ticket antes de volver a asignarlo.');
  return result;
}

export const PRIORITIES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];
export async function changeTicketPriority(api, token, ticket, priority, detail = '') {
  if (!PRIORITIES.includes(priority)) throw new Error('Selecciona una prioridad válida.');
  if (priority === ticket.prioridad) throw new Error('El ticket ya tiene esta prioridad.');
  const result = await api('changePriority', { numeroTicket: ticket.numeroTicket, prioridad: priority, ...(detail.trim() ? { detalle: detail.trim() } : {}) }, token);
  if (result?.numeroTicket !== ticket.numeroTicket || result?.prioridad !== priority || !result?.estado) throw new Error('No se recibió la confirmación completa. Actualiza el ticket antes de repetir el cambio.');
  return result;
}
