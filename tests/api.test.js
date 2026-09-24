import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi, validatePassword } from '../src/api.js';
test('login envía el contrato de Apps Script como text/plain', async () => {
  const request = createApi('https://example.test/exec', async (url, options) => {
    assert.equal(options.headers['Content-Type'], 'text/plain;charset=utf-8');
    assert.deepEqual(JSON.parse(options.body), { action: 'login', data: { correo: 'test@example.test', contrasena: 'test' } });
    return { ok: true, json: async () => ({ success: true, data: { token: 'session' } }) };
  });
  assert.deepEqual(await request('login', { correo: 'test@example.test', contrasena: 'test' }), { token: 'session' });
});
test('token se envía únicamente en el cuerpo de las acciones protegidas', async () => {
  const request = createApi('https://example.test/exec', async (url, options) => {
    assert.equal(url, 'https://example.test/exec');
    assert.equal(JSON.parse(options.body).sessionToken, 'private-token');
    return { ok: true, json: async () => ({ success: true, data: {} }) };
  });
  await request('changePassword', { contrasenaActual: 'old', contrasenaNueva: 'NewPassword123' }, 'private-token');
});
test('un error lógico con HTTP 200 conserva mensaje y código', async () => {
  const request = createApi('url', async () => ({ ok: true, json: async () => ({ success: false, code: 'LOGIN_TEMPORARILY_LOCKED', message: 'Acceso bloqueado' }) }));
  await assert.rejects(request('login'), { code: 'LOGIN_TEMPORARILY_LOCKED', message: 'Acceso bloqueado' });
});
test('configuración faltante no genera solicitudes', async () => {
  await assert.rejects(createApi('', () => assert.fail('No debe conectar'))('login'), /configuración/);
});
test('errores de red y respuestas HTML se muestran de forma legible', async () => {
  await assert.rejects(createApi('url', async () => { throw new TypeError('Failed to fetch'); })('login'), /conectar/);
  await assert.rejects(createApi('url', async () => ({ ok: true, json: async () => { throw new SyntaxError(); } }))('login'), /respuesta no válida/);
});
test('contraseña temporal respeta las reglas del backend y la confirmación', () => {
  assert.ok(validatePassword('short', 'short'));
  assert.ok(validatePassword('alllowercase123', 'alllowercase123'));
  assert.ok(validatePassword('StrongPassword12', 'DifferentPassword12'));
  assert.equal(validatePassword('StrongPassword12', 'StrongPassword12'), '');
});
