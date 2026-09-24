import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { technicianTransitions, technicianPayload, canResolve, ownTickets } from '../src/technician.js';
test('flujo técnico permite iniciar, pausar y retomar, sin cierre ni cancelación', () => {
  assert.deepEqual(technicianTransitions('ASIGNADO'), ['EN PROCESO','PENDIENTE']);
  assert.deepEqual(technicianTransitions('EN PROCESO'), ['PENDIENTE']);
  assert.deepEqual(technicianTransitions('PENDIENTE'), ['EN PROCESO']);
  for (const s of ['CREADO','RESUELTO','CERRADO','CANCELADO']) assert.deepEqual(technicianTransitions(s), []);
  assert.equal(canResolve('ASIGNADO'), false); assert.equal(canResolve('EN PROCESO'), true);
  assert.throws(() => technicianPayload('changeStatus', { estado: 'EN PROCESO' }, { nuevoEstado: 'CERRADO' }));
  assert.throws(() => technicianPayload('assignTicket', {}, {}));
});
test('bandeja solo incluye id técnico propio y nunca expone todos por id vacío', () => {
  const rows = [{ idTecnicoAsignado: 'TEC-1' }, { idTecnicoAsignado: 'TEC-2' }, { idTecnicoAsignado: '' }];
  assert.equal(ownTickets(rows, 'TEC-1').length, 1); assert.deepEqual(ownTickets(rows, ''), []);
});
test('resolución requiere texto y no envía observaciones que reemplacen avances', () => {
  const t = { numeroTicket: 'TIC-1', estado: 'EN PROCESO' };
  assert.throws(() => technicianPayload('finishTicket', t, { resolucion: '  ' }));
  assert.throws(() => technicianPayload('addTicketComment', t, { comentario: '  ' }));
  assert.deepEqual(technicianPayload('finishTicket', t, { resolucion: ' Reparado ', observaciones: 'borrar' }), { numeroTicket: 'TIC-1', resolucion: 'Reparado' });
});
function backend() {
  const c = vm.createContext({ console }); vm.runInContext(readFileSync(new URL('../backend/Code.gs', import.meta.url), 'utf8'), c);
  const row = { 'No. Ticket': 'TIC-1', Estado: 'ASIGNADO', 'Técnico Asignado': 'TEC-1', Observaciones: 'Nota previa' };
  const events = [];
  c.getAuthenticatedUser_ = () => ({ rol: 'TECNICO', idTecnico: 'TEC-1', correo: 'tecnico@example.test', debeCambiarContrasena: false });
  c.withScriptLock_ = fn => fn(); c.findTicketByNumber_ = () => ({ rowNumber: 2, data: { ...row } });
  c.updateRecord_ = (_, __, fields) => Object.assign(row, fields); c.recordHistorySafely_ = event => events.push(event);
  c.getTechnicianNameMap_ = () => ({}); c.mapTicket_ = data => data; c.formatDateTime_ = () => '2026-09-24 10:00:00';
  return { c, row, events };
}
test('backend registra avance, pausa, reanudación y resolución conservando observaciones', () => {
  const { c, row, events } = backend();
  c.changeStatus_({ data: { numeroTicket: 'TIC-1', nuevoEstado: 'EN PROCESO' } });
  c.addTicketComment_({ data: { numeroTicket: 'TIC-1', comentario: 'Diagnóstico realizado' } });
  assert.match(row.Observaciones, /Nota previa/); assert.match(row.Observaciones, /tecnico@example.test: Diagnóstico realizado/);
  c.changeStatus_({ data: { numeroTicket: 'TIC-1', nuevoEstado: 'PENDIENTE' } });
  c.changeStatus_({ data: { numeroTicket: 'TIC-1', nuevoEstado: 'EN PROCESO' } });
  const before = row.Observaciones;
  c.finishTicket_({ data: { numeroTicket: 'TIC-1', resolucion: 'Equipo reparado' } });
  assert.equal(row.Estado, 'RESUELTO'); assert.equal(row.Resolución, 'Equipo reparado'); assert.equal(row.Observaciones, before);
  assert.equal(events.at(-1).eventType, 'RESOLUCION');
});
test('backend bloquea tickets ajenos, resolución prematura, cierre y cancelación de técnico', () => {
  const { c, row } = backend();
  assert.throws(() => c.finishTicket_({ data: { numeroTicket: 'TIC-1', resolucion: 'Solución' } }), { code: 'INVALID_TICKET_STATE' });
  for (const nuevoEstado of ['CERRADO','CANCELADO']) assert.throws(() => c.changeStatus_({ data: { numeroTicket: 'TIC-1', nuevoEstado } }), { code: 'FORBIDDEN' });
  row['Técnico Asignado'] = 'TEC-2';
  for (const [action, data] of [['getTicket', {}], ['getTicketHistory', {}], ['changeStatus', { nuevoEstado: 'EN PROCESO' }], ['addTicketComment', { comentario: 'Test' }], ['finishTicket', { resolucion: 'Solución' }]]) {
    assert.throws(() => c.routePost_(action, { numeroTicket: 'TIC-1', data: { numeroTicket: 'TIC-1', ...data } }), { code: 'FORBIDDEN' });
  }
});
test('getTickets aplica en servidor la ficha de sesión aunque se pida otra', () => {
  const { c } = backend();
  c.readRecords_ = () => [{ data: { 'Técnico Asignado': 'TEC-1', fechaCreacion: '2026-09-24' } }, { data: { 'Técnico Asignado': 'TEC-2', fechaCreacion: '2026-09-24' } }];
  const result = c.getTickets_({ idTecnico: 'TEC-2' });
  assert.equal(result.length, 1); assert.equal(result[0]['Técnico Asignado'], 'TEC-1');
});
