import React, { useState } from 'react';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
export function PasswordField({ label = 'Contraseña', name = 'password', autoComplete = 'current-password' }) {
  const [visible, setVisible] = useState(false);
  return <label className="field">{label}<span className="input-wrap"><LockKeyhole size={18}/><input required maxLength={128} name={name} type={visible ? 'text' : 'password'} autoComplete={autoComplete} placeholder="Ingresa tu contraseña"/><button className="reveal" type="button" aria-label={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></label>;
}
export function TextField({ label, name, defaultValue = '', ...props }) {
  return <label className="field">{label}<span className="input-wrap"><input name={name} defaultValue={defaultValue} required maxLength={120} {...props}/></span></label>;
}
