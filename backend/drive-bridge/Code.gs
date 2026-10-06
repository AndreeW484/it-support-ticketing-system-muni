/** Proyecto NUEVO de Apps Script: solo fotos, sin Google Sheets.
 * Propiedades: DRIVE_BRIDGE_SECRET y ATTACHMENTS_FOLDER_ID.
 * Publicar ejecutado por el propietario, acceso Cualquiera. Se exige HMAC.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  var acquired = false;
  var createdFolder = null;
  try {
    var properties = PropertiesService.getScriptProperties();
    var secret = properties.getProperty('DRIVE_BRIDGE_SECRET');
    var folderId = properties.getProperty('ATTACHMENTS_FOLDER_ID');
    if (!secret || !folderId) throw new Error('CONFIG_ERROR');
    if (!e || !e.postData || e.postData.contents.length > 36 * 1024 * 1024) throw new Error('INVALID_REQUEST');
    var envelope = JSON.parse(e.postData.contents);
    if (typeof envelope.payload !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.signature || '')) throw new Error('FORBIDDEN');
    var expected = Utilities.computeHmacSha256Signature(envelope.payload, secret, Utilities.Charset.UTF_8).map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
    var different = 0;
    for (var i = 0; i < 64; i++) different |= expected.charCodeAt(i) ^ envelope.signature.charCodeAt(i);
    if (different) throw new Error('FORBIDDEN');
    var payload = JSON.parse(envelope.payload);
    if (typeof payload.timestamp !== 'number' || Math.abs(Date.now() - payload.timestamp) > 300000 || !/^[a-f0-9]{96}$/.test(payload.requestId) || !/^TIC-\d{4}-\d+$/.test(payload.ticketNumber)) throw new Error('INVALID_REQUEST');
    if (!Array.isArray(payload.files) || payload.files.length < 1 || payload.files.length > 5) throw new Error('INVALID_ATTACHMENT');
    var blobs = payload.files.map(function(file, index) {
      if (['image/jpeg', 'image/png', 'image/webp'].indexOf(file.mimeType) < 0 || typeof file.data !== 'string' || file.data.length > 6990508) throw new Error('INVALID_ATTACHMENT');
      var bytes = Utilities.base64Decode(file.data);
      if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error('INVALID_ATTACHMENT');
      var name = payload.ticketNumber + '-' + (index + 1) + '-' + String(file.name || 'foto').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 200);
      return Utilities.newBlob(bytes, file.mimeType, name);
    });
    lock.waitLock(30000); acquired = true;
    var root = DriveApp.getFolderById(folderId);
    var folderName = payload.ticketNumber + '-' + payload.requestId;
    var existing = root.getFoldersByName(folderName);
    if (existing.hasNext()) {
      var manifests = existing.next().getFilesByName('_upload.json');
      if (!manifests.hasNext()) throw new Error('INCOMPLETE_UPLOAD');
      return bridgeJson_({ success: true, data: JSON.parse(manifests.next().getBlob().getDataAsString()) });
    }
    createdFolder = root.createFolder(folderName);
    var result = blobs.map(function(blob) {
      var file = createdFolder.createFile(blob);
      return { id: file.getId(), nombre: file.getName(), url: file.getUrl(), mimeType: file.getMimeType() };
    });
    createdFolder.createFile('_upload.json', JSON.stringify(result), MimeType.PLAIN_TEXT);
    createdFolder = null;
    return bridgeJson_({ success: true, data: result });
  } catch (error) {
    if (createdFolder) { try { createdFolder.setTrashed(true); } catch (ignored) {} }
    return bridgeJson_({ success: false, code: 'DRIVE_UPLOAD_FAILED', message: 'No se pudo completar la carga.' });
  } finally { if (acquired) lock.releaseLock(); }
}
function bridgeJson_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
