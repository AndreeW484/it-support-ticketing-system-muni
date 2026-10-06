import postgres from 'npm:postgres@3.4.7';
import { createBackend, hmac } from './core.js';
import { createRepository } from './repository.js';
import { createHandler } from './http.js';
import { createDrive } from './drive.js';

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta el secreto ${name}`);
  return value;
}
const pepper = required('AUTHENTICATION_PEPPER');
const sql = postgres(required('TICKETING_DATABASE_URL'), { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10, ssl: 'require' });
const execute = createBackend({ repo: createRepository(sql), pepper, drive: createDrive({ url: Deno.env.get('DRIVE_BRIDGE_URL'), secret: Deno.env.get('DRIVE_BRIDGE_SECRET') }) });

// Cuotas globales para operaciones públicas: persistentes, independientes de IP
// y compartidas por todas las instancias. El login también tiene bloqueo por cuenta.
const publicLimits: Record<string, number> = { login: 300, trackTicket: 600, createTicket: 60 };
const rateLimit = async (_request: Request, action: string) => {
  if (!(action in publicLimits)) return true;
  const bucket = Math.floor(Date.now() / 3600000);
  const key = await hmac(`RATE|${action}|${bucket}`, pepper);
  const result = await sql`
    insert into ticketing_private.rate_limits (key, expires_at, hits)
    values (${key}, now() + interval '2 hours', 1)
    on conflict (key) do update set hits = ticketing_private.rate_limits.hits + 1
    returning hits`;
  await sql`delete from ticketing_private.rate_limits where expires_at < now()`;
  return Number(result[0].hits) <= publicLimits[action];
};
Deno.serve(createHandler({ execute, allowedOrigins: required('ALLOWED_ORIGINS').split(',').map(value => value.trim()).filter(Boolean), rateLimit }));
