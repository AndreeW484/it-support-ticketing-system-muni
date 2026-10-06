import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createBackend, hmac, validateAttachments } from '../supabase/functions/ticketing/core.js';
import { createRepository } from '../supabase/functions/ticketing/repository.js';
import { createHandler } from '../supabase/functions/ticketing/http.js';
import { createSupabaseApi } from '../src/supabaseApi.js';

const pepper = 'test-pepper-never-production';
const password = 'PasswordTest123';
const stamp = new Date('2026-10-06T18:00:00Z');
const publicData = { solicitante: 'María Pérez', sede: 'Central', area: 'ATV', tipo: 'INCIDENTE', categoria: 'Computadoras', descripcion: 'La computadora no enciende', observaciones: 'Correo de contacto: prueba@example.test' };
test('Supabase: integración con PostgreSQL local y esquema importado', async suite => {
  const pg = new PGlite();
  try {
    await pg.exec('create role anon; create role authenticated;');
    await pg.exec(await readFile(new URL('../backend/supabase/existing-schema.sql', import.meta.url), 'utf8'));
    await pg.exec(await readFile(new URL('../supabase/migrations/202610060001_ticketing_security.sql', import.meta.url), 'utf8'));
    const repo = createRepository({ begin: callback => pg.transaction(tx => callback({ unsafe: async (sql, params = []) => (await tx.query(sql, params)).rows })) });
    const execute = createBackend({ repo, pepper, now: () => stamp });
    const reset = async () => {
      await pg.exec('truncate usuarios, tecnicos, tickets, historial_tickets restart identity cascade;');
      await pg.query("insert into tecnicos (id_tecnico,nombre_completo,correo_electronico) values ('TEC-0001','Técnico Uno','uno@example.test'),('TEC-0002','Técnico Dos','dos@example.test')");
      for (const [id, role, tech, token] of [['USR-0001','ADMINISTRADOR',null,'admin-token'],['USR-0002','TECNICO','TEC-0001','tech-token'],['USR-0003','TECNICO',null,'empty-token']]) {
        await pg.query('insert into usuarios (id_usuario,correo,hash_contrasena,salt_contrasena,rol,id_tecnico,hash_sesion,expiracion_sesion) values ($1,$2,$3,$4,$5,$6,$7,$8)', [id, `${id.toLowerCase()}@example.test`, createHmac('sha256', pepper).update(`PASSWORD|salt|${password}`).digest('hex'), 'salt', role, tech, await hmac(`SESSION|${token}`, pepper), new Date(stamp.getTime() + 3600000).toISOString()]);
      }
    };
    const call = (action, data = {}, sessionToken = 'admin-token') => execute({ action, data, sessionToken });
    await suite.test('RLS y privilegios niegan lectura/escritura directa a anon y authenticated', async () => {
      for (const role of ['anon', 'authenticated']) {
        await pg.exec(`set role ${role}`);
        try {
          for (const table of ['usuarios','tickets','tecnicos','historial_tickets']) await assert.rejects(pg.query(`select * from ${table}`), /permission denied/);
          await assert.rejects(pg.query("insert into tickets(no_ticket) values ('attack')"), /permission denied/);
          await assert.rejects(pg.query('select * from ticketing_private.rate_limits'), /permission denied/);
        } finally { await pg.exec('reset role'); }
      }
    });
    await suite.test('login verifica HMAC heredado y nunca devuelve hashes', async () => {
      await reset();
      const result = await call('login', { correo: 'USR-0001@EXAMPLE.TEST', contrasena: password }, undefined);
      assert.equal(result.usuario.rol, 'ADMINISTRADOR');
      assert.ok(result.token.length >= 64);
      assert.equal(JSON.stringify(result).includes('hash_contrasena'), false);
      assert.equal(JSON.stringify(result).includes(password), false);
      await assert.rejects(call('getTickets'), { code: 'INVALID_SESSION' });
      assert.deepEqual(await call('getTickets', {}, result.token), []);
    });
    await suite.test('cinco fallos persisten, bloquean y vuelven a permitir login al vencer', async () => {
      await reset();
      for (let i = 1; i <= 5; i++) await assert.rejects(call('login', { correo: 'usr-0001@example.test', contrasena: 'incorrecta' }), { code: i === 5 ? 'LOGIN_TEMPORARILY_LOCKED' : 'INVALID_CREDENTIALS' });
      await assert.rejects(call('login', { correo: 'usr-0001@example.test', contrasena: password }), { code: 'LOGIN_TEMPORARILY_LOCKED' });
      const row = (await pg.query("select * from usuarios where id_usuario='USR-0001'")).rows[0];
      assert.equal(new Date(row.bloqueado_hasta).getTime(), stamp.getTime() + 900000);
      const later = createBackend({ repo, pepper, now: () => new Date(stamp.getTime() + 900001) });
      assert.ok((await later({ action: 'login', data: { correo: 'usr-0001@example.test', contrasena: password } })).token);
    });
    await suite.test('creación pública, IDs importados, prioridad y seguimiento sin notas internas', async () => {
      await reset();
      const first = await call('createTicket', publicData, undefined);
      await pg.query('delete from historial_tickets where no_ticket=$1', [first.numeroTicket]);
      await pg.query('update tickets set no_ticket=$1 where no_ticket=$2', ['TIC-2026-0123', first.numeroTicket]);
      const second = await call('createTicket', { ...publicData, prioridad: 'CRITICA', estado: 'CERRADO' }, undefined);
      assert.equal(second.numeroTicket, 'TIC-2026-0124');
      assert.equal(second.estado, 'CREADO');
      assert.equal(second.prioridad, 'MEDIA');
      const tracked = await call('trackTicket', { numeroTicket: second.numeroTicket, solicitante: 'maria perez' }, undefined);
      assert.equal('observaciones' in tracked, false);
      assert.equal('adjuntos' in tracked, false);
      await assert.rejects(call('trackTicket', { numeroTicket: second.numeroTicket, solicitante: 'otra persona' }, undefined), { code: 'TICKET_NOT_FOUND' });
      assert.equal((await call('getTicketHistory', { numeroTicket: second.numeroTicket })).length, 1);
    });
    await suite.test('técnicos ven exclusivamente lo propio y no administran', async () => {
      await reset();
      const t = await call('createTicket', publicData);
      const key = { numeroTicket: t.numeroTicket };
      await assert.rejects(call('getTicket', key, 'tech-token'), { code: 'FORBIDDEN' });
      assert.deepEqual(await call('getTickets', {}, 'empty-token'), []);
      for (const action of ['getUsers', 'getTechnicians', 'createUser', 'createTechnician', 'assignTicket', 'changePriority', 'cancelTicket']) await assert.rejects(call(action, key, 'tech-token'), { code: 'FORBIDDEN' });
      await call('assignTicket', { ...key, idTecnico: 'TEC-0001' });
      assert.equal((await call('getTickets', {}, 'tech-token')).length, 1);
      assert.deepEqual(await call('getTickets', { idTecnico: 'TEC-0002' }, 'tech-token'), []);
      await call('assignTicket', { ...key, idTecnico: 'TEC-0002' });
      await assert.rejects(call('getTicketHistory', key, 'tech-token'), { code: 'FORBIDDEN' });
      await assert.rejects(call('addTicketComment', { ...key, comentario: 'Ataque' }, 'tech-token'), { code: 'FORBIDDEN' });
    });
    await suite.test('ciclo completo, comentarios y cierre administrativo con historial', async () => {
      await reset();
      const t = await call('createTicket', publicData);
      const key = { numeroTicket: t.numeroTicket };
      await call('assignTicket', { ...key, idTecnico: 'TEC-0001' });
      await assert.rejects(call('finishTicket', { ...key, resolucion: 'Solución' }, 'tech-token'), { code: 'INVALID_TICKET_STATE' });
      await call('changePriority', { ...key, prioridad: 'ALTA' });
      await call('changeStatus', { ...key, nuevoEstado: 'EN PROCESO' }, 'tech-token');
      await call('addTicketComment', { ...key, comentario: 'Revisión interna' }, 'tech-token');
      await call('changeStatus', { ...key, nuevoEstado: 'PENDIENTE' }, 'tech-token');
      const finished = await call('finishTicket', { ...key, resolucion: 'Fuente reemplazada', observaciones: 'No reemplazar notas' }, 'tech-token');
      assert.match(finished.observaciones, /Revisión interna/);
      assert.match(finished.observaciones, /Correo de contacto/);
      await assert.rejects(call('changeStatus', { ...key, nuevoEstado: 'CERRADO' }, 'tech-token'), { code: 'FORBIDDEN' });
      assert.equal((await call('changeStatus', { ...key, nuevoEstado: 'CERRADO' })).estado, 'CERRADO');
      await assert.rejects(call('cancelTicket', { ...key, motivo: 'Cancelación' }), { code: 'INVALID_TICKET_STATE' });
      assert.equal((await call('getTicketHistory', key)).length, 9);
    });
    await suite.test('cambio temporal obligatorio, rotación e invalidación de sesiones', async () => {
      await reset();
      const technician = await call('createTechnician', { nombreCompleto: 'Nuevo', correo: 'nuevo@example.test' });
      const user = await call('createUser', { correo: 'nuevo@example.test', rol: 'TECNICO', idTecnico: technician.idTecnico, contrasenaTemporal: password });
      assert.equal(user.debeCambiarContrasena, true);
      const login = await call('login', { correo: 'nuevo@example.test', contrasena: password });
      await assert.rejects(call('getTickets', {}, login.token), { code: 'PASSWORD_CHANGE_REQUIRED' });
      const changed = await call('changePassword', { contrasenaActual: password, contrasenaNueva: 'NuevaPassword123' }, login.token);
      assert.equal(changed.usuario.debeCambiarContrasena, false);
      await assert.rejects(call('getTickets', {}, login.token), { code: 'INVALID_SESSION' });
      await call('logout', {}, changed.token);
      await assert.rejects(call('getTickets', {}, changed.token), { code: 'INVALID_SESSION' });
      assert.ok((await call('login', { correo: 'nuevo@example.test', contrasena: 'NuevaPassword123' })).token);
    });
    await suite.test('un fallo del historial revierte el ticket entero', async () => {
      await reset();
      await pg.exec("alter table historial_tickets add constraint test_fail check (tipo_evento <> 'CREACION')");
      try {
        await assert.rejects(call('createTicket', publicData));
        assert.equal((await pg.query('select count(*)::int as n from tickets')).rows[0].n, 0);
      } finally { await pg.exec('alter table historial_tickets drop constraint test_fail'); }
    });
    await suite.test('nuevos IDs y secuencia historial no colisionan con importación', async () => {
      await reset();
      const t = await call('createTicket', publicData);
      await pg.query('update historial_tickets set id_historial=900 where no_ticket=$1', [t.numeroTicket]);
      await pg.exec(await readFile(new URL('../supabase/migrations/202610060001_ticketing_security.sql', import.meta.url), 'utf8'));
      await call('cancelTicket', { numeroTicket: t.numeroTicket, motivo: 'Duplicado confirmado' });
      assert.equal((await call('getTicketHistory', { numeroTicket: t.numeroTicket }))[1].idHistorial, '901');
      const parallel = await Promise.all(Array.from({ length: 4 }, () => call('createTicket', publicData)));
      assert.equal(new Set(parallel.map(x => x.numeroTicket)).size, 4);
    });
    await suite.test('alias migrados, inactivos, sesiones vencidas e inyección SQL', async () => {
      await reset();
      const t = await call('createTicket', publicData);
      await pg.query("update tickets set estado='CREATED', prioridad='NORMAL' where no_ticket=$1", [t.numeroTicket]);
      assert.equal((await call('getTicket', { numeroTicket: t.numeroTicket })).estado, 'CREADO');
      await assert.rejects(call('getTicket', { numeroTicket: "'; DROP TABLE tickets; --" }), { code: 'TICKET_NOT_FOUND' });
      assert.equal((await call('getTickets')).length, 1);
      await pg.exec("update usuarios set estado='INACTIVO' where id_usuario='USR-0002'");
      await assert.rejects(call('getTickets', {}, 'tech-token'), { code: 'USER_INACTIVE' });
      await pg.exec("update usuarios set expiracion_sesion='2020-01-01' where id_usuario='USR-0001'");
      await assert.rejects(call('getTickets'), { code: 'SESSION_EXPIRED' });
    });
    await suite.test('fotos: fallo del puente no crea tickets y éxito conserva enlaces', async () => {
      await reset();
      const image = { name: 'foto.png', mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=' };
      await assert.rejects(call('createTicket', { ...publicData, adjuntos: [image] }), { code: 'ATTACHMENTS_DISABLED' });
      const failing = createBackend({ repo, pepper, now: () => stamp, drive: { upload: async () => { throw new Error('simulated'); } } });
      await assert.rejects(failing({ action: 'createTicket', data: { ...publicData, adjuntos: [image] } }));
      assert.equal((await pg.query('select count(*)::int as n from tickets')).rows[0].n, 0);
      const successful = createBackend({ repo, pepper, now: () => stamp, drive: { upload: async files => { assert.equal(files.length, 1); return [{ id: '123', nombre: 'foto.png', url: 'https://drive.google.com/file/d/123/view' }]; } } });
      const result = await successful({ action: 'createTicket', data: { ...publicData, adjuntos: [image] } });
      assert.equal(result.adjuntos[0].id, '123');
      assert.throws(() => validateAttachments([{ ...image, data: btoa('not an image') }]), { code: 'INVALID_ATTACHMENT' });
    });
    await suite.test('cliente a handler: POST privado, errores, CORS, límites y JSON', async () => {
      await reset();
      const handler = createHandler({ execute, allowedOrigins: ['https://app.example.test'] });
      const api = createSupabaseApi('https://project.supabase.co', 'sb_publishable_test', async (url, options) => {
        assert.equal(url.includes('session'), false);
        assert.equal(options.headers.apikey, 'sb_publishable_test');
        return handler(new Request(url, { ...options, headers: { ...options.headers, origin: 'https://app.example.test' } }));
      });
      const result = await api('createTicket', publicData);
      assert.equal(result.estado, 'CREADO');
      await assert.rejects(api('getUsers', {}, 'tech-token'), { code: 'FORBIDDEN' });
      const post = body => new Request('https://example.test', { method: 'POST', body: JSON.stringify(body) });
      assert.equal((await handler(new Request('https://example.test', { method: 'OPTIONS', headers: { origin: 'https://app.example.test' } }))).headers.get('access-control-allow-origin'), 'https://app.example.test');
      assert.equal((await handler(new Request('https://example.test', { method: 'OPTIONS', headers: { origin: 'https://evil.test' } }))).status, 403);
      assert.equal((await handler(new Request('https://example.test'))).status, 405);
      assert.equal((await (await handler(post(null))).json()).code, 'VALIDATION_ERROR');
      const limited = createHandler({ execute, allowedOrigins: [], rateLimit: async () => false });
      assert.equal((await limited(post({ action: 'login' }))).status, 429);
      const broken = createHandler({ execute: () => { throw new Error('postgres://secret:password'); }, allowedOrigins: [] });
      const failure = await broken(post({ action: 'login' }));
      assert.equal(failure.status, 500);
      assert.equal((await failure.text()).includes('password'), false);
    });
  } finally { await pg.close(); }
});
