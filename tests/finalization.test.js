import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { finalizationRequest, finalizeTicket } from '../src/finalization.js';
test('cierre usa changeStatus exclusivamente para resueltos', () => {
  assert.deepEqual(finalizationRequest({ numeroTicket: 'TIC-1', estado: 'RESUELTO' }, 'close', ' Revisado '), { action: 'changeStatus', data: { numeroTicket: 'TIC-1', nuevoEstado: 'CERRADO', detalle: 'Revisado' }, expected: 'CERRADO' });
  for (const estado of ['CREADO','ASIGNADO','EN PROCESO','PENDIENTE','CERRADO','CANCELADO']) assert.throws(() => finalizationRequest({ estado }, 'close'), /resueltos/);
});
test('cancelación exige motivo y ticket abierto sin sustituir observaciones', () => {
  for (const estado of ['CREADO','ASIGNADO','EN PROCESO','PENDIENTE']) {
    const r = finalizationRequest({ numeroTicket: 'TIC-1', estado }, 'cancel', ' Duplicado ');
    assert.equal(r.action, 'cancelTicket'); assert.equal(r.data.motivo, 'Duplicado'); assert.equal(r.data.observaciones, undefined);
  }
  assert.throws(() => finalizationRequest({ estado: 'ASIGNADO' }, 'cancel', ' '), /motivo/);
  for (const estado of ['RESUELTO','CERRADO','CANCELADO']) assert.throws(() => finalizationRequest({ estado }, 'cancel', 'Motivo'), /abiertos/);
});
test('guardado autenticado valida confirmación del servidor', async () => {
  const t = { numeroTicket: 'TIC-1', estado: 'RESUELTO' };
  const result = await finalizeTicket(async (action,data,token) => { assert.equal(action,'changeStatus'); assert.equal(token,'private'); return { ...t, estado: data.nuevoEstado }; }, 'private',t,'close','');
  assert.equal(result.estado,'CERRADO');
  await assert.rejects(finalizeTicket(async () => t,'private',t,'close',''), /confirmación/);
});
function backend(estado) {
  const c = vm.createContext({ console }); vm.runInContext(readFileSync(new URL('../backend/Code.gs', import.meta.url),'utf8'),c);
  const row = { Estado: estado, Observaciones: 'Información previa', Resolución: 'Reparado' }; const events=[];
  c.getAuthenticatedUser_ = () => ({ rol:'ADMINISTRADOR',correo:'admin@test',debeCambiarContrasena:false });
  c.withScriptLock_ = fn => fn(); c.findTicketByNumber_ = () => ({rowNumber:2,data:{...row}});
  c.updateRecord_ = (_,__,fields) => Object.assign(row,fields); c.recordHistorySafely_ = e => events.push(e); c.getTechnicianNameMap_ = () => ({}); c.mapTicket_ = v => v;
  return {c,row,events};
}
test('backend cierra resueltos y registra cancelación sin borrar datos', () => {
  const close=backend('RESUELTO'); close.c.changeStatus_({data:{numeroTicket:'TIC-1',nuevoEstado:'CERRADO'}});
  assert.equal(close.row.Estado,'CERRADO'); assert.equal(close.row.Resolución,'Reparado'); assert.equal(close.events[0].newValue,'CERRADO');
  const cancel=backend('ASIGNADO'); cancel.c.cancelTicket_({data:{numeroTicket:'TIC-1',motivo:'Solicitud duplicada'}});
  assert.equal(cancel.row.Estado,'CANCELADO'); assert.equal(cancel.row.Observaciones,'Información previa'); assert.equal(cancel.events[0].detail,'Solicitud duplicada');
});
test('backend impide cancelar finalizados y técnicos no pueden cerrar ni cancelar', () => {
  for(const state of ['RESUELTO','CERRADO','CANCELADO']) assert.throws(() => backend(state).c.cancelTicket_({data:{numeroTicket:'TIC-1',motivo:'Motivo'}}),{code:'INVALID_TICKET_STATE'});
  const {c}=backend('RESUELTO'); c.getAuthenticatedUser_ = () => ({rol:'TECNICO',idTecnico:'TEC-1',debeCambiarContrasena:false}); c.assertTicketAccess_ = () => {};
  assert.throws(() => c.cancelTicket_({data:{numeroTicket:'TIC-1',motivo:'Motivo'}}),{code:'FORBIDDEN'});
  assert.throws(() => c.changeStatus_({data:{numeroTicket:'TIC-1',nuevoEstado:'CERRADO'}}),{code:'FORBIDDEN'});
});
