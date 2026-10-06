-- Ejecutar DESPUÉS de la importación existente. No crea ni reimporta las 4 tablas.
begin;
lock table public.usuarios, public.tecnicos, public.tickets, public.historial_tickets in share row exclusive mode;

-- La autenticación heredada vive en la Edge Function. Ningún cliente consulta
-- estas tablas directamente, incluso si se agregaron políticas permisivas antes.
alter table public.usuarios enable row level security;
alter table public.tecnicos enable row level security;
alter table public.tickets enable row level security;
alter table public.historial_tickets enable row level security;
revoke all on public.usuarios, public.tecnicos, public.tickets, public.historial_tickets from anon, authenticated, public;

alter table public.tickets alter column prioridad set default 'MEDIA';
alter table public.tickets alter column estado set default 'CREADO';

-- Fallará de forma atómica si la importación tiene correos duplicados al ignorar
-- mayúsculas y espacios. Resolver esos duplicados antes de repetir la migración.
create unique index if not exists ticketing_usuarios_email_unique on public.usuarios (lower(btrim(correo)));
create unique index if not exists ticketing_tecnicos_email_unique on public.tecnicos (lower(btrim(correo_electronico)));
create index if not exists ticketing_usuarios_session on public.usuarios (hash_sesion) where hash_sesion is not null;

-- La importación con IDs explícitos no siempre avanza la secuencia identity.
select setval(pg_get_serial_sequence('public.historial_tickets', 'id_historial'),
  greatest(coalesce((select max(id_historial) from public.historial_tickets), 0) + 1,
    nextval(pg_get_serial_sequence('public.historial_tickets', 'id_historial'))), false);

create schema if not exists ticketing_private;
revoke all on schema ticketing_private from public, anon, authenticated;
create table if not exists ticketing_private.rate_limits (
  key text primary key,
  expires_at timestamptz not null,
  hits integer not null
);
alter table ticketing_private.rate_limits enable row level security;
revoke all on ticketing_private.rate_limits from public, anon, authenticated;
commit;
