-- Compromisos mensuales: checklist de pagos esperados, siempre ligado a presupuesto.
-- Local por ahora; permite parear movimientos a una obligacion concreta sin multiplicar categorias.

create table if not exists public.monthly_commitments (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references public.profiles(id) on delete cascade,
  category_id         uuid not null references public.categories(id) on delete restrict,
  account_id          uuid references public.accounts(id) on delete set null,
  paid_transaction_id uuid references public.transactions(id) on delete set null,
  name                text not null,
  group_name          text not null default 'General',
  expected_amount     bigint not null default 0,
  actual_amount       bigint not null default 0,
  due_day             int check (due_day between 1 and 31),
  payment_method      text,
  matcher_hint        text,
  status              text not null default 'pendiente'
    check (status in ('pendiente','detectado','pagado','vencido','omitido')),
  month               date not null,
  created_at          timestamptz default now()
);

create index if not exists monthly_commitments_profile_month_idx
  on public.monthly_commitments(profile_id, month);

create index if not exists monthly_commitments_category_idx
  on public.monthly_commitments(category_id);

alter table public.monthly_commitments enable row level security;

drop policy if exists monthly_commitments_all on public.monthly_commitments;
create policy monthly_commitments_all on public.monthly_commitments
  for all
  using (profile_id in (select visible_profile_ids()))
  with check (profile_id in (select visible_profile_ids()));
