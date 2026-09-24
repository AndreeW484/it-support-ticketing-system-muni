export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export function validatePhotos(files) {
  if (files.length > MAX_PHOTOS) throw new Error('Puedes adjuntar hasta 5 fotos por ticket.');
  for (const file of files) {
    if (!PHOTO_TYPES.includes(file.type)) throw new Error(`${file.name}: selecciona una imagen JPG, PNG o WebP.`);
    if (!file.size) throw new Error(`${file.name}: el archivo está vacío.`);
    if (file.size > MAX_PHOTO_BYTES) throw new Error(`${file.name}: supera el máximo de 5 MB por foto.`);
  }
}
export function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}. Selecciona la foto nuevamente.`));
    reader.onabort = () => reject(new Error('Se interrumpió la lectura de las fotos.'));
    reader.readAsDataURL(file);
  });
}
export async function encodePhotos(files, read = readPhoto) {
  validatePhotos(files);
  return Promise.all(files.map(async file => ({ name: file.name, mimeType: file.type, data: await read(file) })));
}
