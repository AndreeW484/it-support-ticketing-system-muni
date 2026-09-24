import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { assignmentPayload, assignTicket, changeTicketPriority } from '../src/assignment.js';
const ticket = { numeroTicket: 'TIC-1', estado: 'CREADO', prioridad: 'MEDIA', idTecnicoAsignado: '' };
const technicians = [{ idTecnico: 'TEC-1', estado: 'ACTIVO' }, { idTecnico: 'TEC-2', estado: 'INACTIVO' }];
test('asignación exige ficha activa, ticket abierto y cambio de responsable', () => {
  assert.deepEqual(assignmentPayload(ticket, 'TEC-1', technicians, ' Visitar sede '), { numeroTicket: 'TIC-1', idTecnico: 'TEC-1', detalle: 'Visitar sede' });
  for (const estado of ['RESUELTO','CERRADO','CANCELADO']) assert.throws(() => assignmentPayload({ ...ticket, estado }, 'TEC-1', technicians), /abiertos/);
  assert.throws(() => assignmentPayload(ticket, 'TEC-2', technicians), /activo/);
  assert.throws(() => assignmentPayload({ ...ticket, idTecnicoAsignado: 'TEC-1' }, 'TEC-1', technicians), /ya tiene/);
});
test('asignación autenticada devuelve el ticket confirmado por servidor', async () => {
  const result = await assignTicket(async (action, data, token) => {
    assert.equal(action, 'assignTicket'); assert.equal(token, 'private'); assert.equal(data.prioridad, undefined);
    return { ...ticket, estado: 'ASIGNADO', idTecnicoAsignado: data.idTecnico };
  }, 'private', ticket, 'TEC-1', technicians);
  assert.equal(result.estado, 'ASIGNADO');
  await assert.rejects(assignTicket(async () => ({}), 'private', ticket, 'TEC-1', technicians), /confirmación/);
});
test('prioridad se cambia sin reasignar y rechaza valores inválidos o iguales', async () => {
  const result = await changeTicketPriority(async (action, data, token) => {
    assert.equal(action, 'changePriority'); assert.equal(token, 'private'); assert.equal(data.idTecnico, undefined); assert.equal(data.detalle, 'Urgente');
    return { ...ticket, prioridad: data.prioridad };
  }, 'private', ticket, 'CRITICA', ' Urgente ');
  assert.equal(result.prioridad, 'CRITICA');
  for (const value of ['MEDIA', 'INVALIDA']) await assert.rejects(changeTicketPriority(() => assert.fail('No enviar'), 'private', ticket, value));
});
function backend(estado = 'CREADO') {
  const c = vm.createContext({ console }); vm.runInContext(readFileSync(new URL('../backend/Code.gs', import.meta.url), 'utf8'), c);
  const row = { 'No. Ticket': 'TIC-1', Estado: estado, Prioridad: 'MEDIA', 'Técnico Asignado': '' }; const history = [];
  c.getAuthenticatedUser_ = () => ({ rol: 'ADMINISTRADOR', correo: 'admin@test', debeCambiarContrasena: false }); c.withScriptLock_ = fn => fn();
  c.findTicketByNumber_ = () => ({ rowNumber: 2, data: { ...row } }); c.findTechnicianById_ = () => ({ data: { Estado: 'ACTIVO' } });
  c.updateRecord_ = (_, __, fields) => Object.assign(row, fields); c.recordHistorySafely_ = event => history.push(event); c.getTechnicianNameMap_ = () => ({}); c.mapTicket_ = r => r;
  return { c, row, history };
}
test('backend asigna recibido, conserva etapa al reasignar y rechaza finalizados', () => {
  for (const estado of ['CREADO','ASIGNADO','EN PROCESO','PENDIENTE']) {
    const { c, row, history } = backend(estado);
    c.assignTicket_({ data: { numeroTicket: 'TIC-1', idTecnico: 'TEC-1' } });
    assert.equal(row.Estado, estado === 'CREADO' ? 'ASIGNADO' : estado);
    assert.equal(row['Técnico Asignado'], 'TEC-1'); assert.equal(history[0].eventType, 'ASIGNACION');
  }
  const { c } = backend('CERRADO'); assert.throws(() => c.assignTicket_({ data: { numeroTicket: 'TIC-1', idTecnico: 'TEC-1' } }), { code: 'INVALID_TICKET_STATE' });
});
test('backend registra cambio de prioridad y restringe ambas acciones a administradores', () => {
  const { c, row, history } = backend(); c.changePriority_({ data: { numeroTicket: 'TIC-1', prioridad: 'ALTA' } });
  assert.equal(row.Prioridad, 'ALTA'); assert.equal(history[0].eventType, 'CAMBIO_PRIORIDAD');
  c.getAuthenticatedUser_ = () => ({ rol: 'TECNICO', debeCambiarContrasena: false });
  for (const action of ['assignTicket','changePriority']) assert.throws(() => c.routePost_(action, { data: {} }), { code: 'FORBIDDEN' });
});
