-- Registro de payloads que las funciones de ingesta no pudieron procesar,
-- para diagnóstico (los logs de edge functions son efímeros).
create table if not exists public.ingest_failures (
  id uuid primary key default gen_random_uuid(),
  fn text not null,
  reason text not null,
  payload jsonb,
  raw text,
  created_at timestamptz not null default now()
);
alter table public.ingest_failures enable row level security;
-- sin policies: solo service_role (igual que ingest_config)
