import { summarizeTickets, OPEN_STATES } from './admin.js';
export function ticketDay(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T]|$)/);
  if (!match) return '';
  const day = match.slice(1).join('-');
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(+date) && date.toISOString().slice(0,10) === day ? day : '';
}
export function reportData(tickets, { from = '', to = '', site = '' } = {}) {
  const invalidRange = Boolean(from && to && from > to);
  const rows = invalidRange ? [] : tickets.filter(t => {
    const day = ticketDay(t.fechaCreacion);
    return (!site || t.sede === site) && (!(from || to) || (day && (!from || day >= from) && (!to || day <= to)));
  });
  const group = key => {
    const counts = new Map();
    rows.forEach(t => { const label = String(t[key] || 'Sin especificar'); counts.set(label, (counts.get(label) || 0) + 1); });
    return [...counts].map(([label,value]) => ({label,value})).sort((a,b) => b.value-a.value || a.label.localeCompare(b.label));
  };
  const months = new Map();
  rows.forEach(t => { const day = ticketDay(t.fechaCreacion); if(day) months.set(day.slice(0,7), (months.get(day.slice(0,7)) || 0)+1); });
  const technicians = new Map();
  rows.forEach(t => {
    const id = t.idTecnicoAsignado || '__unassigned';
    if(!technicians.has(id)) technicians.set(id, {id, name: id === '__unassigned' ? 'Sin asignar' : t.nombreTecnicoAsignado || id, total:0, open:0, finished:0, cancelled:0});
    const r = technicians.get(id); r.total++; if(OPEN_STATES.includes(t.estado)) r.open++; if(['RESUELTO','CERRADO'].includes(t.estado)) r.finished++; if(t.estado === 'CANCELADO') r.cancelled++;
  });
  const stats = summarizeTickets(rows);
  return { rows, stats, invalidRange, unknownDates: rows.filter(t=>!ticketDay(t.fechaCreacion)).length, sites:group('sede'), categories:group('categoria'), priorities:group('prioridad'), types:group('tipo'), months:[...months].sort(([a],[b])=>a.localeCompare(b)).map(([label,value])=>({label,value})), technicians:[...technicians.values()].sort((a,b)=>b.open-a.open || b.total-a.total), rate:stats.total ? Math.round(stats.finished/stats.total*100) : null };
}
