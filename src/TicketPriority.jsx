import React, { useEffect, useRef, useState } from 'react';
import { Flag } from 'lucide-react';
import { PRIORITIES, changeTicketPriority } from './assignment.js';
export function TicketPriority({ api, token, ticket, disabled, onUpdated, onAuthError, onBusyChange }) {
  const [priority, setPriority] = useState(ticket.prioridad);
  const [detail, setDetail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  useEffect(() => { setPriority(ticket.prioridad); }, [ticket.prioridad]);
  async function submit(e) {
    e.preventDefault(); if (lock.current || disabled) return;
    lock.current = true; setSaving(true); onBusyChange(true); setError(''); setNotice('');
    try {
      const updated = await changeTicketPriority(api, token, ticket, priority, detail);
      onUpdated(updated); setDetail(''); setNotice('Prioridad actualizada correctamente.');
    } catch (e) { setError(e.message); onAuthError(e); }
    finally { lock.current = false; setSaving(false); onBusyChange(false); }
  }
  return <section className="assignment-panel"><h3><Flag size={18}/>Prioridad de atención</h3><p>Prioridad actual: <strong>{ticket.prioridad}</strong></p>{error && <div className="error" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}<form onSubmit={submit} aria-busy={saving}><fieldset disabled={disabled || saving}><label className="field">Nueva prioridad<select required value={priority} onChange={e => { setPriority(e.target.value); setNotice(''); }}>{PRIORITIES.map(value => <option key={value} value={value}>{value === 'CRITICA' ? 'Crítica' : value.charAt(0) + value.slice(1).toLowerCase()}</option>)}</select></label><label className="field">Motivo del cambio (opcional)<textarea rows={2} maxLength={1000} value={detail} onChange={e => setDetail(e.target.value)} placeholder="Indica el impacto o la urgencia de la solicitud"/></label><p className="assignment-note">El cambio quedará registrado en el historial del ticket.</p><button type="submit" className="primary" disabled={priority === ticket.prioridad}>{saving ? <><span className="spinner"/>Actualizando prioridad…</> : 'Guardar prioridad'}</button></fieldset></form></section>;
}
