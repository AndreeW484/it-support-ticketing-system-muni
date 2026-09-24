import React, { useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Plus } from 'lucide-react';
import { TextField } from './Fields.jsx';
import { sendPublicTicket } from './tickets.js';
import { PhotoAttachments } from './PhotoAttachments.jsx';
import { SITES, AREAS, TICKET_TYPES, CATEGORY_GROUPS, CATEGORIES } from './ticketCatalogs.js';
export function PublicTicket({ api, onBusyChange, onTrack }) {
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const lock = useRef(false);
  async function submit(e) {
    e.preventDefault(); if (lock.current) return;
    const form = e.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    lock.current = true; setBusy(true); onBusyChange(true); setError('');
    try {
      const result = await sendPublicTicket(api, fields, photos);
      if (!result?.numeroTicket) throw new Error('No se recibió el número de ticket. Consulta con informática antes de repetir el envío.');
      form.reset(); setPhotos([]); setType(''); setCategory(''); setCreated({ ...result, solicitante: result.solicitante || fields.solicitante });
    } catch (e) { setError(e.code === 'ATTACHMENTS_DISABLED' ? 'El servicio todavía no tiene configurada la carpeta de adjuntos. Puedes quitar las fotos y enviar el ticket, o comunicarte con informática.' : e.message); }
    finally { lock.current = false; setBusy(false); onBusyChange(false); }
  }
  return <section className="login-content public-ticket" aria-label="Crear ticket sin iniciar sesión">
    {created ? <div className="ticket-success" role="status"><CheckCircle2 size={42}/><h2>Ticket registrado</h2><p>Conserva este número como referencia de tu solicitud.</p><strong className="ticket-number">{created.numeroTicket}</strong><span className="role-badge">{created.estado || 'CREADO'}</span><p>Informática revisará tu solicitud.</p><button className="secondary track-success-link" onClick={() => onTrack(created)}>Consultar el estado de este ticket</button><button className="primary" onClick={() => { setCreated(null); setError(''); }}><Plus size={18}/>Crear otro ticket</button></div>
    : <><p className="overline">MESA DE SERVICIO · INFORMÁTICA</p><h2>Crear ticket</h2><p className="subtitle">Solicita soporte a tus incovenientes relacionados a sistemas y equipo electrónico.</p>
    {error && <div className="error" role="alert">{error}</div>}
    <form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy}><div className="form-grid"><TextField label="Nombre completo *" name="solicitante" autoComplete="name"/><TextField label="Correo de contacto (opcional)" name="correo" type="email" autoComplete="email" required={false} placeholder="nombre@muniguate.com"/><label className="field">Sede o agencia *<select name="sede" required defaultValue=""><option value="" disabled>Selecciona tu sede</option>{SITES.map(site => <option key={site} value={site}>{site}</option>)}</select></label><label className="field">Área o departamento *<select name="area" required defaultValue=""><option value="" disabled>Selecciona tu área</option>{AREAS.map(area => <option key={area} value={area}>{area}</option>)}</select></label><label className="field">Tipo de atención *<select name="tipo" required value={type} onChange={e => setType(e.target.value)} aria-describedby={type ? 'ticket-type-hint' : undefined}><option value="" disabled>¿Qué necesitas?</option>{TICKET_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="field">Sistema o equipo afectado *<select name="categoria" required value={category} onChange={e => setCategory(e.target.value)} aria-describedby={category ? 'ticket-category-hint' : undefined}><option value="" disabled>Selecciona una categoría</option>{CATEGORY_GROUPS.map(group => <optgroup key={group.label} label={group.label}>{group.items.map(item => <option key={item.label} value={item.label}>{item.label}</option>)}</optgroup>)}</select></label></div>{(type || category) && <div className="catalog-guidance" aria-live="polite">{type && <p id="ticket-type-hint"><strong>Tipo de atención:</strong> {TICKET_TYPES.find(item => item.value === type)?.hint}</p>}{category && <p id="ticket-category-hint"><strong>Para esta categoría:</strong> {CATEGORIES.find(item => item.label === category)?.hint}</p>}</div>}<label className="field">Descripción detallada *<textarea name="descripcion" required minLength={10} maxLength={4000} rows={3} placeholder="Describe lo que necesitas, la ventanilla o ubicación y desde cuándo ocurre. Si seleccionaste Otro en área, indica el departamento."/></label><PhotoAttachments files={photos} onChange={setPhotos} disabled={busy}/><p className="form-note">* Campos obligatorios. Los datos se guardan únicamente en el ticket.</p><button className="primary" type="submit">{busy ? <><span className="spinner"/>Enviando ticket…</> : <>Enviar ticket<ArrowRight size={18}/></>}</button></fieldset></form></>}
  </section>;
}
