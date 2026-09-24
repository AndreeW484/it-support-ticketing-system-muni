import { OPEN_STATES } from './admin.js';
export function finalizationRequest(ticket, action, note = '') {
  const numeroTicket = ticket.numeroTicket;
  if (action === 'close') {
    if (ticket.estado !== 'RESUELTO') throw new Error('Solo se pueden cerrar tickets resueltos.');
    return { action: 'changeStatus', data: { numeroTicket, nuevoEstado: 'CERRADO', ...(note.trim() ? { detalle: note.trim() } : {}) }, expected: 'CERRADO' };
  }
  if (action === 'cancel') {
    if (!OPEN_STATES.includes(ticket.estado)) throw new Error('Solo se pueden cancelar tickets abiertos.');
    if (!note.trim()) throw new Error('Indica el motivo de cancelación.');
    return { action: 'cancelTicket', data: { numeroTicket, motivo: note.trim() }, expected: 'CANCELADO' };
  }
  throw new Error('Acción no válida.');
}
export async function finalizeTicket(api, token, ticket, action, note) {
  const request = finalizationRequest(ticket, action, note);
  const result = await api(request.action, request.data, token);
  if (result?.numeroTicket !== ticket.numeroTicket || result?.estado !== request.expected) throw new Error('No se recibió la confirmación completa. Actualiza el ticket antes de repetir la operación.');
  return result;
}
