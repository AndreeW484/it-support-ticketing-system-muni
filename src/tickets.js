import { encodePhotos } from './photos.js';
export function ticketPayload(fields) {
  const data = {};
  for (const key of ['solicitante', 'sede', 'area', 'tipo', 'categoria', 'descripcion']) {
    data[key] = String(fields[key] || '').trim();
    if (!data[key]) throw new Error('Completa todos los campos obligatorios.');
  }
  if (data.descripcion.length < 10) throw new Error('Describe la solicitud con al menos 10 caracteres.');
  const correo = String(fields.correo || '').trim();
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new Error('Revisa el correo de contacto.');
  return { ...data, prioridad: 'MEDIA', observaciones: correo ? `Correo de contacto: ${correo}` : '', adjuntos: [] };
}
export async function sendPublicTicket(api, fields, photos = []) {
  const payload = ticketPayload(fields);
  payload.adjuntos = await encodePhotos(photos);
  return api('createTicket', payload);
}
