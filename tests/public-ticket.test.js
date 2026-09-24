import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createApi } from '../src/api.js';
import { ticketPayload, sendPublicTicket } from '../src/tickets.js';
const fields = { solicitante: 'Persona de prueba', correo: 'persona@muniguate.com', sede: 'Central', area: 'Oficina', tipo: 'INCIDENTE', categoria: 'Red e internet', descripcion: 'No hay conexión desde esta mañana.' };
test('ticket público usa el endpoint original sin token ni datos de cuenta', async () => {
  const api = createApi('https://example.test/exec', async (_, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.action, 'createTicket');
    assert.equal(body.sessionToken, undefined);
    assert.equal(body.data.solicitante, fields.solicitante);
    assert.equal(body.data.observaciones, 'Correo de contacto: persona@muniguate.com');
    assert.equal(body.data.rol, undefined);
    assert.equal(body.data.contrasena, undefined);
    return { ok: true, json: async () => ({ success: true, data: { numeroTicket: 'TIC-2026-0001' } }) };
  });
  assert.equal((await sendPublicTicket(api, { ...fields, rol: 'ADMINISTRADOR', contrasena: 'ignored' })).numeroTicket, 'TIC-2026-0001');
});
test('campos obligatorios se validan antes de conectar y correo es opcional', async () => {
  await assert.rejects(sendPublicTicket(() => assert.fail('No conectar'), { ...fields, sede: ' ' }), /obligatorios/);
  assert.equal(ticketPayload({ ...fields, correo: '' }).observaciones, '');
  assert.throws(() => ticketPayload({ ...fields, correo: 'incorrecto' }), /correo/);
});
test('backend original permite crear ticket público pero exige sesión para consultas internas', () => {
  const c = vm.createContext({ console });
  vm.runInContext(readFileSync(new URL('../backend/Code.gs', import.meta.url), 'utf8'), c);
  c.createTicket_ = data => ({ numeroTicket: 'TIC-TEST', solicitante: data.solicitante });
  assert.equal(c.routePost_('createTicket', { data: ticketPayload(fields) }).solicitante, fields.solicitante);
  assert.throws(() => c.routePost_('getTickets', { data: {} }), { code: 'UNAUTHENTICATED' });
  assert.throws(() => c.routePost_('registerRequester', { data: fields }), { code: 'INVALID_ACTION' });
  assert.equal(c.ROLES.includes('SOLICITANTE'), false);
});
