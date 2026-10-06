import { AppError } from './core.js';
const MAX_BODY = 36 * 1024 * 1024;
async function readBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw new AppError('REQUEST_TOO_LARGE', 'La solicitud supera el tamaño permitido.');
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('VALIDATION_ERROR', 'Falta el cuerpo de la solicitud.');
  const chunks = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY) { await reader.cancel(); throw new AppError('REQUEST_TOO_LARGE', 'La solicitud supera el tamaño permitido.'); }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(body)); } catch { throw new AppError('VALIDATION_ERROR', 'El cuerpo JSON no es válido.'); }
}
export function createHandler({ execute, allowedOrigins, rateLimit = async (_request, _action) => true }) {
  const origins = new Set(allowedOrigins);
  return async request => {
    const origin = request.headers.get('origin');
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'apikey, content-type, authorization, x-client-info' };
    if (origin && origins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !origins.has(origin)) return reply({ success: false, code: 'FORBIDDEN', message: 'Origen no permitido.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ success: false, code: 'METHOD_NOT_ALLOWED', message: 'Utiliza POST.' }, 405);
    try {
      const payload = await readBody(request);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.action !== 'string') throw new AppError('VALIDATION_ERROR', 'Solicitud no válida.');
      if (!await rateLimit(request, payload.action)) return reply({ success: false, code: 'RATE_LIMITED', message: 'Se alcanzó el límite de solicitudes. Intenta más tarde.' }, 429);
      return reply({ success: true, data: await execute(payload) });
    } catch (error) {
      if (error instanceof AppError) return reply({ success: false, code: error.code, message: error.message });
      if (error?.code === '23505') return reply({ success: false, code: 'DUPLICATE_RECORD', message: 'Ya existe un registro con ese correo o identificador.' });
      // No devolver mensajes de Postgres, credenciales o registros al navegador/logs.
      return reply({ success: false, code: 'SERVICE_ERROR', message: 'No se pudo completar la operación. Si estabas enviando un ticket, confirma con informática antes de repetir.' }, 500);
    }
  };
}
