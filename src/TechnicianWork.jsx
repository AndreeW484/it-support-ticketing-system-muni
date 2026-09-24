import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, MessageSquarePlus, History, RefreshCw, Workflow } from 'lucide-react';
import { technicianTransitions, canResolve, technicianPayload } from './technician.js';
export function TechnicianWork({ api, token, ticket, disabled, onUpdated, onAuthError, onBusyChange }) {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState('');
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState('');
  const [comment, setComment] = useState('');
  const [resolution, setResolution] = useState('');
  const lock = useRef(false);
  useEffect(() => {
    let active = true; setLoading(true); setReady(false); setError(''); setHistoryError('');
    Promise.allSettled([api('getTicket', { numeroTicket: ticket.numeroTicket }, token), api('getTicketHistory', { numeroTicket: ticket.numeroTicket }, token)]).then(([result, events]) => {
      if (!active) return;
      if (result.status === 'fulfilled' && result.value?.numeroTicket === ticket.numeroTicket) { onUpdated(result.value); setReady(true); }
      else { const e = result.status === 'rejected' ? result.reason : new Error('No se pudo leer el ticket.'); setError(e.message); onAuthError(e); }
      if (events.status === 'fulfilled' && Array.isArray(events.value)) setHistory(events.value);
      else { const e = events.status === 'rejected' ? events.reason : new Error('No se pudo leer el historial.'); setHistoryError(e.message); onAuthError(e); }
      setLoading(false);
    });
    return () => { active = false; };
  }, [api, token, ticket.numeroTicket, revision]);
  useEffect(() => { setStatus(''); }, [ticket.estado]);
  async function submit(e, action, values) {
    e.preventDefault(); if (lock.current || disabled || !ready) return;
    let data;
    try { data = technicianPayload(action, ticket, values); } catch (e) { setError(e.message); return; }
    lock.current = true; setSaving(action); onBusyChange(true); setError(''); setNotice('');
    try {
      const result = await api(action, data, token);
      if (result?.numeroTicket !== ticket.numeroTicket || !result?.estado) throw new Error('No se recibió la confirmación completa. Actualiza el ticket antes de repetir la operación.');
      onUpdated(result);
      if (action === 'addTicketComment') setComment('');
      if (action === 'finishTicket') setResolution('');
      if (action === 'changeStatus') { setStatus(''); setDetail(''); }
      setNotice(action === 'finishTicket' ? 'Ticket resuelto. La solución quedó registrada.' : action === 'addTicketComment' ? 'Avance registrado en el ticket.' : 'Estado actualizado correctamente.');
      setHistoryError('');
      try { const events = await api('getTicketHistory', { numeroTicket: ticket.numeroTicket }, token); if (!Array.isArray(events)) throw new Error('Respuesta de historial no válida.'); setHistory(events); }
      catch (e) { setHistoryError('El cambio se guardó, pero no se pudo actualizar el historial. Usa Actualizar para consultarlo nuevamente.'); onAuthError(e); }
    } catch (e) { setError(e.message); onAuthError(e); }
    finally { lock.current = false; setSaving(''); onBusyChange(false); }
  }
  const blocked = disabled || loading || !ready || !!saving;
  const transitions = technicianTransitions(ticket.estado);
  return <div className="technician-work"><div className="assignment-heading"><h3><Workflow size={19}/>Atención del ticket</h3><button className="text-button" disabled={disabled || loading} onClick={() => setRevision(v => v+1)}><RefreshCw size={14}/>Actualizar</button></div>{loading && <p role="status">Actualizando detalle e historial…</p>}{error && <div className="error" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}
    {transitions.length > 0 && <form className="work-block" onSubmit={e => submit(e, 'changeStatus', { nuevoEstado: status, detalle: detail })}><fieldset disabled={blocked}><h4>Cambiar estado</h4><label className="field">Siguiente etapa<select required value={status} onChange={e => setStatus(e.target.value)}><option value="">Selecciona una acción</option>{transitions.map(s => <option key={s} value={s}>{s === 'EN PROCESO' ? (ticket.estado === 'PENDIENTE' ? 'Retomar atención · En proceso' : 'Iniciar atención · En proceso') : 'Dejar pendiente'}</option>)}</select></label><label className="field">{status === 'PENDIENTE' ? 'Motivo de la espera' : 'Nota del cambio (opcional)'}<textarea rows={2} maxLength={2000} required={status === 'PENDIENTE'} value={detail} onChange={e => setDetail(e.target.value)} placeholder="Indica el contexto de la atención"/></label><button className="secondary" type="submit" disabled={!status}>{saving === 'changeStatus' ? 'Guardando…' : 'Guardar estado'}</button></fieldset></form>}
    <form className="work-block" onSubmit={e => submit(e, 'addTicketComment', { comentario: comment })}><fieldset disabled={blocked}><h4><MessageSquarePlus size={17}/>Registrar avance</h4><label className="field">Nota interna<textarea required rows={3} maxLength={4000} value={comment} onChange={e => setComment(e.target.value)} placeholder="Describe las revisiones, acciones realizadas o seguimiento requerido."/></label><p className="form-note">Se registra con tu correo y fecha, sin reemplazar los avances anteriores.</p><button type="submit" className="secondary">{saving === 'addTicketComment' ? 'Guardando…' : 'Guardar avance'}</button></fieldset></form>
    {canResolve(ticket.estado) && <form className="work-block resolve-block" onSubmit={e => submit(e, 'finishTicket', { resolucion: resolution })}><fieldset disabled={blocked}><h4><CheckCircle2 size={17}/>Resolver ticket</h4><label className="field">Solución aplicada<textarea required rows={3} maxLength={4000} value={resolution} onChange={e => setResolution(e.target.value)} placeholder="Documenta cómo se solucionó la solicitud. Esta información será visible en la consulta pública."/></label><p className="form-note">Al confirmar, el estado cambiará a Resuelto. El cierre administrativo lo realiza el administrador.</p><button type="submit" className="primary">{saving === 'finishTicket' ? 'Guardando resolución…' : 'Confirmar resolución'}</button></fieldset></form>}
    {!transitions.length && !canResolve(ticket.estado) && <p className="form-note">{ticket.estado === 'CREADO' ? 'El administrador debe completar la asignación antes de iniciar la atención.' : 'Este ticket no permite más cambios de estado desde tu rol. Puedes consultar el historial y registrar notas internas.'}</p>}
    <section className="work-history"><h4><History size={18}/>Historial de atención</h4>{historyError && <div className="error" role="alert">{historyError}</div>}{!loading && !historyError && !history.length && <p className="form-note">No hay movimientos registrados.</p>}<ol>{history.map((item,index) => <li key={item.idHistorial || index}><div><strong>{String(item.tipoEvento || 'Movimiento').replaceAll('_', ' ')}</strong><time>{item.fechaHora}</time></div><small>{item.responsable}</small>{item.valorNuevo && item.campoModificado === 'estado' && <span className="status-pill" data-status={item.valorNuevo}>{item.valorNuevo}</span>}<p>{item.detalle}</p></li>)}</ol></section>
  </div>;
}
