import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, CheckCircle2, CirclePause, Inbox, RefreshCw, KeyRound, LogOut, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { filterTickets, STATES, summarizeTickets } from './admin.js';
import { ownTickets } from './technician.js';
import { TicketDetails } from './TicketDetails.jsx';
export function TechnicianDashboard({ api, session, busy, error, onAuthError, onBusyChange, onLogout, onChangePassword }) {
  const [tickets, setTickets] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ABIERTOS');
  const [priority, setPriority] = useState('');
  const [page, setPage] = useState(1);
  const [updated, setUpdated] = useState('');
  const technicianId = session.usuario.idTecnico;
  useEffect(() => {
    let active = true; setLoading(true); setLoadError('');
    if (!technicianId) { setLoadError('Tu cuenta no tiene una ficha técnica vinculada. Solicita al administrador que revise tu acceso.'); setLoading(false); return; }
    api('getTickets', {}, session.token).then(result => {
      if (!Array.isArray(result)) throw new Error('El servicio no devolvió una lista válida.');
      if (active) { setTickets(ownTickets(result, technicianId)); setLoaded(true); setUpdated(new Date().toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })); }
    }).catch(e => { if (active) { setLoadError(e.message); onAuthError(e); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, session.token, technicianId, revision]);
  const stats = useMemo(() => summarizeTickets(tickets), [tickets]);
  const filtered = useMemo(() => filterTickets(tickets, { search, status, priority }), [tickets, search, status, priority]);
  const pages = Math.max(1, Math.ceil(filtered.length / 10)); const currentPage = Math.min(page,pages);
  function chooseStatus(value) { setStatus(value); setPage(1); }
  function updateTicket(ticket) {
    if (ticket.idTecnicoAsignado !== technicianId) { setSelected(null); setTickets(all => all.filter(t => t.numeroTicket !== ticket.numeroTicket)); return; }
    setSelected(ticket); setTickets(all => all.map(t => t.numeroTicket === ticket.numeroTicket ? ticket : t));
  }
  return <section className="admin-dashboard technician-dashboard" aria-label="Panel de técnico"><header className="admin-hero"><div><p className="overline">MI ESPACIO DE TRABAJO · INFORMÁTICA</p><h2>Mis tickets asignados</h2><p>Organiza la atención, registra avances y documenta las soluciones.</p></div><div className="admin-session"><span>TÉCNICO · {technicianId || 'SIN VINCULAR'}</span><strong>{session.usuario.correo}</strong><div><button className="help-link" disabled={busy} onClick={onChangePassword}><KeyRound size={14}/>Contraseña</button><button className="help-link" disabled={busy} onClick={onLogout}><LogOut size={14}/>Cerrar sesión</button></div></div></header>{error && <div className="error" role="alert">{error}</div>}{loadError && <div className="error" role="alert">{loadError}</div>}<div className="admin-section-heading"><div><h3>Mi carga de trabajo</h3><p>{updated ? `Última actualización: ${updated}${loadError ? ' · Datos de la última carga disponible' : ''}` : 'Solo solicitudes asignadas a tu ficha técnica'}</p></div><button className="secondary" disabled={loading || busy || !technicianId} onClick={() => setRevision(v => v+1)}><RefreshCw size={15}/>{loading ? 'Cargando…' : 'Actualizar'}</button></div>{loading && !loaded && <p className="admin-loading" role="status">Consultando tus tickets…</p>}
    <div className="metric-grid">{[['Por iniciar',stats.counts.ASIGNADO,Inbox,'ASIGNADO'],['En proceso',stats.counts['EN PROCESO'],Clock3,'EN PROCESO'],['Pendientes',stats.counts.PENDIENTE,CirclePause,'PENDIENTE'],['Resueltos / cerrados',stats.finished,CheckCircle2,'FINALIZADOS']].map(([label,count,Icon,value]) => <button key={value} className="metric-card" disabled={!loaded} onClick={() => chooseStatus(value)}><div><span>{label}</span><Icon size={21}/></div><strong>{loaded ? count : '—'}</strong><small>Ver solicitudes</small></button>)}</div>
    <section className="admin-card"><div className="admin-section-heading"><div><h3>Bandeja de atención</h3><p>{loaded ? `${stats.open} abiertos · ${stats.urgent} de prioridad alta o crítica` : 'Sin datos cargados'}</p></div><span className="count-label">{filtered.length} resultados</span></div><div className="ticket-filters"><label className="field">Buscar<span className="input-wrap"><input placeholder="Ticket, solicitante o sede" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}/></span></label><label className="field">Estado<select value={status} onChange={e => chooseStatus(e.target.value)}><option value="ABIERTOS">Todos los abiertos</option><option value="">Todos mis tickets</option><option value="FINALIZADOS">Resueltos y cerrados</option>{STATES.map(state => <option key={state}>{state}</option>)}</select></label><label className="field">Prioridad<select value={priority} onChange={e => { setPriority(e.target.value); setPage(1); }}><option value="">Todas</option>{['BAJA','MEDIA','ALTA','CRITICA'].map(p => <option key={p}>{p}</option>)}</select></label></div><div className="admin-table-scroll"><table className="admin-table"><caption className="sr-only">Tickets asignados a mi usuario técnico</caption><thead><tr><th>Ticket / fecha</th><th>Solicitud / sede</th><th>Estado</th><th>Prioridad</th><th>Atención</th></tr></thead><tbody>{filtered.slice((currentPage-1)*10,currentPage*10).map(ticket => <tr key={ticket.numeroTicket}><td><button className="ticket-link" onClick={() => setSelected(ticket)}>{ticket.numeroTicket}</button><small>{ticket.fechaCreacion}</small></td><td><strong>{ticket.solicitante}</strong><small>{ticket.sede} · {ticket.categoria}</small></td><td><span className="status-pill" data-status={ticket.estado}>{ticket.estado}</span></td><td><span className="priority-pill" data-priority={ticket.prioridad}>{ticket.prioridad}</span></td><td><button className="secondary" onClick={() => setSelected(ticket)} aria-label={`Abrir atención de ${ticket.numeroTicket}`}>Abrir <ArrowUpRight size={14}/></button></td></tr>)}</tbody></table></div>{loaded && !filtered.length && <p className="admin-empty">{tickets.length ? 'No hay tickets que coincidan con los filtros.' : 'Todavía no tienes tickets asignados. Aparecerán aquí cuando el administrador te asigne una solicitud.'}</p>}<div className="table-pagination"><span>Página {currentPage} de {pages}</span><div><button className="secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage-1)} aria-label="Página anterior"><ChevronLeft size={16}/></button><button className="secondary" disabled={currentPage === pages} onClick={() => setPage(currentPage+1)} aria-label="Página siguiente"><ChevronRight size={16}/></button></div></div></section>
    {selected && <TicketDetails key={selected.numeroTicket} mode="technician" api={api} token={session.token} ticket={selected} onUpdated={updateTicket} onAuthError={onAuthError} onBusyChange={onBusyChange} onClose={() => setSelected(null)}/>}
  </section>;
}
