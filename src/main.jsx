import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, ArrowUpRight, Mail, ShieldCheck, Headset, Check, LogOut, KeyRound, X } from 'lucide-react';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import './styles.css';
import { createApi, validatePassword } from './api.js';
import { createSupabaseApi } from './supabaseApi.js';
import { PasswordField } from './Fields.jsx';
import { PublicTicket } from './PublicTicket.jsx';
import { TrackTicket } from './TrackTicket.jsx';
import { AdminDashboard } from './AdminDashboard.jsx';
import { TechnicianDashboard } from './TechnicianDashboard.jsx';


// Activar después de desplegar. Nunca reintentar en Sheets si Supabase falla.
const api = import.meta.env.VITE_BACKEND === 'supabase'
  ? createSupabaseApi(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
  : createApi(import.meta.env.VITE_APPS_SCRIPT_URL);
const invalidSessionCodes = ['INVALID_SESSION', 'SESSION_EXPIRED', 'UNAUTHENTICATED', 'USER_INACTIVE'];
function App() {
  const [session, setSession] = useState(null);
  const [page, setPage] = useState('ticket');
  const [trackingInitial, setTrackingInitial] = useState({});
  const [ticketBusy, setTicketBusy] = useState(false);


  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [help, setHelp] = useState(false);
  const [change, setChange] = useState(false);
  const heading = useRef(null);
  const dialog = useRef(null);
  const changing = !!session && (session.usuario.debeCambiarContrasena || change);
  useEffect(() => { heading.current?.focus(); }, [session, changing]);
  useEffect(() => { if (help) dialog.current?.showModal(); else dialog.current?.close(); }, [help]);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    const form = event.currentTarget;
    const fields = new FormData(form);
    if (changing) {
      const message = validatePassword(fields.get('newPassword'), fields.get('confirmation'));
      if (message) { setError(message); return; }
    }
    setBusy(true);
    try {
      const result = changing
        ? await api('changePassword', { contrasenaActual: fields.get('password'), contrasenaNueva: fields.get('newPassword') }, session.token)
        : await api('login', { correo: fields.get('email').trim().toLowerCase(), contrasena: fields.get('password') });
      if (!result?.token || !result?.usuario) throw new Error('La respuesta de autenticación está incompleta. Contacta al administrador.');
      form.reset(); setSession(result); setChange(false);
    } catch (e) {
      setError(e.message);
      if (invalidSessionCodes.includes(e.code)) { setSession(null); setChange(false); }
    } finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError('');
    try { await api('logout', {}, session.token); setSession(null); setChange(false); }
    catch (e) { setError(e.message); if (invalidSessionCodes.includes(e.code)) { setSession(null); setChange(false); } }
    finally { setBusy(false); }
  }
  const showAdmin = page === 'login' && session?.usuario.rol === 'ADMINISTRADOR' && !changing;
  const showTechnician = page === 'login' && session?.usuario.rol === 'TECNICO' && !changing;
  const showWorkspace = showAdmin || showTechnician;
  function handleAdminError(e) {
    if (invalidSessionCodes.includes(e.code)) { setSession(null); setChange(false); setError(e.message); }
    else if (e.code === 'PASSWORD_CHANGE_REQUIRED') { setChange(true); setError(e.message); }
    else if (e.code === 'FORBIDDEN') { setSession(null); setError('Tu cuenta ya no tiene acceso a esta sección. Inicia sesión nuevamente.'); }
  }
  return <div className="shell">
    <main className="access"><header className="access-header"><span className="portal-tag">SOPORTE DE TI</span><nav className="access-nav" aria-label="Navegación principal">{[['ticket', 'Crear ticket'], ['track', 'Consultar mi ticket'], ['login', session?.usuario.rol === 'ADMINISTRADOR' ? 'Panel administrativo' : session?.usuario.rol === 'TECNICO' ? 'Mis tickets' : 'Acceso de informática']].map(([destination, label]) => <button key={destination} className="help-link" aria-current={page === destination ? 'page' : undefined} disabled={busy || ticketBusy} onClick={() => { setPage(destination); setError(''); }}>{label}</button>)}{page === 'login' && <button className="help-link" onClick={() => setHelp(true)}>Ayuda</button>}</nav></header>
    <div className={showWorkspace ? 'admin-layout' : `auth-layout ${page !== 'login' ? 'public-layout' : ''}`}>
    {!showWorkspace && <aside className="auth-brand" aria-label="Municipalidad de Guatemala"><img className="municipal-logo" src="/muniguate-transparente.png" alt="Muni Guate — Municipalidad de Guatemala" width="1622" height="969"/><span className="brand-caption">MUNICIPALIDAD DE GUATEMALA</span><span className="brand-service">Soporte de TI</span></aside>}
    <div className="public-view" hidden={page !== 'ticket'}><PublicTicket api={api} onBusyChange={setTicketBusy} onTrack={ticket => { setTrackingInitial({ numeroTicket: ticket.numeroTicket, solicitante: ticket.solicitante }); setPage('track'); }}/></div>
    {page === 'track' && <TrackTicket api={api} initial={trackingInitial}/>}
    {showAdmin && <AdminDashboard api={api} session={session} busy={busy} error={error} onBusyChange={setBusy} onAuthError={handleAdminError} onLogout={logout} onChangePassword={() => { setChange(true); setError(''); }}/>}
    {showTechnician && <TechnicianDashboard api={api} session={session} busy={busy} error={error} onBusyChange={setBusy} onAuthError={handleAdminError} onLogout={logout} onChangePassword={() => { setChange(true); setError(''); }}/>}
    {page === 'login' && !showWorkspace && <section className="login-content" aria-label="Acceso de informática">
      <p className="overline">MESA DE SERVICIO · INFORMÁTICA</p>
      <h2 ref={heading} tabIndex={-1}>{changing ? 'Actualizar contraseña' : session ? 'Sesión iniciada' : 'Acceso de informática'}</h2>
      <p className="subtitle">{changing ? 'Actualiza tu contraseña para continuar.' : session ? 'La cuenta institucional se autenticó correctamente.' : 'Ingreso exclusivo para técnicos y administradores.'}</p>
      {error && <div className="error" role="alert">{error}</div>}
      {(!session || changing) ? <form onSubmit={submit} aria-busy={busy} key={changing ? 'change' : 'login'}><fieldset disabled={busy}>
        {!changing && <label className="field">Correo institucional<span className="input-wrap"><Mail size={18}/><input name="email" type="email" autoComplete="username" required placeholder="nombre@muniguate.com" spellCheck="false" autoCapitalize="none"/></span></label>}
        <PasswordField label={changing ? 'Contraseña actual' : 'Contraseña'}/>
        {changing ? <><PasswordField label="Nueva contraseña" name="newPassword" autoComplete="new-password"/><p className="password-hint">Mínimo 10 caracteres, una mayúscula, una minúscula y un número.</p><PasswordField label="Confirma tu nueva contraseña" name="confirmation" autoComplete="new-password"/></> : <div className="form-options"><button type="button" className="text-button" onClick={() => setHelp(true)}>¿Olvidaste tu contraseña?</button></div>}
        <button className="primary" type="submit">{busy ? <><span className="spinner"/> {changing ? 'Actualizando…' : 'Verificando acceso…'}</> : <>{changing ? 'Actualizar contraseña' : 'Iniciar sesión'} <ArrowRight size={19}/></>}</button>
      </fieldset></form> : <div className="account"><div className="account-label">SESIÓN INICIADA</div><strong>{session.usuario.correo}</strong><span className="role">{session.usuario.rol === 'ADMINISTRADOR' ? 'Administrador' : 'Técnico'}</span><p>Tu sesión está activa.</p><button className="secondary" disabled={busy} onClick={() => { setChange(true); setError(''); }}><KeyRound size={17}/> Cambiar contraseña</button></div>}
      {session && <button className="logout" disabled={busy} onClick={logout}><LogOut size={16}/>{busy ? 'Procesando…' : 'Cerrar sesión'}</button>}
      {!session && <div className="restricted"><ShieldCheck size={20}/><p>Uso interno municipal</p></div>}
    </section>}</div><footer className="access-footer"><span>© {new Date().getFullYear()} Municipalidad de Guatemala</span><span>Soporte TI <span className="footer-dot">•</span> v0.1</span></footer></main>
    <dialog aria-labelledby="access-help-title" ref={dialog} onCancel={() => setHelp(false)} onClick={e => { if (e.target === dialog.current) setHelp(false); }}><button className="close" aria-label="Cerrar ayuda" onClick={() => setHelp(false)}><X/></button><div className="section-icon"><Headset/></div><h2 id="access-help-title">Asistencia de acceso</h2><p>Si olvidaste tu contraseña o necesitas acceso, comunícate con el administrador de informática por los canales internos de tu dependencia.</p><p>El restablecimiento de contraseñas se gestiona con el administrador. Si recibes una contraseña temporal, deberás actualizarla al iniciar sesión.</p><button className="primary" onClick={() => setHelp(false)}>Entendido <Check size={18}/></button></dialog>
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
