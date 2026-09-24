import React, { useEffect, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { validatePhotos } from './photos.js';
function PhotoPreview({ file, onRemove, disabled }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return <li className="photo-preview"><img src={url || undefined} alt={`Vista previa: ${file.name}`}/><div><span title={file.name}>{file.name}</span><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></div><button type="button" disabled={disabled} onClick={onRemove} aria-label={`Quitar ${file.name}`}><X size={16}/></button></li>;
}
export function PhotoAttachments({ files, onChange, disabled }) {
  const [error, setError] = useState('');
  function select(e) {
    const selected = Array.from(e.target.files || []);
    e.target.value = '';
    if (!selected.length) return;
    const next = [...files, ...selected];
    try { validatePhotos(next); onChange(next); setError(''); }
    catch (err) { setError(err.message); }
  }
  return <div className="photo-attachments"><label className="field" htmlFor="ticket-photos">Fotos de la solicitud (opcional)</label><div className="photo-picker"><ImagePlus size={21} aria-hidden="true"/><input id="ticket-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled || files.length >= 5} onChange={select} aria-describedby="photo-guidance"/></div><p id="photo-guidance" className="form-note">JPG, PNG o WebP · Hasta 5 fotos de 5 MB cada una. {files.length > 0 && `${files.length}/5 seleccionadas.`}</p>{error && <p className="photo-error" role="alert">{error}</p>}{files.length > 0 && <ul className="photo-list">{files.map((file,index) => <PhotoPreview key={`${file.name}-${file.lastModified}-${index}`} file={file} disabled={disabled} onRemove={() => { onChange(files.filter((_,i) => i !== index)); setError(''); }}/>)}</ul>}</div>;
}
