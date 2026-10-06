import { AppError, hmac } from './core.js';
export function createDrive({ url, secret, fetcher = fetch }) {
  if (!url || !secret) return null;
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'script.google.com' || !endpoint.pathname.endsWith('/exec')) throw new Error('DRIVE_BRIDGE_URL no válida');
  return {
    async upload(files, ticketNumber, requestId) {
      const payload = JSON.stringify({ timestamp: Date.now(), requestId, ticketNumber, files });
      const signature = await hmac(payload, secret);
      let result;
      try {
        const response = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ payload, signature }), redirect: 'follow', signal: AbortSignal.timeout(65000) });
        if (!response.ok) throw new Error('Bridge unavailable');
        result = await response.json();
      } catch { throw new AppError('DRIVE_UPLOAD_FAILED', 'No se pudo confirmar la carga de fotos. El ticket no se guardó; puede haber archivos pendientes de limpieza en Drive.'); }
      if (!result.success || !Array.isArray(result.data) || result.data.length !== files.length || result.data.some(file => !file.id || !file.nombre || !/^https:\/\/drive\.google\.com\//.test(file.url))) throw new AppError('DRIVE_UPLOAD_FAILED', 'No se pudo confirmar la carga de fotos. El ticket no se guardó.');
      return result.data;
    },
  };
}
