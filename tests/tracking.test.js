import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/api.js';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
test('consulta pública GET codifica número y nombre sin token ni cuerpo', async () => {
  const api = createApi('https://example.test/exec', async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('action'), 'trackTicket');
    assert.equal(parsed.searchParams.get('numeroTicket'), 'TIC-2026-0001');
    assert.equal(parsed.searchParams.get('solicitante'), 'José & María');
    assert.equal(parsed.searchParams.has('sessionToken'), false);
    assert.equal(options.body, undefined);
    assert.equal(options.method, 'GET');
    assert.equal(options.cache, 'no-store');
    return { ok: true, json: async () => ({ success: true, data: { numeroTicket: 'TIC-2026-0001', estado: 'PENDIENTE' } }) };
  });
  assert.equal((await api('trackTicket', { numeroTicket: ' tic-2026-0001 ', solicitante: ' José & María ' }, 'not-for-public-use')).estado, 'PENDIENTE');
});
test('errores del seguimiento conservan código para orientar al visitante', async () => {
  const api = createApi('https://example.test/exec', async () => ({ ok: true, json: async () => ({ success: false, code: 'TICKET_NOT_FOUND', message: 'No encontrado' }) }));
  await assert.rejects(api('trackTicket', { numeroTicket: 'TIC-000', solicitante: 'Persona' }), { code: 'TICKET_NOT_FOUND' });
});
test('contrato original exige solicitante coincidente y omite observaciones internas', () => {
  const c = vm.createContext({ console });
  vm.runInContext(readFileSync(new URL('../backend/Code.gs', import.meta.url), 'utf8'), c);
  c.findTicketByNumber_ = () => ({ data: { Solicitante: 'José Pérez' } });
  c.getTechnicianNameMap_ = () => ({});
  c.mapTicket_ = () => ({ numeroTicket: 'TIC-TEST', estado: 'RESUELTO', resolucion: 'Equipo reparado', observaciones: 'Solo personal', adjuntos: ['private'] });
  assert.throws(() => c.routeGet_('trackTicket', { numeroTicket: 'TIC-TEST' }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => c.routeGet_('trackTicket', { numeroTicket: 'TIC-TEST', solicitante: 'Otra persona' }), { code: 'TICKET_NOT_FOUND' });
  const result = c.routeGet_('trackTicket', { numeroTicket: 'TIC-TEST', solicitante: ' jose perez ' });
  assert.equal(result.resolucion, 'Equipo reparado');
  assert.equal(result.observaciones, undefined);
  assert.equal(result.adjuntos, undefined);
});
