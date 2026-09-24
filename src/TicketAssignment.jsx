import React, { useEffect, useRef, useState } from 'react';
import { UserRoundCheck, RefreshCw } from 'lucide-react';
import { OPEN_STATES } from './admin.js';
import { assignTicket } from './assignment.js';
export function TicketAssignment({ api, token, ticket, disabled, onUpdated, onAuthError, onBusyChange }) {
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [technicianId, setTechnicianId] = useState(ticket.idTecnicoAsignado || '');
  const [detail, setDetail] = useState('');
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  const canAssign = OPEN_STATES.includes(ticket.estado);
  useEffect(() => {
    if (!canAssign) { setLoading(false); return; }
    let active = true; setLoading(true); setError('');
    api('getActiveTechnicians', {}, token).then(result => {
      if (!Array.isArray(result)) throw new Error('No se pudo leer la lista de técnicos.');
      if (active) setTechnicians(result.filter(t => t.estado === 'ACTIVO'));
    }).catch(e => { if (active) { setError(e.message); onAuthError(e); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, token, canAssign, revision]);
  async function submit(e) {
    e.preventDefault(); if (lock.current || disabled) return;
    lock.current = true; setSaving(true); onBusyChange(true); setError(''); setNotice('');
    try {
      const updated = await assignTicket(api, token, ticket, technicianId, technicians, detail);
      onUpdated(updated); setDetail('');
      setNotice(`Asignación guardada: ${updated.nombreTecnicoAsignado || technicians.find(t => t.idTecnico === technicianId)?.nombreCompleto || technicianId}.`);
    } catch (e) { setError(e.message); onAuthError(e); }
    finally { lock.current = false; setSaving(false); onBusyChange(false); }
  }
  if (!canAssign) return <section className="assignment-panel"><h3><UserRoundCheck size={18}/>Responsable del ticket</h3><p>Este ticket está finalizado o cancelado y no permite asignación.</p></section>;
  return <section className="assignment-panel"><div className="assignment-heading"><h3><UserRoundCheck size={18}/>{ticket.idTecnicoAsignado ? 'Reasignar técnico' : 'Asignar técnico'}</h3><button type="button" className="text-button" disabled={loading || saving || disabled} onClick={() => setRevision(v => v+1)} aria-label="Actualizar técnicos"><RefreshCw size={15}/></button></div><p>Responsable actual: <strong>{ticket.nombreTecnicoAsignado || 'Sin asignar'}</strong></p>{error && <div className="error" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}{loading ? <p role="status">Cargando técnicos activos…</p> : !technicians.length ? <p>Registra una ficha técnica activa en «Usuarios y técnicos» para poder asignar solicitudes.</p> : <form onSubmit={submit} aria-busy={saving}><fieldset disabled={saving || loading || disabled}><label className="field">Técnico responsable<select required value={technicianId} onChange={e => { setTechnicianId(e.target.value); setNotice(''); }}><option value="">Selecciona un técnico</option>{ticket.idTecnicoAsignado && !technicians.some(t => t.idTecnico === ticket.idTecnicoAsignado) && <option value={ticket.idTecnicoAsignado} disabled>Responsable actual no disponible</option>}{technicians.map(t => <option key={t.idTecnico} value={t.idTecnico}>{t.nombreCompleto} · {t.correo}</option>)}</select></label><label className="field">Nota de asignación (opcional)<textarea value={detail} onChange={e => setDetail(e.target.value)} maxLength={1000} rows={2} placeholder="Indicación para la atención o motivo de reasignación"/></label><p className="assignment-note">{ticket.estado === 'CREADO' ? 'Al confirmar, el ticket pasará a Asignado.' : 'La reasignación conservará el estado actual del ticket.'}</p><button type="submit" className="primary" disabled={!technicianId || technicianId === ticket.idTecnicoAsignado}>{saving ? <><span className="spinner"/>Guardando asignación…</> : ticket.idTecnicoAsignado ? 'Confirmar reasignación' : 'Confirmar asignación'}</button></fieldset></form>}</section>;
}
