export function createApi(url, fetcher = fetch) {
  return async function request(action, data = {}, sessionToken) {
    if (!url) throw new Error('La conexión está pendiente de configuración. Solicita al administrador que configure la URL del servicio.');
    const controller = new AbortController();
    const timeout = action === 'createTicket' && data.adjuntos?.length ? 120000 : 30000;
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      let endpoint = url;
      const options = { signal: controller.signal, redirect: 'follow', credentials: 'omit' };
      if (action === 'trackTicket') {
        const query = new URL(url);
        query.searchParams.set('action', action);
        query.searchParams.set('numeroTicket', String(data.numeroTicket || '').trim().toUpperCase());
        query.searchParams.set('solicitante', String(data.solicitante || '').trim());
        endpoint = query.toString();
        options.method = 'GET';
        options.cache = 'no-store';
        options.referrerPolicy = 'no-referrer';
      } else {
        options.method = 'POST';
        options.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
        options.body = JSON.stringify({ action, data, ...(sessionToken ? { sessionToken } : {}) });
      }
      const response = await fetcher(endpoint, options);
      if (!response.ok) throw new Error('El servicio no está disponible. Intenta nuevamente.');
      let result;
      try { result = await response.json(); } catch { throw new Error('El servicio devolvió una respuesta no válida. Revisa la implementación de Apps Script.'); }
      if (!result.success) {
        const error = new Error(result.message || 'No se pudo completar la solicitud.');
        error.code = result.code;
        throw error;
      }
      return result.data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('La solicitud tardó demasiado. Comprueba tu conexión e intenta nuevamente.');
      if (error instanceof TypeError) throw new Error('No fue posible conectar con el servicio. Comprueba tu conexión o comunícate con el administrador.');
      throw error;
    } finally { clearTimeout(timer); }
  };
}
export function validatePassword(password, confirmation) {
  if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) return 'Incluye al menos 10 caracteres, una mayúscula, una minúscula y un número.';
  if (password !== confirmation) return 'Las contraseñas nuevas no coinciden.';
  return '';
}
