const tables = {
  tickets: { key: 'no_ticket', columns: ['no_ticket', 'fecha_hora_creacion', 'solicitante', 'sede', 'area_departamento', 'tipo', 'categoria', 'descripcion_detallada', 'adjuntos', 'prioridad', 'estado', 'tecnico_asignado', 'fecha_asignacion', 'fecha_resolucion', 'resolucion', 'observaciones'] },
  usuarios: { key: 'id_usuario', columns: ['id_usuario', 'correo', 'hash_contrasena', 'salt_contrasena', 'rol', 'id_tecnico', 'estado', 'intentos_fallidos', 'bloqueado_hasta', 'hash_sesion', 'expiracion_sesion', 'debe_cambiar_contrasena'] },
  tecnicos: { key: 'id_tecnico', columns: ['id_tecnico', 'nombre_completo', 'especialidad', 'correo_electronico', 'telefono', 'estado', 'fecha_creacion', 'fecha_actualizacion'] },
  historial_tickets: { key: 'id_historial', columns: ['no_ticket', 'fecha_hora', 'tipo_evento', 'responsable', 'campo_modificado', 'valor_anterior', 'valor_nuevo', 'detalle'] },
};
function schema(table, fields = {}) {
  if (!Object.hasOwn(tables, table) || Object.keys(fields).some(key => !tables[table].columns.includes(key))) throw new Error('Tabla o columna no permitida');
  return tables[table];
}
// Identificadores exclusivamente de la lista anterior. Valores siempre parametrizados.
export function transactionStore(query) {
  return {
    async list(table, where = {}) {
      schema(table, where);
      const keys = Object.keys(where);
      const conditions = keys.map((key, index) => key === 'correo' ? `lower(btrim("${key}")) = lower(btrim($${index + 1}))` : `"${key}" = $${index + 1}`);
      return query(`select * from public."${table}"${keys.length ? ` where ${conditions.join(' and ')}` : ''}`, Object.values(where));
    },
    async insert(table, values) {
      schema(table, values);
      const keys = Object.keys(values);
      const rows = await query(`insert into public."${table}" (${keys.map(k => `"${k}"`).join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')}) returning *`, Object.values(values));
      return rows[0];
    },
    async update(table, id, values) {
      const config = schema(table, values);
      const keys = Object.keys(values);
      const rows = await query(`update public."${table}" set ${keys.map((k, i) => `"${k}" = $${i + 1}`).join(',')} where "${config.key}" = $${keys.length + 1} returning *`, [...Object.values(values), id]);
      if (!rows[0]) throw new Error('Registro no encontrado durante la actualización');
      return rows[0];
    },
    async nextId(table, prefix) {
      const config = schema(table);
      if (table === 'historial_tickets' || !/^(TIC-\d{4}-|TEC-|USR-)$/.test(prefix)) throw new Error('Prefijo inválido');
      // Se ejecuta bajo el advisory lock de la transacción. Reconoce IDs importados.
      const rows = await query(`select coalesce(max(substring("${config.key}" from $1)::bigint), 0) + 1 as next from public."${table}" where "${config.key}" ~ $2`, [`^${prefix}([0-9]+)$`, `^${prefix}[0-9]+$`]);
      return `${prefix}${String(rows[0].next).padStart(4, '0')}`;
    },
  };
}
export function createRepository(sql) {
  return {
    transaction: callback => sql.begin(async tx => {
      await tx.unsafe("set local lock_timeout = '15s'");
      await tx.unsafe("set local statement_timeout = '20s'");
      // Todas las instancias de la función comparten este lock en Postgres.
      // Evita carreras en sesiones, contadores, IDs y transiciones.
      await tx.unsafe('select pg_advisory_xact_lock(763194207)');
      return callback(transactionStore((statement, parameters = []) => tx.unsafe(statement, parameters)));
    }),
  };
}
