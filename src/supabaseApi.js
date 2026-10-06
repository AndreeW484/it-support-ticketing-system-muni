export function createSupabaseApi(projectUrl, publicKey, fetcher = fetch) {
  return async (action, data = {}, sessionToken) => {
    if (!projectUrl || !publicKey) throw new Error('La conexión con Supabase está pendiente de configuración.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), action === 'createTicket' && data.adjuntos?.length ? 120000 : 30000);
    try {
      const response = await fetcher(`${projectUrl.replace(/\/$/, '')}/functions/v1/ticketing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: publicKey },
        credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal,
        body: JSON.stringify({ action, data, ...(sessionToken ? { sessionToken } : {}) }),
      });
      let result;
      try { result = await response.json(); } catch { throw new Error('El servicio devolvió una respuesta no válida. Revisa el despliegue de ticketing en Supabase.'); }
      if (!response.ok || result?.success !== true) {
        const error = new Error(result?.message || 'No se pudo completar la operación en Supabase.');
        error.code = result?.code;
        throw error;
      }
      return result.data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Se agotó el tiempo de espera. Si enviabas un ticket, confirma con informática antes de repetir para evitar duplicados.');
      if (error instanceof TypeError) throw new Error('No fue posible conectar con Supabase. Comprueba tu conexión.');
      throw error;
    } finally { clearTimeout(timer); }
  };
}
