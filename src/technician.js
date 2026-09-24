export function technicianTransitions(state) {
  return { ASIGNADO: ['EN PROCESO', 'PENDIENTE'], 'EN PROCESO': ['PENDIENTE'], PENDIENTE: ['EN PROCESO'] }[state] || [];
}
export function canResolve(state) { return ['EN PROCESO','PENDIENTE'].includes(state); }
export function technicianPayload(action, ticket, values) {
  const data = { numeroTicket: ticket.numeroTicket };
  if (action === 'changeStatus') {
    if (!technicianTransitions(ticket.estado).includes(values.nuevoEstado)) throw new Error('Este cambio de estado no está disponible. Actualiza el ticket.');
    data.nuevoEstado = values.nuevoEstado;
    if (values.detalle?.trim()) data.detalle = values.detalle.trim();
  } else if (action === 'addTicketComment') {
    if (!values.comentario?.trim()) throw new Error('Escribe el avance que deseas registrar.');
    data.comentario = values.comentario.trim();
  } else if (action === 'finishTicket') {
    if (!canResolve(ticket.estado)) throw new Error('El ticket debe estar en proceso o pendiente antes de resolverlo.');
    if (!values.resolucion?.trim()) throw new Error('Describe la solución aplicada antes de resolver el ticket.');
    data.resolucion = values.resolucion.trim();
  } else throw new Error('Acción no permitida para el técnico.');
  return data;
}
export function ownTickets(tickets, technicianId) {
  return technicianId ? tickets.filter(t => t.idTecnicoAsignado === technicianId) : [];
}
