import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, UserPlus, Users } from 'lucide-react';
import { PasswordField, TextField } from './Fields.jsx';
import { validatePassword } from './api.js';
import { userPayload } from './admin.js';
export function AdminUsers({ api, token, onAuthError, onBusyChange }) {
  const [users, setUsers] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [role, setRole] = useState('ADMINISTRADOR');
  const [technicianId, setTechnicianId] = useState('');
  const [email, setEmail] = useState('');
  const [showTechnician, setShowTechnician] = useState(false);
  const [revision, setRevision] = useState(0);
  const locked = useRef(false);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    Promise.all([api('getUsers', {}, token), api('getTechnicians', {}, token)]).then(([u,t]) => {
      if (!Array.isArray(u) || !Array.isArray(t)) throw new Error('La respuesta del directorio no es válida.');
      if (active) { setUsers(u); setTechnicians(t); setReady(true); }
    }).catch(e => { if (active) { setError(e.message); onAuthError(e); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, token, revision]);
  async function createUser(e) {
    e.preventDefault(); if (locked.current) return;
    const form = e.currentTarget; const fields = Object.fromEntries(new FormData(form));
    const message = validatePassword(fields.password, fields.confirmation);
    if (message) { setError(message); return; }
    let payload;
    try { payload = userPayload(fields); } catch (e) { setError(e.message); return; }
    if (users.some(u => u.correo.toLowerCase() === payload.correo)) { setError('Ya existe un usuario con ese correo.'); return; }
    locked.current = true; setSaving(true); onBusyChange(true); setError(''); setNotice('');
    try {
      const user = await api('createUser', payload, token);
      if (!user?.idUsuario) throw new Error('No se recibió la confirmación. Actualiza el directorio antes de repetir el registro.');
      setUsers(current => [...current, user]); form.reset(); setEmail(''); setRole('ADMINISTRADOR'); setTechnicianId('');
      setNotice(`Usuario ${user.correo} registrado. Comparte la contraseña temporal por el canal interno autorizado; deberá cambiarla al ingresar. No se envió un correo automático.`);
    } catch (e) { setError(e.message); onAuthError(e); }
    finally { locked.current = false; setSaving(false); onBusyChange(false); }
  }
  async function createTechnician(e) {
    e.preventDefault(); if (locked.current) return;
    const form = e.currentTarget; const fields = Object.fromEntries(new FormData(form));
    locked.current = true; setSaving(true); onBusyChange(true); setError(''); setNotice('');
    try {
      const technician = await api('createTechnician', fields, token);
      if (!technician?.idTecnico) throw new Error('No se recibió la confirmación. Actualiza el directorio antes de repetir el registro.');
      setTechnicians(current => [...current, technician]); setRole('TECNICO'); setTechnicianId(technician.idTecnico); setEmail(technician.correo); form.reset(); setShowTechnician(false);
      setNotice('Ficha técnica registrada. Completa la contraseña temporal y registra el usuario para habilitar su acceso.');
    } catch (e) { setError(e.message); onAuthError(e); }
    finally { locked.current = false; setSaving(false); onBusyChange(false); }
  }
  return <div className="admin-users"><div className="admin-section-heading"><div><h3>Usuarios y accesos</h3><p>Administradores y técnicos del equipo de informática.</p></div><button className="secondary" disabled={loading || saving} onClick={() => setRevision(v => v+1)}><RefreshCw size={15}/>Actualizar</button></div>{error && <div className="error" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}{loading && <p className="admin-loading" role="status">Cargando directorio…</p>}
    <div className="users-layout"><section className="admin-card"><h3><UserPlus size={19}/>Registrar usuario</h3><form onSubmit={createUser}><fieldset disabled={saving || loading || !ready}><label className="field">Rol<select name="rol" value={role} onChange={e => { setRole(e.target.value); setTechnicianId(''); setEmail(''); }}><option value="ADMINISTRADOR">Administrador</option><option value="TECNICO">Técnico</option></select></label>{role === 'TECNICO' && <><label className="field">Ficha técnica activa<select required name="idTecnico" value={technicianId} onChange={e => { setTechnicianId(e.target.value); setEmail(technicians.find(t => t.idTecnico === e.target.value)?.correo || ''); }}><option value="">Selecciona un técnico</option>{technicians.filter(t => t.estado === 'ACTIVO').map(t => <option key={t.idTecnico} value={t.idTecnico}>{t.nombreCompleto} · {t.idTecnico}</option>)}</select></label><button className="text-button technician-toggle" type="button" onClick={() => setShowTechnician(!showTechnician)}>{showTechnician ? 'Ocultar ficha nueva' : '+ Registrar una ficha técnica'}</button></>}
    <label className="field">Correo de acceso<span className="input-wrap"><input name="correo" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" placeholder="nombre@muniguate.com"/></span></label><PasswordField label="Contraseña temporal" autoComplete="new-password"/><PasswordField label="Confirmar contraseña temporal" name="confirmation" autoComplete="new-password"/><p className="password-hint">Mínimo 10 caracteres, mayúscula, minúscula y número. El cambio será obligatorio al primer ingreso.</p><button className="primary" type="submit">{saving ? 'Guardando…' : 'Registrar usuario'}</button></fieldset></form>
    {showTechnician && role === 'TECNICO' && <form className="technician-form" onSubmit={createTechnician}><fieldset disabled={saving || loading}><h4>Nueva ficha técnica</h4><TextField label="Nombre completo" name="nombreCompleto"/><TextField label="Correo del técnico" name="correo" type="email"/><TextField label="Teléfono (opcional)" name="telefono" type="tel" required={false}/><TextField label="Especialidad (opcional)" name="especialidad" required={false}/><button className="secondary" type="submit">{saving ? 'Guardando…' : 'Guardar ficha técnica'}</button></fieldset></form>}</section>
    <section className="admin-card"><h3><Users size={19}/>Directorio <span className="count-label">{ready ? users.length : '—'}</span></h3>{ready && !users.length && <p className="admin-empty">No hay usuarios registrados.</p>}<div className="admin-table-scroll"><table className="admin-table"><caption className="sr-only">Usuarios registrados</caption><thead><tr><th>Usuario</th><th>Rol / técnico</th><th>Estado</th></tr></thead><tbody>{users.map(u => <tr key={u.idUsuario}><td><strong>{u.correo}</strong><small>{u.idUsuario}</small>{u.debeCambiarContrasena && <small className="temporary-note">Cambio de contraseña pendiente</small>}</td><td>{u.rol === 'ADMINISTRADOR' ? 'Administrador' : 'Técnico'}{u.idTecnico && <small>{technicians.find(t => t.idTecnico === u.idTecnico)?.nombreCompleto || u.idTecnico}</small>}</td><td><span className="status-pill" data-status={u.estado === 'ACTIVO' ? 'RESUELTO' : 'CANCELADO'}>{u.estado}</span></td></tr>)}</tbody></table></div></section></div></div>;
}
