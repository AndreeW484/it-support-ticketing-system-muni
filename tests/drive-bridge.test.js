import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { createDrive } from '../supabase/functions/ticketing/drive.js';

const code = await readFile(new URL('../backend/drive-bridge/Code.gs', import.meta.url), 'utf8');
const secret = 'test-only-bridge-secret';
const files = [{ name: 'foto.png', mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=' }];
function fixture(failOnImage = 0) {
  const folders = new Map();
  let imageWrites = 0, locked = false;
  const iterator = values => { let i = 0; return { hasNext: () => i < values.length, next: () => values[i++] }; };
  const root = {
    getFoldersByName: name => iterator(folders.has(name) ? [folders.get(name)] : []),
    createFolder(name) {
      const entries = [];
      const folder = {
        trashed: false,
        setTrashed(value) { this.trashed = value; },
        getFilesByName: fileName => iterator(entries.filter(e => e.getName() === fileName)),
        createFile(blobOrName, content) {
          if (typeof blobOrName !== 'string') { imageWrites++; if (imageWrites === failOnImage) throw new Error('Drive failure'); }
          const id = `file-${entries.length}`;
          const file = { getId: () => id, getName: () => typeof blobOrName === 'string' ? blobOrName : blobOrName.name, getUrl: () => `https://drive.google.com/file/d/${id}/view`, getMimeType: () => blobOrName.mimeType, getBlob: () => ({ getDataAsString: () => content }) };
          entries.push(file); return file;
        },
      };
      folders.set(name, folder); return folder;
    },
  };
  const context = vm.createContext({
    LockService: { getScriptLock: () => ({ waitLock: () => { assert.equal(locked, false); locked = true; }, releaseLock: () => { locked = false; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: name => ({ DRIVE_BRIDGE_SECRET: secret, ATTACHMENTS_FOLDER_ID: 'folder' })[name] }) },
    Utilities: { Charset: { UTF_8: 'UTF-8' }, computeHmacSha256Signature: (value, key) => [...createHmac('sha256', key).update(value).digest()].map(n => n > 127 ? n - 256 : n), base64Decode: value => [...Buffer.from(value, 'base64')], newBlob: (bytes, mimeType, name) => ({ bytes, mimeType, name }) },
    DriveApp: { getFolderById: id => { assert.equal(id, 'folder'); return root; } },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: value => ({ setMimeType: () => JSON.parse(value) }) },
  });
  vm.runInContext(code, context);
  return { call: envelope => context.doPost({ postData: { contents: JSON.stringify(envelope) } }), folders, writes: () => imageWrites, locked: () => locked };
}
function signed(changes = {}) {
  const payload = JSON.stringify({ timestamp: Date.now(), requestId: 'a'.repeat(96), ticketNumber: 'TIC-2026-0001', files, ...changes });
  return { payload, signature: createHmac('sha256', secret).update(payload).digest('hex') };
}
test('puente rechaza firmas falsas y solicitudes vencidas antes de escribir', () => {
  const bridge = fixture();
  assert.equal(bridge.call({ ...signed(), signature: '0'.repeat(64) }).success, false);
  assert.equal(bridge.call(signed({ timestamp: Date.now() - 600000 })).success, false);
  assert.equal(bridge.call(signed({ files: [...files, { ...files[0], mimeType: 'text/html' }] })).success, false);
  assert.equal(bridge.writes(), 0);
  assert.equal(bridge.folders.size, 0);
});
test('puente firmado conserva enlaces y no duplica una solicitud repetida', () => {
  const bridge = fixture();
  const envelope = signed();
  const first = bridge.call(envelope);
  assert.equal(first.success, true);
  assert.deepEqual(bridge.call(envelope), first);
  assert.equal(bridge.writes(), 1);
  assert.equal(bridge.folders.size, 1);
  assert.equal(bridge.locked(), false);
});
test('puente limpia su carpeta incompleta al fallar la segunda imagen', () => {
  const bridge = fixture(2);
  assert.equal(bridge.call(signed({ files: [files[0], files[0]] })).success, false);
  assert.equal([...bridge.folders.values()][0].trashed, true);
  assert.equal(bridge.locked(), false);
});
test('cliente del puente usa HMAC compatible y devuelve el contrato de adjuntos', async () => {
  const bridge = fixture();
  const client = createDrive({ url: 'https://script.google.com/macros/s/test/exec', secret, fetcher: async (_url, options) => {
    const result = bridge.call(JSON.parse(options.body));
    return new Response(JSON.stringify(result), { status: 200 });
  } });
  const result = await client.upload(files, 'TIC-2026-0001', 'a'.repeat(96));
  assert.equal(result[0].nombre, 'TIC-2026-0001-1-foto.png');
  assert.equal(result[0].url, 'https://drive.google.com/file/d/file-0/view');
});
test('respuesta inválida de Drive falla sin reintentos', async () => {
  let calls = 0;
  const client = createDrive({ url: 'https://script.google.com/macros/s/test/exec', secret, fetcher: async () => { calls++; return new Response('<html>login</html>'); } });
  await assert.rejects(client.upload(files, 'TIC-2026-0001', 'a'.repeat(96)), { code: 'DRIVE_UPLOAD_FAILED' });
  assert.equal(calls, 1);
});
