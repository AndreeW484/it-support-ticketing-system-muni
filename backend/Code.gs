/**
 * ============================================================================
 * BACKEND - SISTEMA DE ATENCION DE TICKETS DE INFORMATICA
 * ============================================================================
 *
 * Tecnologia: Google Apps Script + Google Sheets + Google Drive
 *
 * Este archivo contiene:
 *   - API GET y POST.
 *   - Gestion de tickets.
 *   - CRUD de tecnicos.
 *   - CRUD de usuarios y control de roles.
 *   - Historial de movimientos.
 *   - Carga de archivos adjuntos a Google Drive.
 *   - Validaciones, bloqueos de concurrencia y respuestas JSON uniformes.
 *
 * IMPORTANTE ANTES DE USARLO:
 *   1. Coloca el ID de tu Google Sheets en CONFIG.SPREADSHEET_ID.
 *   2. Crea una carpeta de Google Drive para adjuntos y coloca su ID en
 *      CONFIG.ATTACHMENTS_FOLDER_ID. Puede quedar vacio mientras no uses
 *      adjuntos.
 *   3. Coloca el correo del primer administrador en
 *      CONFIG.FIRST_ADMIN_EMAIL.
 *   4. En Configuracion del proyecto > Propiedades de la secuencia de comandos,
 *      crea FIRST_ADMIN_TEMP_PASSWORD con una contraseña temporal segura.
 *   5. Ejecuta manualmente validateBackendSetup() desde Apps Script.
 *   6. Ejecuta una sola vez bootstrapFirstAdministrator(). La propiedad con la
 *      contraseña temporal se elimina automaticamente despues de utilizarla.
 *   7. Implementa el proyecto como Aplicacion web.
 *
 * Para evitar el preflight CORS desde un frontend externo, envia los POST con:
 *   Content-Type: text/plain;charset=utf-8
 * Aunque el contenido enviado siga siendo JSON.
 */


// ============================================================================
// 1. CONFIGURACION GENERAL
// ============================================================================

var CONFIG = {
  // El ID es la parte ubicada entre /d/ y /edit en la URL del Google Sheets.
  SPREADSHEET_ID: 'REEMPLAZA_CON_EL_ID_DE_TU_GOOGLE_SHEETS',

  // ID de la carpeta donde se guardaran los archivos adjuntos.
  // Puede dejarse vacio si todavia no se utilizaran adjuntos.
  ATTACHMENTS_FOLDER_ID: '',

  // Zona horaria utilizada para fechas, IDs y comentarios.
  TIME_ZONE: 'America/Guatemala',

  // Correo que se registrara como primer administrador.
  FIRST_ADMIN_EMAIL: 'REEMPLAZA_CON_TU_CORREO',

  // Version informativa del backend.
  API_VERSION: '1.1.0',

  // Limites para proteger Apps Script y Google Drive.
  MAX_ATTACHMENTS: 5,
  MAX_ATTACHMENT_BYTES: 5 * 1024 * 1024,

  // Reglas para el inicio de sesion convencional.
  MIN_PASSWORD_LENGTH: 10,
  SESSION_DURATION_HOURS: 8,
  MAX_LOGIN_ATTEMPTS: 5,
  LOGIN_LOCK_MINUTES: 15
};


// ============================================================================
// 2. NOMBRES DE HOJAS Y ENCABEZADOS
// ============================================================================

var SHEETS = {
  TICKETS: 'Tickets',
  TECHNICIANS: 'Tecnicos',
  USERS: 'Usuarios',
  HISTORY: 'HistorialTickets'
};

/**
 * Los encabezados deben coincidir exactamente con los escritos en la fila 1
 * de cada hoja. El backend localiza las columnas por nombre y no por posicion,
 * por lo que puedes reordenarlas sin modificar el codigo.
 */
var HEADERS = {
  TICKETS: {
    NUMBER: 'No. Ticket',
    CREATED_AT: 'Fecha/Hora Creación',
    REQUESTER: 'Solicitante',
    SITE: 'Sede',
    AREA: 'Área/Departamento',
    TYPE: 'Tipo',
    CATEGORY: 'Categoría',
    DESCRIPTION: 'Descripción Detallada',
    ATTACHMENTS: 'Adjuntos',
    PRIORITY: 'Prioridad',
    STATUS: 'Estado',
    TECHNICIAN_ID: 'Técnico Asignado',
    ASSIGNED_AT: 'Fecha Asignación',
    RESOLVED_AT: 'Fecha Resolución',
    RESOLUTION: 'Resolución',
    OBSERVATIONS: 'Observaciones'
  },

  TECHNICIANS: {
    ID: 'ID Técnico',
    NAME: 'Nombre Completo',
    EMAIL: 'Correo Electrónico',
    PHONE: 'Teléfono',
    SPECIALTY: 'Especialidad',
    STATUS: 'Estado',
    CREATED_AT: 'Fecha Creación',
    UPDATED_AT: 'Fecha Actualización'
  },

  USERS: {
    ID: 'ID Usuario',
    EMAIL: 'Correo',
    PASSWORD_HASH: 'Hash Contraseña',
    PASSWORD_SALT: 'Salt Contraseña',
    ROLE: 'Rol',
    TECHNICIAN_ID: 'ID Técnico',
    STATUS: 'Estado',
    FAILED_ATTEMPTS: 'Intentos Fallidos',
    LOCKED_UNTIL: 'Bloqueado Hasta',
    SESSION_HASH: 'Hash Sesión',
    SESSION_EXPIRES_AT: 'Expiración Sesión',
    MUST_CHANGE_PASSWORD: 'Debe Cambiar Contraseña'
  },

  HISTORY: {
    ID: 'ID Historial',
    TICKET_NUMBER: 'No. Ticket',
    CREATED_AT: 'Fecha/Hora',
    EVENT_TYPE: 'Tipo Evento',
    RESPONSIBLE: 'Responsable',
    FIELD: 'Campo Modificado',
    OLD_VALUE: 'Valor Anterior',
    NEW_VALUE: 'Valor Nuevo',
    DETAIL: 'Detalle'
  }
};


// ============================================================================
// 3. CATALOGOS Y REGLAS DEL NEGOCIO
// ============================================================================

var TICKET_STATUS = {
  CREATED: 'CREADO',
  ASSIGNED: 'ASIGNADO',
  IN_PROGRESS: 'EN PROCESO',
  PENDING: 'PENDIENTE',
  RESOLVED: 'RESUELTO',
  CLOSED: 'CERRADO',
  CANCELLED: 'CANCELADO'
};

var PRIORITIES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];
var ROLES = ['ADMINISTRADOR', 'TECNICO'];
var RECORD_STATUS = ['ACTIVO', 'INACTIVO'];

/**
 * Transiciones permitidas para evitar saltos ilogicos de estado.
 * La resolucion se realiza mediante finishTicket y la reapertura mediante
 * reopenTicket, porque dichas acciones necesitan informacion adicional.
 */
var ALLOWED_STATUS_TRANSITIONS = {
  'CREADO': ['ASIGNADO', 'CANCELADO'],
  'ASIGNADO': ['EN PROCESO', 'PENDIENTE', 'CANCELADO'],
  'EN PROCESO': ['PENDIENTE', 'CANCELADO'],
  'PENDIENTE': ['EN PROCESO', 'CANCELADO'],
  'RESUELTO': ['CERRADO'],
  'CERRADO': [],
  'CANCELADO': []
};


// ============================================================================
// 4. PUNTOS DE ENTRADA DE LA API
// ============================================================================

/**
 * Atiende consultas GET.
 * Ejemplo:
 *   .../exec?action=getTickets&estado=EN%20PROCESO
 */
function doGet(e) {
  try {
    var request = normalizeGetRequest_(e);
    var data = routeGet_(request.action, request);
    return jsonResponse_({ success: true, data: data });
  } catch (error) {
    return errorResponse_(error);
  }
}

/**
 * Atiende operaciones POST.
 * Formato recomendado:
 * {
 *   "action": "createTicket",
 *   "data": { ... }
 * }
 */
function doPost(e) {
  try {
    var request = normalizePostRequest_(e);
    var data = routePost_(request.action, request);
    return jsonResponse_({ success: true, data: data });
  } catch (error) {
    return errorResponse_(error);
  }
}


// ============================================================================
// 5. ENRUTADORES GET Y POST
// ============================================================================

/** Decide que funcion ejecutar de acuerdo con la accion GET recibida. */
function routeGet_(action, request) {
  switch (action) {
    // Acciones publicas.
    case 'health':
      return getHealth_();
    case 'getCatalogs':
      return getCatalogs_();
    case 'trackTicket':
      return trackTicket_(request);

    default:
      throw appError_(
        'INVALID_ACTION',
        'La acción GET no existe o requiere una solicitud POST autenticada: ' + action
      );
  }
}

/** Decide que funcion ejecutar de acuerdo con la accion POST recibida. */
function routePost_(action, request) {
  switch (action) {
    // Autenticacion convencional.
    case 'login':
      return login_(request.data);
    case 'logout':
      return logout_(request);
    case 'changePassword':
      return changePassword_(request);

    // Registro publico de tickets.
    case 'createTicket':
      return createTicket_(request.data);

    /*
     * Consultas protegidas por sesion. Se incluyen en POST para que el token
     * viaje en el cuerpo y no quede expuesto en la URL del navegador.
     */
    case 'getCurrentUser':
      return getCurrentUser_(request);
    case 'getTickets':
      return getTickets_(request);
    case 'getTicket':
      return getTicket_(request);
    case 'getTicketsByTechnician':
      return getTicketsByTechnician_(request);
    case 'getTicketsByStatus':
      return getTicketsByStatus_(request);
    case 'getTicketHistory':
      return getTicketHistory_(request);
    case 'getDashboardSummary':
      return getDashboardSummary_(request);
    case 'getTechnicians':
      return getTechnicians_(request, false);
    case 'getActiveTechnicians':
      return getTechnicians_(request, true);
    case 'getTechnician':
      return getTechnician_(request);
    case 'getUsers':
      return getUsers_(request);

    // Operaciones de tickets.
    case 'updateTicket':
      return updateTicket_(request);
    case 'assignTicket':
      return assignTicket_(request);
    case 'changePriority':
      return changePriority_(request);
    case 'changeStatus':
      return changeStatus_(request);
    case 'finishTicket':
      return finishTicket_(request);
    case 'reopenTicket':
      return reopenTicket_(request);
    case 'cancelTicket':
      return cancelTicket_(request);
    case 'addTicketComment':
      return addTicketComment_(request);

    // CRUD de tecnicos.
    case 'createTechnician':
      return createTechnician_(request);
    case 'updateTechnician':
      return updateTechnician_(request);
    case 'deleteTechnician':
      return deleteTechnician_(request);
    case 'reactivateTechnician':
      return reactivateTechnician_(request);

    // CRUD de usuarios.
    case 'createUser':
      return createUser_(request);
    case 'updateUser':
      return updateUser_(request);
    case 'deactivateUser':
      return deactivateUser_(request);
    case 'reactivateUser':
      return reactivateUser_(request);
    case 'resetUserPassword':
      return resetUserPassword_(request);

    default:
      throw appError_('INVALID_ACTION', 'La acción POST no existe: ' + action);
  }
}


// ============================================================================
// 6. CONFIGURACION INICIAL Y DIAGNOSTICO
// ============================================================================

/**
 * Ejecuta esta funcion manualmente desde el editor de Apps Script.
 * Comprueba la existencia de las cuatro hojas y de todos sus encabezados.
 */
function validateBackendSetup() {
  validateMainConfiguration_();

  var results = [];
  results.push(validateSheetSchema_(SHEETS.TICKETS, valuesOf_(HEADERS.TICKETS)));
  results.push(validateSheetSchema_(SHEETS.TECHNICIANS, valuesOf_(HEADERS.TECHNICIANS)));
  results.push(validateSheetSchema_(SHEETS.USERS, valuesOf_(HEADERS.USERS)));
  results.push(validateSheetSchema_(SHEETS.HISTORY, valuesOf_(HEADERS.HISTORY)));

  if (CONFIG.ATTACHMENTS_FOLDER_ID) {
    // Si el ID es incorrecto o no hay permisos, DriveApp generara un error.
    DriveApp.getFolderById(CONFIG.ATTACHMENTS_FOLDER_ID).getName();
  }

  var response = {
    valid: true,
    message: 'La configuración y los encabezados son correctos.',
    sheets: results,
    attachmentsEnabled: Boolean(CONFIG.ATTACHMENTS_FOLDER_ID)
  };

  Logger.log(JSON.stringify(response, null, 2));
  return response;
}

/**
 * Crea el primer usuario administrador de manera segura desde el editor.
 * Si una version anterior ya creo al administrador sin contraseña, completa
 * ese mismo registro en lugar de duplicarlo.
 */
function bootstrapFirstAdministrator() {
  validateMainConfiguration_();

  var email = normalizeEmail_(CONFIG.FIRST_ADMIN_EMAIL);
  if (!isValidEmail_(email) || email.indexOf('reemplaza_') === 0) {
    throw appError_(
      'CONFIG_ERROR',
      'Configura un correo válido en CONFIG.FIRST_ADMIN_EMAIL.'
    );
  }

  var scriptProperties = PropertiesService.getScriptProperties();
  var temporaryPassword = String(
    scriptProperties.getProperty('FIRST_ADMIN_TEMP_PASSWORD') || ''
  );

  if (!temporaryPassword) {
    throw appError_(
      'CONFIG_ERROR',
      'Crea la propiedad de secuencia FIRST_ADMIN_TEMP_PASSWORD antes de ejecutar el bootstrap.'
    );
  }

  validatePasswordStrength_(temporaryPassword);

  return withScriptLock_(function () {
    var users = readRecords_(SHEETS.USERS, HEADERS.USERS.ID);
    var existingAdministrator = null;

    users.forEach(function (entry) {
      if (normalizeEmail_(entry.data[HEADERS.USERS.EMAIL]) === email) {
        existingAdministrator = entry;
      }
    });

    if (users.length > 0 && !existingAdministrator) {
      throw appError_(
        'BOOTSTRAP_NOT_ALLOWED',
        'La hoja Usuarios ya contiene registros y no coincide con el correo administrador configurado.'
      );
    }

    if (
      existingAdministrator &&
      String(existingAdministrator.data[HEADERS.USERS.PASSWORD_HASH] || '').trim()
    ) {
      throw appError_(
        'BOOTSTRAP_NOT_ALLOWED',
        'El primer administrador ya tiene una contraseña configurada.'
      );
    }

    var userId = existingAdministrator
      ? String(existingAdministrator.data[HEADERS.USERS.ID])
      : generateSequentialId_(SHEETS.USERS, HEADERS.USERS.ID, 'USR-', 4);

    var passwordSalt = createRandomSecret_();
    var passwordHash = hashPassword_(temporaryPassword, passwordSalt);
    var authenticationFields = {
      'ID Usuario': userId,
      'Correo': email,
      'Hash Contraseña': passwordHash,
      'Salt Contraseña': passwordSalt,
      'Rol': 'ADMINISTRADOR',
      'ID Técnico': '',
      'Estado': 'ACTIVO',
      'Intentos Fallidos': 0,
      'Bloqueado Hasta': '',
      'Hash Sesión': '',
      'Expiración Sesión': '',
      'Debe Cambiar Contraseña': 'SI'
    };

    if (existingAdministrator) {
      updateRecord_(
        SHEETS.USERS,
        existingAdministrator.rowNumber,
        authenticationFields
      );
    } else {
      appendRecord_(SHEETS.USERS, authenticationFields);
    }

    // La contraseña temporal deja de permanecer en las propiedades del script.
    scriptProperties.deleteProperty('FIRST_ADMIN_TEMP_PASSWORD');

    var result = {
      idUsuario: userId,
      correo: email,
      rol: 'ADMINISTRADOR',
      estado: 'ACTIVO',
      debeCambiarContrasena: true
    };

    Logger.log(JSON.stringify(result, null, 2));
    return result;
  });
}


// ============================================================================
// 7. AUTENTICACION Y AUTORIZACION
// ============================================================================

/**
 * Inicia sesion con correo y contraseña.
 * La contraseña recibida se compara mediante HMAC-SHA256, salt individual y
 * un pepper secreto guardado en Script Properties. Nunca se guarda en texto.
 */
function login_(data) {
  data = data || {};
  var email = normalizeEmail_(requireString_(data, 'correo', 'Correo'));
  var password = String(data.contrasena || '');

  if (!password) {
    throw appError_('VALIDATION_ERROR', 'El campo Contraseña es obligatorio.');
  }

  return withScriptLock_(function () {
    var userEntry = findRecord_(
      SHEETS.USERS,
      HEADERS.USERS.ID,
      function (record) {
        return normalizeEmail_(record.data[HEADERS.USERS.EMAIL]) === email;
      }
    );

    // Se usa el mismo mensaje para no revelar si un correo está registrado.
    if (!userEntry) {
      throw appError_('INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    }

    var row = userEntry.data;
    if (normalizeRecordStatus_(row[HEADERS.USERS.STATUS]) !== 'ACTIVO') {
      throw appError_('USER_INACTIVE', 'El usuario se encuentra inactivo.');
    }

    var now = new Date();
    var lockedUntil = parseDateValue_(row[HEADERS.USERS.LOCKED_UNTIL]);
    var failedAttempts = Number(row[HEADERS.USERS.FAILED_ATTEMPTS] || 0);

    if (lockedUntil && lockedUntil.getTime() > now.getTime()) {
      throw appError_(
        'LOGIN_TEMPORARILY_LOCKED',
        'El acceso está bloqueado temporalmente. Intenta nuevamente después de ' +
          formatDateTime_(lockedUntil) + '.'
      );
    }

    // Si el bloqueo ya vencio, inicia un contador nuevo.
    if (lockedUntil && lockedUntil.getTime() <= now.getTime()) {
      failedAttempts = 0;
    }

    var salt = String(row[HEADERS.USERS.PASSWORD_SALT] || '');
    var storedHash = String(row[HEADERS.USERS.PASSWORD_HASH] || '');
    var suppliedHash = salt ? hashPassword_(password, salt) : '';

    if (!storedHash || !secureEquals_(storedHash, suppliedHash)) {
      failedAttempts += 1;
      var failedFields = {};

      if (failedAttempts >= CONFIG.MAX_LOGIN_ATTEMPTS) {
        var newLockedUntil = new Date(
          now.getTime() + CONFIG.LOGIN_LOCK_MINUTES * 60 * 1000
        );
        failedFields[HEADERS.USERS.FAILED_ATTEMPTS] = 0;
        failedFields[HEADERS.USERS.LOCKED_UNTIL] = newLockedUntil;
        updateRecord_(SHEETS.USERS, userEntry.rowNumber, failedFields);

        throw appError_(
          'LOGIN_TEMPORARILY_LOCKED',
          'Se alcanzó el límite de intentos. El acceso fue bloqueado temporalmente.'
        );
      }

      failedFields[HEADERS.USERS.FAILED_ATTEMPTS] = failedAttempts;
      failedFields[HEADERS.USERS.LOCKED_UNTIL] = '';
      updateRecord_(SHEETS.USERS, userEntry.rowNumber, failedFields);

      throw appError_('INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    }

    var rawSessionToken = createRandomSecret_() + createRandomSecret_();
    var sessionExpiration = new Date(
      now.getTime() + CONFIG.SESSION_DURATION_HOURS * 60 * 60 * 1000
    );
    var successFields = {};
    successFields[HEADERS.USERS.FAILED_ATTEMPTS] = 0;
    successFields[HEADERS.USERS.LOCKED_UNTIL] = '';
    successFields[HEADERS.USERS.SESSION_HASH] = hashSessionToken_(rawSessionToken);
    successFields[HEADERS.USERS.SESSION_EXPIRES_AT] = sessionExpiration;
    updateRecord_(SHEETS.USERS, userEntry.rowNumber, successFields);

    var updatedEntry = findUserById_(String(row[HEADERS.USERS.ID]));
    return {
      token: rawSessionToken,
      expiraEn: formatDateTime_(sessionExpiration),
      usuario: mapUser_(updatedEntry.data)
    };
  });
}

/** Cierra la sesion actual invalidando el token almacenado. */
function logout_(request) {
  var user = getAuthenticatedUser_(request);

  return withScriptLock_(function () {
    var fields = {};
    fields[HEADERS.USERS.SESSION_HASH] = '';
    fields[HEADERS.USERS.SESSION_EXPIRES_AT] = '';
    updateRecord_(SHEETS.USERS, user.rowNumber, fields);
    return { message: 'Sesión cerrada correctamente.' };
  });
}

/**
 * Cambia la contraseña del usuario autenticado y genera una sesion nueva.
 * El frontend debe sustituir su token anterior por el token devuelto.
 */
function changePassword_(request) {
  var user = getAuthenticatedUser_(request);
  var data = request.data || {};
  var currentPassword = String(data.contrasenaActual || '');
  var newPassword = String(data.contrasenaNueva || '');

  if (!currentPassword) {
    throw appError_('VALIDATION_ERROR', 'La contraseña actual es obligatoria.');
  }
  validatePasswordStrength_(newPassword);

  return withScriptLock_(function () {
    var userEntry = findUserById_(user.idUsuario);
    var row = userEntry.data;
    var currentHash = hashPassword_(
      currentPassword,
      String(row[HEADERS.USERS.PASSWORD_SALT] || '')
    );

    if (!secureEquals_(String(row[HEADERS.USERS.PASSWORD_HASH] || ''), currentHash)) {
      throw appError_('INVALID_CURRENT_PASSWORD', 'La contraseña actual es incorrecta.');
    }

    var newSalt = createRandomSecret_();
    var newToken = createRandomSecret_() + createRandomSecret_();
    var expiration = new Date(
      new Date().getTime() + CONFIG.SESSION_DURATION_HOURS * 60 * 60 * 1000
    );
    var fields = {};
    fields[HEADERS.USERS.PASSWORD_SALT] = newSalt;
    fields[HEADERS.USERS.PASSWORD_HASH] = hashPassword_(newPassword, newSalt);
    fields[HEADERS.USERS.MUST_CHANGE_PASSWORD] = 'NO';
    fields[HEADERS.USERS.FAILED_ATTEMPTS] = 0;
    fields[HEADERS.USERS.LOCKED_UNTIL] = '';
    fields[HEADERS.USERS.SESSION_HASH] = hashSessionToken_(newToken);
    fields[HEADERS.USERS.SESSION_EXPIRES_AT] = expiration;
    updateRecord_(SHEETS.USERS, userEntry.rowNumber, fields);

    return {
      token: newToken,
      expiraEn: formatDateTime_(expiration),
      usuario: mapUser_(findUserById_(user.idUsuario).data)
    };
  });
}

/**
 * Valida el token de sesion enviado en el cuerpo de la solicitud.
 * Por las limitaciones de Apps Script tambien se acepta por query string, pero
 * el frontend debe preferir siempre POST para no dejar el token en la URL.
 */
function getAuthenticatedUser_(request) {
  var data = request && request.data ? request.data : {};
  var rawToken = String(
    (request && (request.sessionToken || request.token)) ||
    data.sessionToken ||
    data.token ||
    ''
  ).trim();

  if (!rawToken) {
    throw appError_('UNAUTHENTICATED', 'Debes iniciar sesión para continuar.');
  }

  var tokenHash = hashSessionToken_(rawToken);
  var userEntry = findRecord_(
    SHEETS.USERS,
    HEADERS.USERS.ID,
    function (record) {
      return secureEquals_(
        String(record.data[HEADERS.USERS.SESSION_HASH] || ''),
        tokenHash
      );
    }
  );

  if (!userEntry) {
    throw appError_('INVALID_SESSION', 'La sesión no es válida. Inicia sesión nuevamente.');
  }

  var row = userEntry.data;
  if (normalizeRecordStatus_(row[HEADERS.USERS.STATUS]) !== 'ACTIVO') {
    throw appError_('USER_INACTIVE', 'El usuario se encuentra inactivo.');
  }

  var expiration = parseDateValue_(row[HEADERS.USERS.SESSION_EXPIRES_AT]);
  if (!expiration || expiration.getTime() <= new Date().getTime()) {
    throw appError_('SESSION_EXPIRED', 'La sesión expiró. Inicia sesión nuevamente.');
  }

  return {
    rowNumber: userEntry.rowNumber,
    idUsuario: String(row[HEADERS.USERS.ID]),
    correo: normalizeEmail_(row[HEADERS.USERS.EMAIL]),
    rol: normalizeRole_(row[HEADERS.USERS.ROLE]),
    idTecnico: String(row[HEADERS.USERS.TECHNICIAN_ID] || '').trim(),
    estado: normalizeRecordStatus_(row[HEADERS.USERS.STATUS]),
    debeCambiarContrasena: normalizeYesNo_(row[HEADERS.USERS.MUST_CHANGE_PASSWORD]) === 'SI'
  };
}

/** Comprueba que el usuario tenga uno de los roles permitidos. */
function requireRoles_(request, allowedRoles) {
  var user = getAuthenticatedUser_(request);

  if (user.debeCambiarContrasena) {
    throw appError_(
      'PASSWORD_CHANGE_REQUIRED',
      'Debes cambiar la contraseña temporal antes de continuar.'
    );
  }

  if (allowedRoles.indexOf(user.rol) === -1) {
    throw appError_('FORBIDDEN', 'No tienes permisos para realizar esta acción.');
  }

  return user;
}

/**
 * Un tecnico solamente puede consultar o modificar tickets que tenga
 * asignados. Los administradores pueden trabajar con cualquier ticket.
 */
function assertTicketAccess_(user, ticketEntry) {
  if (user.rol === 'ADMINISTRADOR') {
    return;
  }

  var assignedTechnicianId = String(
    ticketEntry.data[HEADERS.TICKETS.TECHNICIAN_ID] || ''
  ).trim();

  if (!user.idTecnico || assignedTechnicianId !== user.idTecnico) {
    throw appError_('FORBIDDEN', 'Este ticket no está asignado al técnico autenticado.');
  }
}


// ============================================================================
// 8. INFORMACION GENERAL Y CATALOGOS
// ============================================================================

function getHealth_() {
  return {
    service: 'IT Support Ticketing Backend',
    version: CONFIG.API_VERSION,
    status: 'OK',
    timestamp: formatDateTime_(new Date())
  };
}

function getCatalogs_() {
  return {
    estadosTicket: valuesOf_(TICKET_STATUS),
    prioridades: PRIORITIES.slice(),
    roles: ROLES.slice(),
    estadosRegistro: RECORD_STATUS.slice()
  };
}

function getCurrentUser_(request) {
  return getAuthenticatedUser_(request);
}


// ============================================================================
// 9. CONSULTAS DE TICKETS
// ============================================================================

/** Devuelve tickets aplicando filtros opcionales. */
function getTickets_(request) {
  var user = requireRoles_(request, ROLES);
  var filters = request;
  var entries = readRecords_(SHEETS.TICKETS, HEADERS.TICKETS.NUMBER);

  // Un tecnico nunca puede utilizar el filtro para ver tickets de otro tecnico.
  var technicianFilter = user.rol === 'TECNICO'
    ? user.idTecnico
    : String(filters.idTecnico || '').trim();

  var statusFilter = filters.estado ? normalizeTicketStatus_(filters.estado) : '';
  var priorityFilter = filters.prioridad ? normalizePriority_(filters.prioridad) : '';
  var siteFilter = normalizeForSearch_(filters.sede || '');
  var searchFilter = normalizeForSearch_(filters.buscar || '');

  var filtered = entries.filter(function (entry) {
    var row = entry.data;

    if (technicianFilter && String(row[HEADERS.TICKETS.TECHNICIAN_ID] || '').trim() !== technicianFilter) {
      return false;
    }

    if (statusFilter && normalizeTicketStatus_(row[HEADERS.TICKETS.STATUS]) !== statusFilter) {
      return false;
    }

    if (priorityFilter && normalizePriority_(row[HEADERS.TICKETS.PRIORITY]) !== priorityFilter) {
      return false;
    }

    if (siteFilter && normalizeForSearch_(row[HEADERS.TICKETS.SITE]).indexOf(siteFilter) === -1) {
      return false;
    }

    if (searchFilter) {
      var searchableText = [
        row[HEADERS.TICKETS.NUMBER],
        row[HEADERS.TICKETS.REQUESTER],
        row[HEADERS.TICKETS.SITE],
        row[HEADERS.TICKETS.AREA],
        row[HEADERS.TICKETS.CATEGORY],
        row[HEADERS.TICKETS.DESCRIPTION]
      ].join(' ');

      if (normalizeForSearch_(searchableText).indexOf(searchFilter) === -1) {
        return false;
      }
    }

    return true;
  });

  var technicianNames = getTechnicianNameMap_();
  var tickets = filtered.map(function (entry) {
    return mapTicket_(entry.data, technicianNames);
  });

  // Los tickets mas recientes aparecen primero.
  tickets.sort(function (a, b) {
    return String(b.fechaCreacion).localeCompare(String(a.fechaCreacion));
  });

  return tickets;
}

/** Consulta un ticket especifico para personal autenticado. */
function getTicket_(request) {
  var user = requireRoles_(request, ROLES);
  var ticketNumber = requireString_(request, 'numeroTicket', 'No. Ticket');
  var ticketEntry = findTicketByNumber_(ticketNumber);

  assertTicketAccess_(user, ticketEntry);

  return mapTicket_(ticketEntry.data, getTechnicianNameMap_());
}

/** Atajo para consultar por tecnico. */
function getTicketsByTechnician_(request) {
  var cloned = copyObject_(request);
  cloned.idTecnico = requireString_(request, 'idTecnico', 'ID Técnico');
  return getTickets_(cloned);
}

/** Atajo para consultar por estado. */
function getTicketsByStatus_(request) {
  var cloned = copyObject_(request);
  cloned.estado = requireString_(request, 'estado', 'Estado');
  return getTickets_(cloned);
}

/**
 * Consulta publica basica. Requiere el numero de ticket y el mismo valor de
 * Solicitante con el que fue creado para reducir exposicion de informacion.
 */
function trackTicket_(request) {
  var ticketNumber = requireString_(request, 'numeroTicket', 'No. Ticket');
  var requester = requireString_(request, 'solicitante', 'Solicitante');
  var ticketEntry = findTicketByNumber_(ticketNumber);

  if (
    normalizeForSearch_(ticketEntry.data[HEADERS.TICKETS.REQUESTER]) !==
    normalizeForSearch_(requester)
  ) {
    throw appError_('TICKET_NOT_FOUND', 'No fue posible encontrar el ticket con los datos proporcionados.');
  }

  var ticket = mapTicket_(ticketEntry.data, getTechnicianNameMap_());

  // Se devuelve un subconjunto que no incluye observaciones internas.
  return {
    numeroTicket: ticket.numeroTicket,
    fechaCreacion: ticket.fechaCreacion,
    solicitante: ticket.solicitante,
    sede: ticket.sede,
    area: ticket.area,
    tipo: ticket.tipo,
    categoria: ticket.categoria,
    descripcion: ticket.descripcion,
    prioridad: ticket.prioridad,
    estado: ticket.estado,
    tecnicoAsignado: ticket.nombreTecnicoAsignado,
    fechaAsignacion: ticket.fechaAsignacion,
    fechaResolucion: ticket.fechaResolucion,
    resolucion: ticket.resolucion
  };
}

/** Devuelve el historial completo de un ticket para personal autorizado. */
function getTicketHistory_(request) {
  var user = requireRoles_(request, ROLES);
  var ticketNumber = requireString_(request, 'numeroTicket', 'No. Ticket');
  var ticketEntry = findTicketByNumber_(ticketNumber);

  assertTicketAccess_(user, ticketEntry);

  var history = readRecords_(SHEETS.HISTORY, HEADERS.HISTORY.ID)
    .filter(function (entry) {
      return String(entry.data[HEADERS.HISTORY.TICKET_NUMBER]) === ticketNumber;
    })
    .map(function (entry) {
      return mapHistory_(entry.data);
    });

  history.sort(function (a, b) {
    return String(a.fechaHora).localeCompare(String(b.fechaHora));
  });

  return history;
}

/** Resumen util para los paneles de administrador y tecnico. */
function getDashboardSummary_(request) {
  var tickets = getTickets_(request);
  var byStatus = {};
  var byPriority = {};

  valuesOf_(TICKET_STATUS).forEach(function (status) {
    byStatus[status] = 0;
  });

  PRIORITIES.forEach(function (priority) {
    byPriority[priority] = 0;
  });

  tickets.forEach(function (ticket) {
    byStatus[ticket.estado] = (byStatus[ticket.estado] || 0) + 1;
    byPriority[ticket.prioridad] = (byPriority[ticket.prioridad] || 0) + 1;
  });

  return {
    total: tickets.length,
    porEstado: byStatus,
    porPrioridad: byPriority
  };
}


// ============================================================================
// 10. CREACION Y ACTUALIZACION DE TICKETS
// ============================================================================

/** Crea un ticket y registra su primer evento en el historial. */
function createTicket_(data) {
  data = data || {};

  var requester = requireString_(data, 'solicitante', 'Solicitante');
  var site = requireString_(data, 'sede', 'Sede');
  var area = requireString_(data, 'area', 'Área/Departamento');
  var type = requireString_(data, 'tipo', 'Tipo');
  var category = requireString_(data, 'categoria', 'Categoría');
  var description = requireString_(data, 'descripcion', 'Descripción Detallada');
  var priority = data.prioridad ? normalizePriority_(data.prioridad) : 'MEDIA';
  var observations = cleanCellText_(data.observaciones || '');
  var attachments = normalizeAttachments_(data.adjuntos || []);

  return withScriptLock_(function () {
    var year = Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, 'yyyy');
    var ticketNumber = generateSequentialId_(
      SHEETS.TICKETS,
      HEADERS.TICKETS.NUMBER,
      'TIC-' + year + '-',
      4
    );

    var uploadedAttachments = uploadAttachments_(attachments, ticketNumber);
    var now = new Date();

    appendRecord_(SHEETS.TICKETS, {
      'No. Ticket': ticketNumber,
      'Fecha/Hora Creación': now,
      'Solicitante': cleanCellText_(requester),
      'Sede': cleanCellText_(site),
      'Área/Departamento': cleanCellText_(area),
      'Tipo': cleanCellText_(type),
      'Categoría': cleanCellText_(category),
      'Descripción Detallada': cleanCellText_(description),
      'Adjuntos': uploadedAttachments.length ? JSON.stringify(uploadedAttachments) : '',
      'Prioridad': priority,
      'Estado': TICKET_STATUS.CREATED,
      'Técnico Asignado': '',
      'Fecha Asignación': '',
      'Fecha Resolución': '',
      'Resolución': '',
      'Observaciones': observations
    });

    recordHistorySafely_({
      ticketNumber: ticketNumber,
      eventType: 'CREACION',
      responsible: requester,
      field: 'ticket',
      oldValue: '',
      newValue: ticketNumber,
      detail: 'Ticket registrado por el solicitante.'
    });

    return mapTicket_(findTicketByNumber_(ticketNumber).data, getTechnicianNameMap_());
  });
}

/**
 * Permite que un administrador corrija la informacion general del ticket.
 * No modifica estado, prioridad, tecnico ni resolucion; esas operaciones tienen
 * sus propias acciones y reglas.
 */
function updateTicket_(request) {
  var user = requireRoles_(request, ['ADMINISTRADOR']);
  var data = request.data || {};
  var ticketNumber = requireString_(data, 'numeroTicket', 'No. Ticket');

  var allowedFields = [
    { parameter: 'solicitante', header: HEADERS.TICKETS.REQUESTER },
    { parameter: 'sede', header: HEADERS.TICKETS.SITE },
    { parameter: 'area', header: HEADERS.TICKETS.AREA },
    { parameter: 'tipo', header: HEADERS.TICKETS.TYPE },
    { parameter: 'categoria', header: HEADERS.TICKETS.CATEGORY },
    { parameter: 'descripcion', header: HEADERS.TICKETS.DESCRIPTION },
    { parameter: 'observaciones', header: HEADERS.TICKETS.OBSERVATIONS }
  ];

  return withScriptLock_(function () {
    var ticketEntry = findTicketByNumber_(ticketNumber);
    var fieldsToUpdate = {};
    var changes = [];

    allowedFields.forEach(function (definition) {
      if (!hasOwn_(data, definition.parameter)) {
        return;
      }

      var oldValue = String(ticketEntry.data[definition.header] || '');
      var newValue = cleanCellText_(data[definition.parameter]);

      if (oldValue !== newValue) {
        fieldsToUpdate[definition.header] = newValue;
        changes.push({
          field: definition.parameter,
          oldValue: oldValue,
          newValue: newValue
        });
      }
    });

    if (changes.length === 0) {
      throw appError_('NO_CHANGES', 'No se recibieron cambios para actualizar.');
    }

    updateRecord_(SHEETS.TICKETS, ticketEntry.rowNumber, fieldsToUpdate);

    changes.forEach(function (change) {
      recordHistorySafely_({
        ticketNumber: ticketNumber,
        eventType: 'ACTUALIZACION',
        responsible: user.correo,
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
        detail: cleanCellText_(data.detalle || 'Información general actualizada.')
      });
    });

    return mapTicket_(findTicketByNumber_(ticketNumber).data, getTechnicianNameMap_());
  });
}

/** Asigna o reasigna un ticket a un tecnico activo. */
function assignTicket_(request) {
  var user = requireRoles_(request, ['ADMINISTRADOR']);
  var data = request.data || {};
  var ticketNumber = requireString_(data, 'numeroTicket', 'No. Ticket');
  var technicianId = requireString_(data, 'idTecnico', 'ID Técnico');

  return withScriptLock_(function () {
    var ticketEntry = findTicketByNumber_(ticketNumber);
    var technicianEntry = findTechnicianById_(technicianId);
    var technicianStatus = normalizeRecordStatus_(
      technicianEntry.data[HEADERS.TECHNICIANS.STATUS]
    );

    if (technicianStatus !== 'ACTIVO') {
      throw appError_('TECHNICIAN_INACTIVE', 'El técnico seleccionado está inactivo.');
    }

    var oldTechnicianId = String(
      ticketEntry.data[HEADERS.TICKETS.TECHNICIAN_ID] || ''
    ).trim();
    var oldStatus = normalizeTicketStatus_(ticketEntry.data[HEADERS.TICKETS.STATUS]);
    var newStatus = oldStatus === TICKET_STATUS.CREATED
      ? TICKET_STATUS.ASSIGNED
      : oldStatus;

    if ([TICKET_STATUS.RESOLVED, TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELLED].indexOf(oldStatus) !== -1) {
      throw appError_('INVALID_TICKET_STATE', 'No se puede asignar un ticket finalizado o cancelado.');
    }

    var fields = {};
    fields[HEADERS.TICKETS.TECHNICIAN_ID] = technicianId;
    fields[HEADERS.TICKETS.ASSIGNED_AT] = new Date();
    fields[HEADERS.TICKETS.STATUS] = newStatus;

    if (data.prioridad) {
      fields[HEADERS.TICKETS.PRIORITY] = normalizePriority_(data.prioridad);
    }

    updateRecord_(SHEETS.TICKETS, ticketEntry.rowNumber, fields);

    recordHistorySafely_({
      ticketNumber: ticketNumber,
      eventType: oldTechnicianId ? 'REASIGNACION' : 'ASIGNACION',
      responsible: user.correo,
      field: 'tecnicoAsignado',
      oldValue: oldTechnicianId,
      newValue: technicianId,
      detail: cleanCellText_(data.detalle || 'Ticket asignado a un técnico.')
    });

    if (oldStatus !== newStatus) {
      recordHistorySafely_({
        ticketNumber: ticketNumber,
        eventType: 'CAMBIO_ESTADO',
        responsible: user.correo,
        field: 'estado',
        oldValue: oldStatus,
        newValue: newStatus,
        detail: 'Cambio automático generado por la asignación.'
      });
    }

    if (data.prioridad) {
      var oldPriority = normalizePriority_(ticketEntry.data[HEADERS.TICKETS.PRIORITY]);
      var newPriority = fields[HEADERS.TICKETS.PRIORITY];
      if (oldPriority !== newPriority) {
        recordHistorySafely_({
          ticketNumber: ticketNumber,
          eventType: 'CAMBIO_PRIORIDAD',
          responsible: user.correo,
          field: 'prioridad',
          oldValue: oldPriority,
          newValue: newPriority,
          detail: 'Prioridad establecida durante la asignación.'
        });
      }
    }

    return mapTicket_(findTicketByNumber_(ticketNumber).data, getTechnicianNameMap_());
  });
}

/** Cambia la prioridad; esta accion es exclusiva del administrador. */
function changePriority_(request) {
  var user = requireRoles_(request, ['ADMINISTRADOR']);
  var data = request.data || {};
  var ticketNumber = requireString_(data, 'numeroTicket', 'No. Ticket');
  var newPriority = normalizePriority_(requireString_(data, 'prioridad', 'Prioridad'));

  return withScriptLock_(function () {
    var ticketEntry = findTicketByNumber_(ticketNumber);
    var oldPriority = normalizePriority_(ticketEntry.data[HEADERS.TICKETS.PRIORITY]);

    if (oldPriority === newPriority) {
      throw appError_('NO_CHANGES', 'El ticket ya posee esa prioridad.');
    }

    var fields = {};
    fields[HEADERS.TICKETS.PRIORITY] = newPriority;
    updateRecord_(SHEETS.TICKETS, ticketEntry.rowNumber, fields);

    recordHistorySafely_({
      ticketNumber: ticketNumber,
      eventType: 'CAMBIO_PRIORIDAD',
      responsible: user.correo,
      field: 'prioridad',
      oldValue: oldPriority,
      newValue: newPriority,
      detail: cleanCellText_(data.detalle || 'Prioridad actualizada.')
    });

    return mapTicket_(findTicketByNumber_(ticketNumber).data, getTechnicianNameMap_());
  });
}

/** Cambia el estado respetando las transiciones permitidas. */
function changeStatus_(request) {
  var user = requireRoles_(request, ROLES);
  var data = request.data || {};
  var ticketNumber = requireString_(data, 'numeroTicket', 'No. Ticket');
  var newStatus = normalizeTicketStatus_(requireString_(data, 'nuevoEstado', 'Nuevo estado'));

  if (newStatus === TICKET_STATUS.RESOLVED) {
    throw appError_(
      'USE_FINISH_TICKET',
      'Para resolver un ticket utiliza finishTicket e incluye la resolución.'
    );
  }

  return withScriptLock_(function () {
    var ticketEntry = findTicketByNumber_(ticketNumber);
    assertTicketAccess_(user, ticketEntry);

    var oldStatus = normalizeTicketStatus_(ticketEntry.data[HEADERS.TICKETS.STATUS]);

    if (user.rol === 'TECNICO' && [TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELLED].indexOf(newStatus) !== -1) {
      throw appError_('FORBIDDEN', 'Un técnico no puede cerrar ni cancelar tickets.');
    }

    assertStatusTransition_(oldStatus, newStatus);

    var fields = {};
    fields[HEADERS.TICKETS.STATUS] = newStatus;
    updateRecord_(SHEETS.TICKETS, ticketEntry.rowNumber, fields);

    recordHistorySafely_({
      ticketNumber: ticketNumber,
      eventType: 'CAMBIO_ESTADO',
      responsible: user.correo,
      field: 'estado',
      oldValue: oldStatus,
      newValue: newStatus,
      detail: cleanCellText_(data.detalle || 'Estado actualizado.')
    });

    return mapTicket_(findTicketByNumber_(ticketNumber).data, getTechnicianNameMap_());
  });
}

/** Finaliza un ticket y obliga a registrar la solucion aplicada. */
function finishTicket_(request) {
  var user = requireRoles_(request, ROLES);
  var data = request.data || {};
  var ticketNumber = requireString_(data, 'numeroTicket', 'No. Ticket');
  var resolution = requireString_(data, 'resolucion', 'Resolución');

  return withScriptLock_(function () {
    var ticketEntry = findTicketByNumber_(ticketNumber);
    assertTicketAccess_(user, ticketEntry);

    var oldStatus = normalizeTicketStatus_(ticketEntry.data[HEADERS.TICKETS.STATUS]);
    var allowed = [TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.PENDING];

    if (allowed.indexOf(oldStatus) === -1) {
      throw appError_(
        'INVALID_TICKET_STATE',
        'El ticket debe estar EN PROCESO o PENDIENTE para poder resolverlo.'
      );
    }

    var fields = {};
    fields[HEADERS.TICKETS.STATUS] = TICKET_STATUS.RESOLVED;
    fields[HEADERS.TICKETS.RESOLVED_AT] = new Date();
    fields[HEADERS.TICKETS.RESOLUTION] = cleanCellText_(resolution);

    if (hasOwn_(data, 'observaciones')) {
      fields[HEADERS.TICKETS.OBSERVATIONS] = cleanCellText_(data.observaciones);
    }

    updateRecord_(SHEETS.TICKETS, ticketEntry.rowNumber, fields);

    recordHistorySafely_({
      ticketNumber: ticketNumber,
      eventType: 'RESOLUCION',
      responsible: user.correo,
      field: 'estado',
      oldValue: oldStatus,
      newValue: TICKET_STATUS.RESOLVED,
      detail: cleanCellText_(resolution)
    });

    return mapTicket_(findTicketByNumber_(ticketNumber).data, getTechnicianNameMap_());
  });
}

/** Reabre un ticket resuelto o cerrado. Accion exclusiva del administrador. */
function reopenTicket_(request) {
  var user = requireRoles_(request, ['ADMINISTRADOR']);
  var data = request.data || {};
  var ticketNumber = requireString_(data, 'numeroTicket', 'No. Ticket');
  var reason = requireString_(data, 'motivo', 'Motivo de reapertura');

  return withScriptLock_(function () {
    var ticketEntry = findTicketByNumber_(ticketNumber);
    var oldStatus = normalizeTicketStatus_(ticketEntry.data[HEADERS.TICKETS.STATUS]);

    if ([TICKET_STATUS.RESOLVED, TICKET_STATUS.CLOSED].indexOf(oldStatus) === -1) {
      throw appError_('INVALID_TICKET_STATE', 'Solo se pueden reabrir tickets resueltos o cerrados.');
    }

    var oldResolution = String(ticketEntry.data[HEADERS.TICKETS.RESOLUTION] || '');
    var fields = {};
    fields[HEADERS.TICKETS.STATUS] = TICKET_STATUS.IN_PROGRESS;
    fields[HEADERS.TICKETS.RESOLVED_AT] = '';
    fields[HEADERS.TICKETS.RESOLUTION] = '';
    updateRecord_(SHEETS.TICKETS, ticketEntry.rowNumber, fields);

    recordHistorySafely_({
      ticketNumber: ticketNumber,
      eventType: 'REAPERTURA',
      responsible: user.correo,
      field: 'estado',
      oldValue: oldStatus,
      newValue: TICKET_STATUS.IN_PROGRESS,
      detail: cleanCellText_(reason + (oldResolution ? ' | Resolución anterior: ' + oldResolution : ''))
    });

    return mapTicket_(findTicketByNumber_(ticketNumber).data, getTechnicianNameMap_());
  });
}

/** Cancela un ticket sin eliminar su informacion. */
function cancelTicket_(request) {
  var user = requireRoles_(request, ['ADMINISTRADOR']);
  var data = request.data || {};
  var ticketNumber = requireString_(data, 'numeroTicket', 'No. Ticket');
  var reason = requireString_(data, 'motivo', 'Motivo de cancelación');

  return withScriptLock_(function () {
    var ticketEntry = findTicketByNumber_(ticketNumber);
    var oldStatus = normalizeTicketStatus_(ticketEntry.data[HEADERS.TICKETS.STATUS]);

    if ([TICKET_STATUS.RESOLVED, TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELLED].indexOf(oldStatus) !== -1) {
      throw appError_('INVALID_TICKET_STATE', 'El ticket ya se encuentra finalizado o cancelado.');
    }

    var fields = {};
    fields[HEADERS.TICKETS.STATUS] = TICKET_STATUS.CANCELLED;
    updateRecord_(SHEETS.TICKETS, ticketEntry.rowNumber, fields);

    recordHistorySafely_({
      ticketNumber: ticketNumber,
      eventType: 'CANCELACION',
      responsible: user.correo,
      field: 'estado',
      oldValue: oldStatus,
      newValue: TICKET_STATUS.CANCELLED,
      detail: cleanCellText_(reason)
    });

    return mapTicket_(findTicketByNumber_(ticketNumber).data, getTechnicianNameMap_());
  });
}

/** Agrega una observacion fechada sin sustituir las observaciones anteriores. */
function addTicketComment_(request) {
  var user = requireRoles_(request, ROLES);
  var data = request.data || {};
  var ticketNumber = requireString_(data, 'numeroTicket', 'No. Ticket');
  var comment = requireString_(data, 'comentario', 'Comentario');

  return withScriptLock_(function () {
    var ticketEntry = findTicketByNumber_(ticketNumber);
    assertTicketAccess_(user, ticketEntry);

    var previousObservations = String(
      ticketEntry.data[HEADERS.TICKETS.OBSERVATIONS] || ''
    );
    var newLine = '[' + formatDateTime_(new Date()) + '] ' + user.correo + ': ' + comment;
    var updatedObservations = previousObservations
      ? previousObservations + '\n' + newLine
      : newLine;

    var fields = {};
    fields[HEADERS.TICKETS.OBSERVATIONS] = cleanCellText_(updatedObservations);
    updateRecord_(SHEETS.TICKETS, ticketEntry.rowNumber, fields);

    recordHistorySafely_({
      ticketNumber: ticketNumber,
      eventType: 'COMENTARIO',
      responsible: user.correo,
      field: 'observaciones',
      oldValue: '',
      newValue: cleanCellText_(comment),
      detail: cleanCellText_(comment)
    });

    return mapTicket_(findTicketByNumber_(ticketNumber).data, getTechnicianNameMap_());
  });
}


// ============================================================================
// 11. CRUD DE TECNICOS
// ============================================================================

function getTechnicians_(request, activeOnly) {
  requireRoles_(request, ['ADMINISTRADOR']);

  return readRecords_(SHEETS.TECHNICIANS, HEADERS.TECHNICIANS.ID)
    .filter(function (entry) {
      return !activeOnly || normalizeRecordStatus_(entry.data[HEADERS.TECHNICIANS.STATUS]) === 'ACTIVO';
    })
    .map(function (entry) {
      return mapTechnician_(entry.data);
    });
}

function getTechnician_(request) {
  requireRoles_(request, ['ADMINISTRADOR']);
  var technicianId = requireString_(request, 'idTecnico', 'ID Técnico');
  return mapTechnician_(findTechnicianById_(technicianId).data);
}

function createTechnician_(request) {
  requireRoles_(request, ['ADMINISTRADOR']);
  var data = request.data || {};
  var name = requireString_(data, 'nombreCompleto', 'Nombre completo');
  var email = normalizeEmail_(requireString_(data, 'correo', 'Correo electrónico'));
  var phone = cleanCellText_(data.telefono || '');
  var specialty = cleanCellText_(data.especialidad || '');

  if (!isValidEmail_(email)) {
    throw appError_('INVALID_EMAIL', 'El correo del técnico no es válido.');
  }

  return withScriptLock_(function () {
    assertUniqueTechnicianEmail_(email, '');

    var technicianId = generateSequentialId_(
      SHEETS.TECHNICIANS,
      HEADERS.TECHNICIANS.ID,
      'TEC-',
      4
    );
    var now = new Date();

    appendRecord_(SHEETS.TECHNICIANS, {
      'ID Técnico': technicianId,
      'Nombre Completo': cleanCellText_(name),
      'Correo Electrónico': email,
      'Teléfono': phone,
      'Especialidad': specialty,
      'Estado': 'ACTIVO',
      'Fecha Creación': now,
      'Fecha Actualización': now
    });

    return mapTechnician_(findTechnicianById_(technicianId).data);
  });
}

function updateTechnician_(request) {
  requireRoles_(request, ['ADMINISTRADOR']);
  var data = request.data || {};
  var technicianId = requireString_(data, 'idTecnico', 'ID Técnico');

  return withScriptLock_(function () {
    var technicianEntry = findTechnicianById_(technicianId);
    var fields = {};

    if (hasOwn_(data, 'nombreCompleto')) {
      fields[HEADERS.TECHNICIANS.NAME] = cleanCellText_(
        requireString_(data, 'nombreCompleto', 'Nombre completo')
      );
    }

    if (hasOwn_(data, 'correo')) {
      var email = normalizeEmail_(requireString_(data, 'correo', 'Correo electrónico'));
      if (!isValidEmail_(email)) {
        throw appError_('INVALID_EMAIL', 'El correo del técnico no es válido.');
      }
      assertUniqueTechnicianEmail_(email, technicianId);
      fields[HEADERS.TECHNICIANS.EMAIL] = email;
    }

    if (hasOwn_(data, 'telefono')) {
      fields[HEADERS.TECHNICIANS.PHONE] = cleanCellText_(data.telefono);
    }

    if (hasOwn_(data, 'especialidad')) {
      fields[HEADERS.TECHNICIANS.SPECIALTY] = cleanCellText_(data.especialidad);
    }

    if (Object.keys(fields).length === 0) {
      throw appError_('NO_CHANGES', 'No se recibieron cambios para actualizar.');
    }

    fields[HEADERS.TECHNICIANS.UPDATED_AT] = new Date();
    updateRecord_(SHEETS.TECHNICIANS, technicianEntry.rowNumber, fields);

    return mapTechnician_(findTechnicianById_(technicianId).data);
  });
}

/**
 * Eliminacion logica: conserva al tecnico para no romper el historial.
 * Se bloquea si todavia tiene tickets abiertos.
 */
function deleteTechnician_(request) {
  requireRoles_(request, ['ADMINISTRADOR']);
  var data = request.data || {};
  var technicianId = requireString_(data, 'idTecnico', 'ID Técnico');

  return withScriptLock_(function () {
    var technicianEntry = findTechnicianById_(technicianId);
    var currentStatus = normalizeRecordStatus_(
      technicianEntry.data[HEADERS.TECHNICIANS.STATUS]
    );

    if (currentStatus === 'INACTIVO') {
      throw appError_('NO_CHANGES', 'El técnico ya se encuentra inactivo.');
    }

    var openTickets = getOpenTicketsForTechnician_(technicianId);
    if (openTickets.length > 0) {
      throw appError_(
        'TECHNICIAN_HAS_OPEN_TICKETS',
        'El técnico tiene ' + openTickets.length + ' ticket(s) abierto(s). Reasígnalos antes de desactivarlo.'
      );
    }

    var fields = {};
    fields[HEADERS.TECHNICIANS.STATUS] = 'INACTIVO';
    fields[HEADERS.TECHNICIANS.UPDATED_AT] = new Date();
    updateRecord_(SHEETS.TECHNICIANS, technicianEntry.rowNumber, fields);

    // Los accesos vinculados tambien se desactivan para evitar ingresos.
    deactivateUsersLinkedToTechnician_(technicianId);

    return mapTechnician_(findTechnicianById_(technicianId).data);
  });
}

function reactivateTechnician_(request) {
  requireRoles_(request, ['ADMINISTRADOR']);
  var data = request.data || {};
  var technicianId = requireString_(data, 'idTecnico', 'ID Técnico');

  return withScriptLock_(function () {
    var technicianEntry = findTechnicianById_(technicianId);
    var currentStatus = normalizeRecordStatus_(
      technicianEntry.data[HEADERS.TECHNICIANS.STATUS]
    );

    if (currentStatus === 'ACTIVO') {
      throw appError_('NO_CHANGES', 'El técnico ya se encuentra activo.');
    }

    var fields = {};
    fields[HEADERS.TECHNICIANS.STATUS] = 'ACTIVO';
    fields[HEADERS.TECHNICIANS.UPDATED_AT] = new Date();
    updateRecord_(SHEETS.TECHNICIANS, technicianEntry.rowNumber, fields);

    // El usuario se reactiva por separado para que la decision sea explicita.
    return mapTechnician_(findTechnicianById_(technicianId).data);
  });
}


// ============================================================================
// 12. CRUD DE USUARIOS
// ============================================================================

function getUsers_(request) {
  requireRoles_(request, ['ADMINISTRADOR']);

  return readRecords_(SHEETS.USERS, HEADERS.USERS.ID).map(function (entry) {
    return mapUser_(entry.data);
  });
}

function createUser_(request) {
  requireRoles_(request, ['ADMINISTRADOR']);
  var data = request.data || {};
  var email = normalizeEmail_(requireString_(data, 'correo', 'Correo'));
  var role = normalizeRole_(requireString_(data, 'rol', 'Rol'));
  var technicianId = String(data.idTecnico || '').trim();
  var temporaryPassword = String(data.contrasenaTemporal || '');

  if (!isValidEmail_(email)) {
    throw appError_('INVALID_EMAIL', 'El correo del usuario no es válido.');
  }

  validatePasswordStrength_(temporaryPassword);
  validateUserTechnicianRelation_(role, technicianId);

  return withScriptLock_(function () {
    assertUniqueUserEmail_(email, '');

    var userId = generateSequentialId_(
      SHEETS.USERS,
      HEADERS.USERS.ID,
      'USR-',
      4
    );
    var passwordSalt = createRandomSecret_();

    appendRecord_(SHEETS.USERS, {
      'ID Usuario': userId,
      'Correo': email,
      'Hash Contraseña': hashPassword_(temporaryPassword, passwordSalt),
      'Salt Contraseña': passwordSalt,
      'Rol': role,
      'ID Técnico': role === 'TECNICO' ? technicianId : '',
      'Estado': 'ACTIVO',
      'Intentos Fallidos': 0,
      'Bloqueado Hasta': '',
      'Hash Sesión': '',
      'Expiración Sesión': '',
      'Debe Cambiar Contraseña': 'SI'
    });

    return mapUser_(findUserById_(userId).data);
  });
}

function updateUser_(request) {
  var actor = requireRoles_(request, ['ADMINISTRADOR']);
  var data = request.data || {};
  var userId = requireString_(data, 'idUsuario', 'ID Usuario');

  return withScriptLock_(function () {
    var userEntry = findUserById_(userId);
    var oldRole = normalizeRole_(userEntry.data[HEADERS.USERS.ROLE]);
    var newEmail = hasOwn_(data, 'correo')
      ? normalizeEmail_(requireString_(data, 'correo', 'Correo'))
      : normalizeEmail_(userEntry.data[HEADERS.USERS.EMAIL]);
    var newRole = hasOwn_(data, 'rol')
      ? normalizeRole_(requireString_(data, 'rol', 'Rol'))
      : oldRole;
    var newTechnicianId = hasOwn_(data, 'idTecnico')
      ? String(data.idTecnico || '').trim()
      : String(userEntry.data[HEADERS.USERS.TECHNICIAN_ID] || '').trim();

    if (!isValidEmail_(newEmail)) {
      throw appError_('INVALID_EMAIL', 'El correo del usuario no es válido.');
    }

    if (actor.idUsuario === userId && oldRole !== newRole) {
      throw appError_('SELF_ROLE_CHANGE', 'No puedes cambiar tu propio rol.');
    }

    if (oldRole === 'ADMINISTRADOR' && newRole !== 'ADMINISTRADOR') {
      assertAnotherActiveAdministrator_(userId);
    }

    validateUserTechnicianRelation_(newRole, newTechnicianId);
    assertUniqueUserEmail_(newEmail, userId);

    var fields = {};
    fields[HEADERS.USERS.EMAIL] = newEmail;
    fields[HEADERS.USERS.ROLE] = newRole;
    fields[HEADERS.USERS.TECHNICIAN_ID] = newRole === 'TECNICO' ? newTechnicianId : '';
    updateRecord_(SHEETS.USERS, userEntry.rowNumber, fields);

    return mapUser_(findUserById_(userId).data);
  });
}

function deactivateUser_(request) {
  var actor = requireRoles_(request, ['ADMINISTRADOR']);
  var data = request.data || {};
  var userId = requireString_(data, 'idUsuario', 'ID Usuario');

  if (actor.idUsuario === userId) {
    throw appError_('SELF_DEACTIVATION', 'No puedes desactivar tu propio usuario.');
  }

  return withScriptLock_(function () {
    var userEntry = findUserById_(userId);
    var currentStatus = normalizeRecordStatus_(userEntry.data[HEADERS.USERS.STATUS]);
    var role = normalizeRole_(userEntry.data[HEADERS.USERS.ROLE]);

    if (currentStatus === 'INACTIVO') {
      throw appError_('NO_CHANGES', 'El usuario ya se encuentra inactivo.');
    }

    if (role === 'ADMINISTRADOR') {
      assertAnotherActiveAdministrator_(userId);
    }

    var fields = {};
    fields[HEADERS.USERS.STATUS] = 'INACTIVO';
    fields[HEADERS.USERS.SESSION_HASH] = '';
    fields[HEADERS.USERS.SESSION_EXPIRES_AT] = '';
    updateRecord_(SHEETS.USERS, userEntry.rowNumber, fields);

    return mapUser_(findUserById_(userId).data);
  });
}

function reactivateUser_(request) {
  requireRoles_(request, ['ADMINISTRADOR']);
  var data = request.data || {};
  var userId = requireString_(data, 'idUsuario', 'ID Usuario');

  return withScriptLock_(function () {
    var userEntry = findUserById_(userId);
    var currentStatus = normalizeRecordStatus_(userEntry.data[HEADERS.USERS.STATUS]);
    var role = normalizeRole_(userEntry.data[HEADERS.USERS.ROLE]);
    var technicianId = String(userEntry.data[HEADERS.USERS.TECHNICIAN_ID] || '').trim();

    if (currentStatus === 'ACTIVO') {
      throw appError_('NO_CHANGES', 'El usuario ya se encuentra activo.');
    }

    validateUserTechnicianRelation_(role, technicianId);

    var fields = {};
    fields[HEADERS.USERS.STATUS] = 'ACTIVO';
    updateRecord_(SHEETS.USERS, userEntry.rowNumber, fields);

    return mapUser_(findUserById_(userId).data);
  });
}

/**
 * Permite al administrador establecer una contraseña temporal nueva.
 * Todas las sesiones anteriores se invalidan y el usuario debera cambiarla en
 * su siguiente ingreso.
 */
function resetUserPassword_(request) {
  requireRoles_(request, ['ADMINISTRADOR']);
  var data = request.data || {};
  var userId = requireString_(data, 'idUsuario', 'ID Usuario');
  var temporaryPassword = String(data.contrasenaTemporal || '');

  validatePasswordStrength_(temporaryPassword);

  return withScriptLock_(function () {
    var userEntry = findUserById_(userId);
    var newSalt = createRandomSecret_();
    var fields = {};
    fields[HEADERS.USERS.PASSWORD_SALT] = newSalt;
    fields[HEADERS.USERS.PASSWORD_HASH] = hashPassword_(temporaryPassword, newSalt);
    fields[HEADERS.USERS.FAILED_ATTEMPTS] = 0;
    fields[HEADERS.USERS.LOCKED_UNTIL] = '';
    fields[HEADERS.USERS.SESSION_HASH] = '';
    fields[HEADERS.USERS.SESSION_EXPIRES_AT] = '';
    fields[HEADERS.USERS.MUST_CHANGE_PASSWORD] = 'SI';
    updateRecord_(SHEETS.USERS, userEntry.rowNumber, fields);

    return mapUser_(findUserById_(userId).data);
  });
}


// ============================================================================
// 13. HISTORIAL DE TICKETS
// ============================================================================

/**
 * Inserta un movimiento. Se utiliza una fila por cada campo modificado.
 * Esta funcion se ejecuta dentro del mismo bloqueo de la operacion principal.
 */
function recordHistory_(event) {
  var historyId = generateSequentialId_(
    SHEETS.HISTORY,
    HEADERS.HISTORY.ID,
    'HIS-',
    6
  );

  appendRecord_(SHEETS.HISTORY, {
    'ID Historial': historyId,
    'No. Ticket': event.ticketNumber,
    'Fecha/Hora': new Date(),
    'Tipo Evento': cleanCellText_(event.eventType),
    'Responsable': cleanCellText_(event.responsible),
    'Campo Modificado': cleanCellText_(event.field || ''),
    'Valor Anterior': cleanCellText_(event.oldValue || ''),
    'Valor Nuevo': cleanCellText_(event.newValue || ''),
    'Detalle': cleanCellText_(event.detail || '')
  });
}

/**
 * El historial no debe provocar que el frontend repita una operacion que ya
 * actualizo el ticket. Si el registro historico falla, el error queda en los
 * registros de ejecucion para ser corregido mediante validateBackendSetup().
 */
function recordHistorySafely_(event) {
  try {
    recordHistory_(event);
  } catch (error) {
    console.error('No se pudo registrar el historial: ' + error.message);
  }
}


// ============================================================================
// 14. ARCHIVOS ADJUNTOS
// ============================================================================

/** Convierte adjuntos enviados como arreglo o como texto JSON. */
function normalizeAttachments_(attachments) {
  if (typeof attachments === 'string') {
    if (!attachments.trim()) {
      return [];
    }

    try {
      attachments = JSON.parse(attachments);
    } catch (error) {
      throw appError_('INVALID_ATTACHMENTS', 'El campo adjuntos no contiene JSON válido.');
    }
  }

  if (!Array.isArray(attachments)) {
    throw appError_('INVALID_ATTACHMENTS', 'Adjuntos debe ser un arreglo.');
  }

  if (attachments.length > CONFIG.MAX_ATTACHMENTS) {
    throw appError_(
      'TOO_MANY_ATTACHMENTS',
      'Solo se permiten ' + CONFIG.MAX_ATTACHMENTS + ' archivos adjuntos.'
    );
  }

  return attachments;
}

/**
 * Guarda archivos Base64 en Drive.
 * Cada elemento debe incluir: name, mimeType y data (Base64 o Data URL).
 */
function uploadAttachments_(attachments, ticketNumber) {
  if (!attachments.length) {
    return [];
  }

  if (!CONFIG.ATTACHMENTS_FOLDER_ID) {
    throw appError_(
      'ATTACHMENTS_DISABLED',
      'Configura CONFIG.ATTACHMENTS_FOLDER_ID antes de enviar adjuntos.'
    );
  }

  var folder = DriveApp.getFolderById(CONFIG.ATTACHMENTS_FOLDER_ID);

  return attachments.map(function (attachment, index) {
    var originalName = String(attachment.name || ('archivo-' + (index + 1))).trim();
    var mimeType = String(attachment.mimeType || 'application/octet-stream').trim();
    var base64Data = String(attachment.data || attachment.base64 || '').trim();

    if (!base64Data) {
      throw appError_('INVALID_ATTACHMENT', 'Uno de los adjuntos no contiene datos.');
    }

    // Si se recibio una Data URL, se elimina el prefijo data:...;base64,.
    if (base64Data.indexOf(',') !== -1 && base64Data.indexOf('base64') !== -1) {
      base64Data = base64Data.substring(base64Data.indexOf(',') + 1);
    }

    var bytes;
    try {
      bytes = Utilities.base64Decode(base64Data);
    } catch (error) {
      throw appError_('INVALID_ATTACHMENT', 'Uno de los adjuntos no contiene Base64 válido.');
    }

    if (bytes.length > CONFIG.MAX_ATTACHMENT_BYTES) {
      throw appError_(
        'ATTACHMENT_TOO_LARGE',
        'El archivo ' + originalName + ' supera el tamaño máximo permitido.'
      );
    }

    var safeName = sanitizeFileName_(ticketNumber + '-' + (index + 1) + '-' + originalName);
    var blob = Utilities.newBlob(bytes, mimeType, safeName);
    var driveFile = folder.createFile(blob);

    // No se cambia la visibilidad del archivo. Hereda la seguridad de la carpeta.
    return {
      id: driveFile.getId(),
      nombre: driveFile.getName(),
      url: driveFile.getUrl(),
      mimeType: driveFile.getMimeType()
    };
  });
}


// ============================================================================
// 15. FUNCIONES DE BUSQUEDA Y VALIDACION DEL NEGOCIO
// ============================================================================

function findTicketByNumber_(ticketNumber) {
  var normalized = String(ticketNumber || '').trim();
  var entry = findRecord_(SHEETS.TICKETS, HEADERS.TICKETS.NUMBER, function (record) {
    return String(record.data[HEADERS.TICKETS.NUMBER]).trim() === normalized;
  });

  if (!entry) {
    throw appError_('TICKET_NOT_FOUND', 'No se encontró el ticket ' + normalized + '.');
  }

  return entry;
}

function findTechnicianById_(technicianId) {
  var normalized = String(technicianId || '').trim();
  var entry = findRecord_(SHEETS.TECHNICIANS, HEADERS.TECHNICIANS.ID, function (record) {
    return String(record.data[HEADERS.TECHNICIANS.ID]).trim() === normalized;
  });

  if (!entry) {
    throw appError_('TECHNICIAN_NOT_FOUND', 'No se encontró el técnico ' + normalized + '.');
  }

  return entry;
}

function findUserById_(userId) {
  var normalized = String(userId || '').trim();
  var entry = findRecord_(SHEETS.USERS, HEADERS.USERS.ID, function (record) {
    return String(record.data[HEADERS.USERS.ID]).trim() === normalized;
  });

  if (!entry) {
    throw appError_('USER_NOT_FOUND', 'No se encontró el usuario ' + normalized + '.');
  }

  return entry;
}

function assertUniqueTechnicianEmail_(email, excludedTechnicianId) {
  var duplicate = findRecord_(SHEETS.TECHNICIANS, HEADERS.TECHNICIANS.ID, function (record) {
    var recordId = String(record.data[HEADERS.TECHNICIANS.ID]).trim();
    return recordId !== excludedTechnicianId &&
      normalizeEmail_(record.data[HEADERS.TECHNICIANS.EMAIL]) === email;
  });

  if (duplicate) {
    throw appError_('DUPLICATE_EMAIL', 'Ya existe un técnico con ese correo.');
  }
}

function assertUniqueUserEmail_(email, excludedUserId) {
  var duplicate = findRecord_(SHEETS.USERS, HEADERS.USERS.ID, function (record) {
    var recordId = String(record.data[HEADERS.USERS.ID]).trim();
    return recordId !== excludedUserId &&
      normalizeEmail_(record.data[HEADERS.USERS.EMAIL]) === email;
  });

  if (duplicate) {
    throw appError_('DUPLICATE_EMAIL', 'Ya existe un usuario con ese correo.');
  }
}

function validateUserTechnicianRelation_(role, technicianId) {
  if (role !== 'TECNICO') {
    return;
  }

  if (!technicianId) {
    throw appError_('TECHNICIAN_REQUIRED', 'Un usuario técnico debe estar vinculado a un técnico.');
  }

  var technicianEntry = findTechnicianById_(technicianId);
  var status = normalizeRecordStatus_(technicianEntry.data[HEADERS.TECHNICIANS.STATUS]);

  if (status !== 'ACTIVO') {
    throw appError_('TECHNICIAN_INACTIVE', 'El técnico vinculado se encuentra inactivo.');
  }
}

function assertAnotherActiveAdministrator_(excludedUserId) {
  var activeAdministrators = readRecords_(SHEETS.USERS, HEADERS.USERS.ID)
    .filter(function (entry) {
      var id = String(entry.data[HEADERS.USERS.ID]).trim();
      var role = normalizeRole_(entry.data[HEADERS.USERS.ROLE]);
      var status = normalizeRecordStatus_(entry.data[HEADERS.USERS.STATUS]);
      return id !== excludedUserId && role === 'ADMINISTRADOR' && status === 'ACTIVO';
    });

  if (activeAdministrators.length === 0) {
    throw appError_(
      'LAST_ADMINISTRATOR',
      'Debe permanecer al menos un administrador activo en el sistema.'
    );
  }
}

function getOpenTicketsForTechnician_(technicianId) {
  var finalStatuses = [
    TICKET_STATUS.RESOLVED,
    TICKET_STATUS.CLOSED,
    TICKET_STATUS.CANCELLED
  ];

  return readRecords_(SHEETS.TICKETS, HEADERS.TICKETS.NUMBER).filter(function (entry) {
    var row = entry.data;
    var assignedId = String(row[HEADERS.TICKETS.TECHNICIAN_ID] || '').trim();
    var status = normalizeTicketStatus_(row[HEADERS.TICKETS.STATUS]);
    return assignedId === technicianId && finalStatuses.indexOf(status) === -1;
  });
}

function deactivateUsersLinkedToTechnician_(technicianId) {
  var users = readRecords_(SHEETS.USERS, HEADERS.USERS.ID);

  users.forEach(function (entry) {
    var linkedTechnicianId = String(
      entry.data[HEADERS.USERS.TECHNICIAN_ID] || ''
    ).trim();

    if (linkedTechnicianId === technicianId) {
      var fields = {};
      fields[HEADERS.USERS.STATUS] = 'INACTIVO';
      fields[HEADERS.USERS.SESSION_HASH] = '';
      fields[HEADERS.USERS.SESSION_EXPIRES_AT] = '';
      updateRecord_(SHEETS.USERS, entry.rowNumber, fields);
    }
  });
}

function assertStatusTransition_(oldStatus, newStatus) {
  if (oldStatus === newStatus) {
    throw appError_('NO_CHANGES', 'El ticket ya posee ese estado.');
  }

  var allowed = ALLOWED_STATUS_TRANSITIONS[oldStatus] || [];
  if (allowed.indexOf(newStatus) === -1) {
    throw appError_(
      'INVALID_STATUS_TRANSITION',
      'No se permite cambiar de ' + oldStatus + ' a ' + newStatus + '.'
    );
  }
}


// ============================================================================
// 16. ACCESO GENERICO A GOOGLE SHEETS
// ============================================================================

function validateMainConfiguration_() {
  if (
    !CONFIG.SPREADSHEET_ID ||
    CONFIG.SPREADSHEET_ID.indexOf('REEMPLAZA_') === 0
  ) {
    throw appError_(
      'CONFIG_ERROR',
      'Debes colocar el ID del Google Sheets en CONFIG.SPREADSHEET_ID.'
    );
  }
}

function getSpreadsheet_() {
  validateMainConfiguration_();
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function getSheet_(sheetName) {
  var sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) {
    throw appError_('SHEET_NOT_FOUND', 'No existe la hoja "' + sheetName + '".');
  }
  return sheet;
}

/** Valida una hoja y devuelve un pequeño resumen. */
function validateSheetSchema_(sheetName, requiredHeaders) {
  var sheet = getSheet_(sheetName);
  var headerMap = getHeaderMap_(sheet);
  var missing = requiredHeaders.filter(function (header) {
    return !hasOwn_(headerMap, header);
  });

  if (missing.length > 0) {
    throw appError_(
      'MISSING_HEADERS',
      'Faltan encabezados en ' + sheetName + ': ' + missing.join(', ')
    );
  }

  return {
    name: sheetName,
    valid: true,
    rows: Math.max(sheet.getLastRow() - 1, 0)
  };
}

/** Devuelve { nombreEncabezado: indiceBaseCero }. */
function getHeaderMap_(sheet) {
  var lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) {
    throw appError_('EMPTY_SHEET', 'La hoja ' + sheet.getName() + ' no contiene encabezados.');
  }

  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var map = {};

  headers.forEach(function (header, index) {
    var normalized = String(header || '').trim();
    if (normalized) {
      map[normalized] = index;
    }
  });

  return map;
}

/** Lee las filas y conserva su numero real para futuras actualizaciones. */
function readRecords_(sheetName, primaryHeader) {
  var sheet = getSheet_(sheetName);
  var headerMap = getHeaderMap_(sheet);

  if (!hasOwn_(headerMap, primaryHeader)) {
    throw appError_(
      'MISSING_HEADERS',
      'La hoja ' + sheetName + ' no contiene el encabezado ' + primaryHeader + '.'
    );
  }

  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 2) {
    return [];
  }

  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    .map(function (header) { return String(header || '').trim(); });
  var values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  var records = [];

  values.forEach(function (row, index) {
    if (!String(row[headerMap[primaryHeader]] || '').trim()) {
      return;
    }

    var data = {};
    headers.forEach(function (header, columnIndex) {
      if (header) {
        data[header] = row[columnIndex];
      }
    });

    records.push({ rowNumber: index + 2, data: data });
  });

  return records;
}

function findRecord_(sheetName, primaryHeader, predicate) {
  var records = readRecords_(sheetName, primaryHeader);
  for (var i = 0; i < records.length; i += 1) {
    if (predicate(records[i])) {
      return records[i];
    }
  }
  return null;
}

/** Inserta una fila respetando el orden actual de los encabezados. */
function appendRecord_(sheetName, valuesByHeader) {
  var sheet = getSheet_(sheetName);
  var lastColumn = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    .map(function (header) { return String(header || '').trim(); });

  var row = headers.map(function (header) {
    return hasOwn_(valuesByHeader, header) ? valuesByHeader[header] : '';
  });

  sheet.appendRow(row);
}

/** Actualiza una fila completa sin alterar columnas no incluidas. */
function updateRecord_(sheetName, rowNumber, fieldsByHeader) {
  var sheet = getSheet_(sheetName);
  var lastColumn = sheet.getLastColumn();
  var headerMap = getHeaderMap_(sheet);
  var row = sheet.getRange(rowNumber, 1, 1, lastColumn).getValues()[0];

  Object.keys(fieldsByHeader).forEach(function (header) {
    if (!hasOwn_(headerMap, header)) {
      throw appError_(
        'MISSING_HEADERS',
        'La hoja ' + sheetName + ' no contiene el encabezado ' + header + '.'
      );
    }
    row[headerMap[header]] = fieldsByHeader[header];
  });

  sheet.getRange(rowNumber, 1, 1, lastColumn).setValues([row]);
}

/** Genera IDs consecutivos sin depender del numero de fila. */
function generateSequentialId_(sheetName, idHeader, prefix, digits) {
  var records = readRecords_(sheetName, idHeader);
  var expression = new RegExp('^' + escapeRegExp_(prefix) + '(\\d+)$');
  var maximum = 0;

  records.forEach(function (entry) {
    var value = String(entry.data[idHeader] || '').trim();
    var match = value.match(expression);
    if (match) {
      maximum = Math.max(maximum, Number(match[1]));
    }
  });

  return prefix + padNumber_(maximum + 1, digits);
}

/** Evita IDs repetidos cuando dos usuarios guardan al mismo tiempo. */
function withScriptLock_(callback) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}


// ============================================================================
// 17. CONVERSION DE FILAS A OBJETOS JSON
// ============================================================================

function mapTicket_(row, technicianNames) {
  var technicianId = String(row[HEADERS.TICKETS.TECHNICIAN_ID] || '').trim();

  return {
    numeroTicket: String(row[HEADERS.TICKETS.NUMBER] || ''),
    fechaCreacion: formatCellDate_(row[HEADERS.TICKETS.CREATED_AT]),
    solicitante: String(row[HEADERS.TICKETS.REQUESTER] || ''),
    sede: String(row[HEADERS.TICKETS.SITE] || ''),
    area: String(row[HEADERS.TICKETS.AREA] || ''),
    tipo: String(row[HEADERS.TICKETS.TYPE] || ''),
    categoria: String(row[HEADERS.TICKETS.CATEGORY] || ''),
    descripcion: String(row[HEADERS.TICKETS.DESCRIPTION] || ''),
    adjuntos: parseAttachmentsCell_(row[HEADERS.TICKETS.ATTACHMENTS]),
    prioridad: normalizePriority_(row[HEADERS.TICKETS.PRIORITY]),
    estado: normalizeTicketStatus_(row[HEADERS.TICKETS.STATUS]),
    idTecnicoAsignado: technicianId,
    nombreTecnicoAsignado: technicianId && technicianNames
      ? (technicianNames[technicianId] || '')
      : '',
    fechaAsignacion: formatCellDate_(row[HEADERS.TICKETS.ASSIGNED_AT]),
    fechaResolucion: formatCellDate_(row[HEADERS.TICKETS.RESOLVED_AT]),
    resolucion: String(row[HEADERS.TICKETS.RESOLUTION] || ''),
    observaciones: String(row[HEADERS.TICKETS.OBSERVATIONS] || '')
  };
}

function mapTechnician_(row) {
  return {
    idTecnico: String(row[HEADERS.TECHNICIANS.ID] || ''),
    nombreCompleto: String(row[HEADERS.TECHNICIANS.NAME] || ''),
    correo: normalizeEmail_(row[HEADERS.TECHNICIANS.EMAIL]),
    telefono: String(row[HEADERS.TECHNICIANS.PHONE] || ''),
    especialidad: String(row[HEADERS.TECHNICIANS.SPECIALTY] || ''),
    estado: normalizeRecordStatus_(row[HEADERS.TECHNICIANS.STATUS]),
    fechaCreacion: formatCellDate_(row[HEADERS.TECHNICIANS.CREATED_AT]),
    fechaActualizacion: formatCellDate_(row[HEADERS.TECHNICIANS.UPDATED_AT])
  };
}

function mapUser_(row) {
  return {
    idUsuario: String(row[HEADERS.USERS.ID] || ''),
    correo: normalizeEmail_(row[HEADERS.USERS.EMAIL]),
    rol: normalizeRole_(row[HEADERS.USERS.ROLE]),
    idTecnico: String(row[HEADERS.USERS.TECHNICIAN_ID] || ''),
    estado: normalizeRecordStatus_(row[HEADERS.USERS.STATUS]),
    intentosFallidos: Number(row[HEADERS.USERS.FAILED_ATTEMPTS] || 0),
    bloqueadoHasta: formatCellDate_(row[HEADERS.USERS.LOCKED_UNTIL]),
    debeCambiarContrasena:
      normalizeYesNo_(row[HEADERS.USERS.MUST_CHANGE_PASSWORD]) === 'SI'
  };
}

function mapHistory_(row) {
  return {
    idHistorial: String(row[HEADERS.HISTORY.ID] || ''),
    numeroTicket: String(row[HEADERS.HISTORY.TICKET_NUMBER] || ''),
    fechaHora: formatCellDate_(row[HEADERS.HISTORY.CREATED_AT]),
    tipoEvento: String(row[HEADERS.HISTORY.EVENT_TYPE] || ''),
    responsable: String(row[HEADERS.HISTORY.RESPONSIBLE] || ''),
    campoModificado: String(row[HEADERS.HISTORY.FIELD] || ''),
    valorAnterior: String(row[HEADERS.HISTORY.OLD_VALUE] || ''),
    valorNuevo: String(row[HEADERS.HISTORY.NEW_VALUE] || ''),
    detalle: String(row[HEADERS.HISTORY.DETAIL] || '')
  };
}

function getTechnicianNameMap_() {
  var result = {};
  readRecords_(SHEETS.TECHNICIANS, HEADERS.TECHNICIANS.ID)
    .forEach(function (entry) {
      result[String(entry.data[HEADERS.TECHNICIANS.ID]).trim()] =
        String(entry.data[HEADERS.TECHNICIANS.NAME] || '');
    });
  return result;
}


// ============================================================================
// 18. NORMALIZACION Y VALIDACIONES GENERALES
// ============================================================================

function requireString_(object, property, label) {
  var value = object && object[property] !== undefined && object[property] !== null
    ? String(object[property]).trim()
    : '';

  if (!value) {
    throw appError_('VALIDATION_ERROR', 'El campo ' + label + ' es obligatorio.');
  }

  return value;
}

function normalizeTicketStatus_(value) {
  var normalized = normalizeUpper_(value).replace(/_/g, ' ');

  if (valuesOf_(TICKET_STATUS).indexOf(normalized) === -1) {
    throw appError_('INVALID_STATUS', 'Estado de ticket no válido: ' + value);
  }

  return normalized;
}

function normalizePriority_(value) {
  var normalized = removeAccents_(normalizeUpper_(value));

  if (PRIORITIES.indexOf(normalized) === -1) {
    throw appError_('INVALID_PRIORITY', 'Prioridad no válida: ' + value);
  }

  return normalized;
}

function normalizeRole_(value) {
  var normalized = removeAccents_(normalizeUpper_(value));
  if (normalized === 'ADMIN') {
    normalized = 'ADMINISTRADOR';
  }

  if (ROLES.indexOf(normalized) === -1) {
    throw appError_('INVALID_ROLE', 'Rol no válido: ' + value);
  }

  return normalized;
}

function normalizeRecordStatus_(value) {
  var normalized = normalizeUpper_(value);

  if (RECORD_STATUS.indexOf(normalized) === -1) {
    throw appError_('INVALID_RECORD_STATUS', 'Estado de registro no válido: ' + value);
  }

  return normalized;
}

function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

/** Exige una contraseña razonable para cuentas nuevas y restablecimientos. */
function validatePasswordStrength_(password) {
  password = String(password || '');

  if (password.length < CONFIG.MIN_PASSWORD_LENGTH) {
    throw appError_(
      'WEAK_PASSWORD',
      'La contraseña debe contener al menos ' + CONFIG.MIN_PASSWORD_LENGTH + ' caracteres.'
    );
  }

  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw appError_(
      'WEAK_PASSWORD',
      'La contraseña debe incluir una letra mayúscula, una minúscula y un número.'
    );
  }
}

/** Genera valores aleatorios para salts y tokens de sesion. */
function createRandomSecret_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

/**
 * El pepper se guarda en Script Properties y nunca en Google Sheets.
 * Si aun no existe, se genera automaticamente durante el bootstrap.
 */
function getAuthenticationPepper_() {
  var properties = PropertiesService.getScriptProperties();
  var pepper = properties.getProperty('AUTHENTICATION_PEPPER');

  if (!pepper) {
    pepper = createRandomSecret_() + createRandomSecret_();
    properties.setProperty('AUTHENTICATION_PEPPER', pepper);
  }

  return pepper;
}

/** Crea el hash irreversible que se guarda en la hoja Usuarios. */
function hashPassword_(password, salt) {
  return hmacSha256Hex_(
    'PASSWORD|' + String(salt) + '|' + String(password),
    getAuthenticationPepper_()
  );
}

/** Los tokens tambien se almacenan como hash, nunca en su forma utilizable. */
function hashSessionToken_(token) {
  return hmacSha256Hex_(
    'SESSION|' + String(token),
    getAuthenticationPepper_()
  );
}

function hmacSha256Hex_(value, key) {
  var bytes = Utilities.computeHmacSha256Signature(String(value), String(key));
  return bytesToHex_(bytes);
}

function bytesToHex_(bytes) {
  return bytes.map(function (byteValue) {
    var unsigned = byteValue < 0 ? byteValue + 256 : byteValue;
    return ('0' + unsigned.toString(16)).slice(-2);
  }).join('');
}

/** Comparacion de longitud constante aproximada para hashes hexadecimales. */
function secureEquals_(left, right) {
  left = String(left || '');
  right = String(right || '');

  if (!left || left.length !== right.length) {
    return false;
  }

  var difference = 0;
  for (var i = 0; i < left.length; i += 1) {
    difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return difference === 0;
}

function normalizeYesNo_(value) {
  if (value === true) {
    return 'SI';
  }
  if (value === false || value === '' || value === null || value === undefined) {
    return 'NO';
  }

  var normalized = removeAccents_(normalizeUpper_(value));
  if (['SI', 'YES', 'TRUE', '1'].indexOf(normalized) !== -1) {
    return 'SI';
  }
  if (['NO', 'FALSE', '0'].indexOf(normalized) !== -1) {
    return 'NO';
  }

  throw appError_('INVALID_BOOLEAN', 'Se esperaba un valor SI o NO.');
}

/** Convierte fechas provenientes de Sheets sin asumir que siempre son Date. */
function parseDateValue_(value) {
  if (!value) {
    return null;
  }

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value;
  }

  var parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeUpper_(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeForSearch_(value) {
  return removeAccents_(String(value || '').trim().toLowerCase());
}

function removeAccents_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Reduce el riesgo de formulas inyectadas mediante campos de texto. */
function cleanCellText_(value) {
  var text = String(value === undefined || value === null ? '' : value).trim();
  if (/^[=+\-@]/.test(text)) {
    return "'" + text;
  }
  return text;
}

function sanitizeFileName_(name) {
  return String(name || 'archivo')
    .replace(/[\\/:*?"<>|#%{}~]/g, '-')
    .substring(0, 180);
}

function parseAttachmentsCell_(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  try {
    var parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    // Compatibilidad con registros antiguos que guardaban URLs separadas.
    return String(value).split(/\n|,/).filter(Boolean).map(function (url) {
      return { url: url.trim() };
    });
  }
}


// ============================================================================
// 19. NORMALIZACION DE SOLICITUDES HTTP
// ============================================================================

function normalizeGetRequest_(e) {
  var parameters = e && e.parameter ? copyObject_(e.parameter) : {};
  parameters.action = String(parameters.action || 'health').trim();
  parameters.sessionToken = parameters.sessionToken || parameters.token || '';
  return parameters;
}

function normalizePostRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw appError_('EMPTY_BODY', 'La solicitud POST no contiene datos.');
  }

  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (error) {
    throw appError_('INVALID_JSON', 'El cuerpo de la solicitud no contiene JSON válido.');
  }

  var data = body.data && typeof body.data === 'object' ? body.data : body;
  var action = String(body.action || data.action || '').trim();

  if (!action) {
    throw appError_('ACTION_REQUIRED', 'Debes indicar la propiedad action.');
  }

  var request = {
    action: action,
    data: data,
    sessionToken:
      body.sessionToken || body.token || data.sessionToken || data.token || ''
  };

  // Las consultas reutilizadas por POST esperan sus filtros en request.
  Object.keys(data).forEach(function (key) {
    if (!hasOwn_(request, key)) {
      request[key] = data[key];
    }
  });

  return request;
}


// ============================================================================
// 20. RESPUESTAS Y UTILIDADES PEQUENAS
// ============================================================================

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorResponse_(error) {
  console.error(error && error.stack ? error.stack : error);

  return jsonResponse_({
    success: false,
    code: error && error.code ? error.code : 'INTERNAL_ERROR',
    message: error && error.message
      ? error.message
      : 'Ocurrió un error inesperado en el servidor.'
  });
}

function appError_(code, message) {
  var error = new Error(message);
  error.code = code;
  return error;
}

function formatDateTime_(date) {
  return Utilities.formatDate(date, CONFIG.TIME_ZONE, 'yyyy-MM-dd HH:mm:ss');
}

function formatCellDate_(value) {
  if (!value) {
    return '';
  }

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return formatDateTime_(value);
  }

  return String(value);
}

function padNumber_(number, length) {
  var text = String(number);
  while (text.length < length) {
    text = '0' + text;
  }
  return text;
}

function escapeRegExp_(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasOwn_(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property);
}

function copyObject_(object) {
  var copy = {};
  Object.keys(object || {}).forEach(function (key) {
    copy[key] = object[key];
  });
  return copy;
}

function valuesOf_(object) {
  return Object.keys(object).map(function (key) {
    return object[key];
  });
}
