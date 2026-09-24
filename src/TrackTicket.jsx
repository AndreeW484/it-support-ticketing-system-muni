import React, { useRef, useState } from 'react';
import { Search, Clock3, CheckCircle2, CirclePause, XCircle, UserRound, CalendarDays, ClipboardList } from 'lucide-react';
import { TextField } from './Fields.jsx';
const states = {
  CREADO: ['Recibido', 'Tu solicitud fue registrada y está pendiente de asignación.', Clock3, 'waiting'],
  ASIGNADO: ['Asignado', 'Un técnico ha sido asignado a tu solicitud.', UserRound, 'active'],
  'EN PROCESO': ['En proceso', 'El equipo de informática está trabajando en tu solicitud.', Clock3, 'active'],
  PENDIENTE: ['Pendiente', 'La atención está en espera de continuar.', CirclePause, 'waiting'],
  RESUELTO: ['Resuelto', 'La solución de tu solicitud ha sido registrada.', CheckCircle2, 'done'],
  CERRADO: ['Cerrado', 'El ticket se encuentra cerrado.', CheckCircle2, 'done'],
  CANCELADO: ['Cancelado', 'El ticket fue cancelado.', XCircle, 'cancelled'],
};
export function TrackTicket({ api, initial = {} }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ticket, setTicket] = useState(null);
  const lock = useRef(false);
  const resultHeading = useRef(null);
  async function submit(e) {
    e.preventDefault(); if (lock.current) return;
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    if (!fields.numeroTicket.trim() || !fields.solicitante.trim()) { setError('Completa el número de ticket y el nombre del solicitante.'); return; }
    lock.current = true; setBusy(true); setError(''); setTicket(null);
    try {
      const result = await api('trackTicket', fields);
      if (!result?.numeroTicket || !result?.estado) throw new Error('El servicio devolvió una respuesta incompleta. Intenta nuevamente.');
      setTicket(result);
      requestAnimationFrame(() => resultHeading.current?.focus());
    } catch (e) { setError(e.code === 'TICKET_NOT_FOUND' ? 'No encontramos un ticket con esos datos. Revisa el número y escribe el nombre utilizado al enviarlo.' : e.message); }
    finally { setBusy(false); lock.current = false; }
  }
  const [label, description, Icon, tone] = ticket ? (states[ticket.estado] || [ticket.estado, 'Estado actual informado por informática.', ClipboardList, 'waiting']) : [];
  return <section className="login-content tracking" aria-label="Consultar estado de ticket"><p className="overline">SEGUIMIENTO DE SOLICITUDES</p><h2>Consultar mi ticket</h2><p className="subtitle">Revisa el avance de tu solicitud.</p>
    <form onSubmit={submit} aria-busy={busy} onChange={() => { setTicket(null); setError(''); }}><fieldset disabled={busy}><div className="form-grid"><TextField label="Número de ticket" name="numeroTicket" defaultValue={initial.numeroTicket} placeholder="TIC-2026-0001" autoComplete="off" spellCheck="false"/><TextField label="Nombre del solicitante" name="solicitante" defaultValue={initial.solicitante} placeholder="Como lo escribiste en el ticket" autoComplete="name"/></div><button className="primary" type="submit">{busy ? <><span className="spinner"/>Consultando…</> : <><Search size={18}/>{ticket ? 'Actualizar estado' : 'Consultar estado'}</>}</button></fieldset></form>
    {error && <div className="error tracking-error" role="alert">{error}</div>}
    {!ticket && !error && !busy && <div className="tracking-empty"><ClipboardList size={25}/><p>Encontrarás el número de ticket en la confirmación de envío.</p></div>}
    {ticket && <article className="tracking-result" aria-label="Resultado de la consulta"><div className={`ticket-state ${tone}`}><span className="state-icon"><Icon size={24}/></span><div><span className="tracking-number">{ticket.numeroTicket}</span><h3 ref={resultHeading} tabIndex={-1}>{label}</h3><p>{description}</p></div></div><dl className="tracking-details"><div><dt><UserRound size={14}/>Técnico asignado</dt><dd>{ticket.tecnicoAsignado || 'Por asignar'}</dd></div><div><dt>Prioridad</dt><dd>{ticket.prioridad || 'Sin especificar'}</dd></div><div><dt>Sede / área</dt><dd>{[ticket.sede, ticket.area].filter(Boolean).join(' · ') || 'Sin especificar'}</dd></div><div><dt>Categoría</dt><dd>{ticket.categoria || 'Sin especificar'}</dd></div></dl><details className="tracking-description"><summary>Ver descripción del ticket</summary><p>{ticket.descripcion}</p></details><div className="tracking-dates"><CalendarDays size={16}/><div>{[['Registrado',ticket.fechaCreacion],['Asignado',ticket.fechaAsignacion],['Resolución registrada',ticket.fechaResolucion]].filter(([, date]) => date).map(([name,date]) => <p key={name}><span>{name}</span><time>{date}</time></p>)}</div></div>{ticket.resolucion && <section className="resolution"><h4>Resolución registrada</h4><p>{ticket.resolucion}</p></section>}</article>}
  </section>;
}
