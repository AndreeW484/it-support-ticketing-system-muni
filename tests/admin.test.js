import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { STATES, summarizeTickets, filterTickets, userPayload, safeAttachmentUrl } from '../src/admin.js';
const tickets = STATES.map((estado,i) => ({ numeroTicket: `TIC-${i}`, estado, prioridad: i < 2 ? 'CRITICA' : 'MEDIA', solicitante: i === 0 ? 'José Pérez' : 'Persona', sede: 'Central', nombreTecnicoAsignado: 'María López' }));
test('resumen distingue cuatro etapas abiertas, finalizados y cancelados', () => {
  const s = summarizeTickets(tickets);
  assert.equal(s.total, 7); assert.equal(s.open, 4); assert.equal(s.finished, 2); assert.equal(s.cancelled, 1); assert.equal(s.urgent, 2);
  assert.equal(s.open + s.finished + s.cancelled, s.total);
  assert.equal(summarizeTickets([]).total, 0);
  assert.equal(summarizeTickets([{ estado: 'CERRADO', prioridad: 'CRITICA' }]).urgent, 0);
});
test('búsqueda ignora acentos y combina estado y prioridad', () => {
  assert.equal(filterTickets(tickets, { search: 'jose', status: 'ABIERTOS', priority: 'CRITICA' }).length, 1);
  assert.equal(filterTickets(tickets, { search: 'maria lopez', status: 'FINALIZADOS' }).length, 2);
  assert.equal(filterTickets(tickets, { status: 'CANCELADO' }).length, 1);
  assert.equal(filterTickets(tickets, { status: 'FINALIZADOS', priority: 'CRITICA' }).length, 0);
});
test('usuario técnico exige ficha; administrador no envía ficha accidental', () => {
  assert.throws(() => userPayload({ rol: 'TECNICO', correo: 'x@example.test' }), /ficha/);
  assert.throws(() => userPayload({ rol: 'SOLICITANTE' }), /rol/);
  assert.deepEqual(userPayload({ rol: 'ADMINISTRADOR', correo: ' ADMIN@example.test ', password: 'Temporary123', idTecnico: 'TEC-1' }), { rol: 'ADMINISTRADOR', correo: 'admin@example.test', contrasenaTemporal: 'Temporary123', idTecnico: '' });
  assert.equal(userPayload({ rol: 'TECNICO', correo: 'x@example.test', idTecnico: 'TEC-1', password: 'Temporary123' }).idTecnico, 'TEC-1');
});
test('enlaces de adjuntos bloquean scripts y protocolos inseguros', () => {
  assert.equal(safeAttachmentUrl('javascript:alert(1)'), null);
  assert.equal(safeAttachmentUrl('data:text/html,x'), null);
  assert.equal(safeAttachmentUrl('https://drive.google.com/file/d/test/view'), 'https://drive.google.com/file/d/test/view');
});
function backend() {
  const c = vm.createContext({ console });
  vm.runInContext(readFileSync(new URL('../backend/Code.gs', import.meta.url), 'utf8'), c);
  return c;
}
test('backend mantiene directorio y creación de usuarios reservados a administradores', () => {
  const c = backend();
  c.getAuthenticatedUser_ = () => ({ rol: 'TECNICO', debeCambiarContrasena: false });
  for (const action of ['getUsers','getTechnicians','createUser','createTechnician']) assert.throws(() => c.routePost_(action, { data: {} }), { code: 'FORBIDDEN' });
  c.getAuthenticatedUser_ = () => ({ rol: 'ADMINISTRADOR', debeCambiarContrasena: true });
  assert.throws(() => c.routePost_('getUsers', { data: {} }), { code: 'PASSWORD_CHANGE_REQUIRED' });
});
test('backend crea técnico vinculado con cambio de contraseña obligatorio y sin texto plano', () => {
  const c = backend(); let row;
  c.getAuthenticatedUser_ = () => ({ rol: 'ADMINISTRADOR', debeCambiarContrasena: false });
  c.findTechnicianById_ = () => ({ data: { Estado: 'ACTIVO' } });
  c.withScriptLock_ = fn => fn(); c.assertUniqueUserEmail_ = () => {};
  c.generateSequentialId_ = () => 'USR-TEST'; c.createRandomSecret_ = () => 'salt'; c.hashPassword_ = () => 'hash-only';
  c.appendRecord_ = (_, value) => { row = value; }; c.findUserById_ = () => ({ data: row });
  const result = c.routePost_('createUser', { data: userPayload({ correo: 'tech@example.test', rol: 'TECNICO', idTecnico: 'TEC-1', password: 'Temporary123' }) });
  assert.equal(result.idTecnico, 'TEC-1'); assert.equal(result.debeCambiarContrasena, true);
  assert.equal(row['Hash Contraseña'], 'hash-only'); assert.equal(JSON.stringify(row).includes('Temporary123'), false);
  c.findTechnicianById_ = () => ({ data: { Estado: 'INACTIVO' } });
  assert.throws(() => c.routePost_('createUser', { data: userPayload({ correo: 'tech@example.test', rol: 'TECNICO', idTecnico: 'TEC-1', password: 'Temporary123' }) }), { code: 'TECHNICIAN_INACTIVE' });
});
