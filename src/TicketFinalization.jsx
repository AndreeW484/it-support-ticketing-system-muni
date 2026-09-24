import React, { useRef, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { OPEN_STATES } from './admin.js';
import { finalizeTicket } from './finalization.js';
export function TicketFinalization({ api, token, ticket, disabled, onUpdated, onAuthError, onBusyChange }) {
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const action = ticket.estado === 'RESUELTO' ? 'close' : OPEN_STATES.includes(ticket.estado) ? 'cancel' : null;
  async function submit(e) {
    e.preventDefault(); if (lock.current || disabled || !action) return;
    lock.current = true; setSaving(true); onBusyChange(true); setError(''); setNotice('');
    try {
      const updated = await finalizeTicket(api, token, ticket, action, note);
      onUpdated(updated); setConfirming(false); setNote('');
      setNotice(updated.estado === 'CERRADO' ? 'Ticket cerrado correctamente.' : 'Ticket cancelado. El motivo quedó registrado en el historial.');
    } catch (e) { setError(e.message); onAuthError(e); }
    finally { lock.current = false; setSaving(false); onBusyChange(false); }
  }
  return <section className="assignment-panel finalization-panel"><h3>{action === 'cancel' ? <XCircle size={18}/> : <CheckCircle2 size={18}/>}Finalización administrativa</h3>{notice && <div className="notice" role="status">{notice}</div>}{error && <div className="error" role="alert">{error}</div>}
    {!action ? <p>El ticket está {ticket.estado.toLowerCase()}. No hay acciones de cierre o cancelación disponibles.</p> : <><p>{action === 'close' ? 'La solución ya fue registrada. Puedes confirmar el cierre administrativo del ticket.' : 'Este ticket sigue abierto. Para cerrarlo, primero debe estar resuelto. Si la solicitud no procede, puedes cancelarla indicando el motivo.'}</p>
    {!confirming ? <button type="button" disabled={disabled} className={action === 'cancel' ? 'secondary cancel-ticket-button' : 'secondary'} onClick={() => { setConfirming(true); setError(''); }}>{action === 'close' ? 'Cerrar ticket' : 'Cancelar ticket'}</button> : <form onSubmit={submit} aria-busy={saving}><fieldset disabled={disabled || saving}><p className="finalization-confirm">{action === 'close' ? 'Confirma el cierre' : 'Confirma la cancelación'} de <strong>{ticket.numeroTicket}</strong>.</p><label className="field">{action === 'close' ? 'Nota de cierre (opcional)' : 'Motivo de cancelación *'}<textarea rows={3} required={action === 'cancel'} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} placeholder={action === 'close' ? 'Observación sobre la finalización del servicio' : 'Explica por qué se cancela esta solicitud'}/></label><p className="assignment-note">Se conservarán los datos del ticket y el cambio quedará registrado en su historial.</p><div className="finalization-actions"><button type="submit" className={action === 'cancel' ? 'primary cancel-ticket-button' : 'primary'}>{saving ? 'Guardando…' : action === 'close' ? 'Confirmar cierre' : 'Confirmar cancelación'}</button><button type="button" className="secondary" onClick={() => { setConfirming(false); setError(''); }}>Volver</button></div></fieldset></form>}</>}
  </section>;
}
