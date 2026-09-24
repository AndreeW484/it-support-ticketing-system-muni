import test from 'node:test';
import assert from 'node:assert/strict';
import { encodePhotos, validatePhotos, MAX_PHOTO_BYTES } from '../src/photos.js';
import { sendPublicTicket } from '../src/tickets.js';
const photo = { name: 'equipo.jpg', type: 'image/jpeg', size: 50 };
test('fotos respetan límite de cantidad, tamaño y formatos', () => {
  assert.doesNotThrow(() => validatePhotos(Array(5).fill({ ...photo, size: MAX_PHOTO_BYTES })));
  assert.throws(() => validatePhotos(Array(6).fill(photo)), /hasta 5/);
  assert.throws(() => validatePhotos([{ ...photo, size: MAX_PHOTO_BYTES + 1 }]), /5 MB/);
  assert.throws(() => validatePhotos([{ ...photo, size: 0 }]), /vacío/);
  assert.throws(() => validatePhotos([{ ...photo, type: 'image/svg+xml' }]), /JPG, PNG o WebP/);
});
test('adjuntos se codifican con nombres del contrato original de Apps Script', async () => {
  const result = await encodePhotos([photo], async () => 'data:image/jpeg;base64,aG9sYQ==');
  assert.deepEqual(result, [{ name: 'equipo.jpg', mimeType: 'image/jpeg', data: 'data:image/jpeg;base64,aG9sYQ==' }]);
  assert.deepEqual(await encodePhotos([]), []);
});
test('un archivo rechazado no se lee y errores de lectura interrumpen el envío', async () => {
  await assert.rejects(encodePhotos([{ ...photo, size: MAX_PHOTO_BYTES + 1 }], () => assert.fail('No leer')), /5 MB/);
  await assert.rejects(encodePhotos([photo], async () => { throw new Error('Lectura fallida'); }), /Lectura fallida/);
});
test('envío completo incluye fotos sin token y conserva respuesta del backend', async () => {
  const previous = globalThis.FileReader;
  globalThis.FileReader = class { readAsDataURL() { this.result = 'data:image/jpeg;base64,aG9sYQ=='; this.onload(); } };
  try {
    const result = await sendPublicTicket(async (...args) => {
      assert.equal(args.length, 2);
      assert.equal(args[0], 'createTicket');
      assert.equal(args[1].adjuntos[0].mimeType, 'image/jpeg');
      assert.equal(args[1].adjuntos[0].data, 'data:image/jpeg;base64,aG9sYQ==');
      return { numeroTicket: 'TIC-TEST' };
    }, { solicitante: 'Persona', sede: 'Central', area: 'Oficina', tipo: 'INCIDENTE', categoria: 'Equipo', descripcion: 'El equipo no enciende.' }, [photo]);
    assert.equal(result.numeroTicket, 'TIC-TEST');
  } finally { if (previous === undefined) delete globalThis.FileReader; else globalThis.FileReader = previous; }
});
