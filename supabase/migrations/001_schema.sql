-- ═══════════════════════════════════════════════════════════
-- NORTE — Schema inicial
-- ═══════════════════════════════════════════════════════════

-- ── Profiles ────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  name        text not null,
  full_name   text not null default '',
  initials    text not null default '',
  color       text not null default 'emerald',
  role        text not null default 'Pro' check (role in ('Admin','Pro')),
  income      bigint not null default 0,
  created_by  uuid,
  created_at  timestamptz default now()
);

-- ── Categories (sobres) ──────────────────────────────────────
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  icon        text not null default 'tag',
  color       text not null default 'emerald',
  group_name  text not null check (group_name in ('Fijos','Variables','Ahorro')),
  assigned    bigint not null default 0,
  spent       bigint not null default 0,
  fixed       boolean not null default false,
  month       date not null default date_trunc('month', now()),
  created_at  timestamptz default now()
);

-- ── Accounts ────────────────────────────────────────────────
create table if not exists public.accounts (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  bank        text not null default '',
  type        text not null check (type in ('Cuenta','Crédito','Ahorro')),
  balance     bigint not null default 0,
  color       text not null default 'emerald',
  created_at  timestamptz default now()
);

-- ── Goals ───────────────────────────────────────────────────
create table if not exists public.goals (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  color       text not null default 'emerald',
  target      bigint not null,
  current     bigint not null default 0,
  monthly     bigint not null default 0,
  due         text,
  created_at  timestamptz default now()
);

-- ── Transactions ─────────────────────────────────────────────
create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  category_id   uuid references public.categories(id) on delete set null,
  account_id    uuid references public.accounts(id) on delete set null,
  name          text not null,
  amount        bigint not null,
  type          text not null check (type in ('gasto','ingreso','transfer')),
  recurring     boolean not null default false,
  source        text,
  date          date not null default now(),
  created_at    timestamptz default now()
);

-- ── Subscriptions ────────────────────────────────────────────
create table if not exists public.subscriptions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name        text not null,
  amount      bigint not null,
  day         int check (day between 1 and 31),
  color       text not null default 'emerald',
  used        text not null default 'medio' check (used in ('alto','medio','bajo')),
  created_at  timestamptz default now()
);

-- ── Upcoming ─────────────────────────────────────────────────
create table if not exists public.upcoming (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  subscription_id  uuid references public.subscriptions(id) on delete cascade,
  category_id      uuid references public.categories(id) on delete set null,
  account_id       uuid references public.accounts(id) on delete set null,
  name             text not null,
  amount           bigint not null,
  due_date         date not null,
  created_at       timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════
alter table public.profiles      enable row level security;
alter table public.categories    enable row level security;
alter table public.accounts      enable row level security;
alter table public.goals         enable row level security;
alter table public.transactions  enable row level security;
alter table public.subscriptions enable row level security;
alter table public.upcoming      enable row level security;

-- Helper: get the profile id(s) visible to the current user
-- Admin users can see all profiles; Pro users see only their own.
create or replace function public.visible_profile_ids()
returns setof uuid
language sql security definer stable
as $$
  select id from public.profiles
  where user_id = auth.uid()
     or (
       exists (
         select 1 from public.profiles
         where user_id = auth.uid() and role = 'Admin'
       )
     )
$$;

-- Profiles: Admin sees all, Pro sees own
create policy "profiles_select" on public.profiles
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles where user_id = auth.uid() and role = 'Admin')
  );

create policy "profiles_insert" on public.profiles
  for insert with check (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'Admin')
    or auth.uid() is not null  -- allow upsert_norte_profile to create own profile
  );

create policy "profiles_update" on public.profiles
  for update using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles where user_id = auth.uid() and role = 'Admin')
  );

create policy "profiles_delete" on public.profiles
  for delete using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'Admin')
    and user_id is distinct from auth.uid()
  );

-- Categories
create policy "categories_all" on public.categories
  for all using (profile_id in (select visible_profile_ids()));

-- Accounts
create policy "accounts_all" on public.accounts
  for all using (profile_id in (select visible_profile_ids()));

-- Goals
create policy "goals_all" on public.goals
  for all using (profile_id in (select visible_profile_ids()));

-- Transactions
create policy "transactions_all" on public.transactions
  for all using (profile_id in (select visible_profile_ids()));

-- Subscriptions
create policy "subscriptions_all" on public.subscriptions
  for all using (profile_id in (select visible_profile_ids()));

-- Upcoming
create policy "upcoming_all" on public.upcoming
  for all using (profile_id in (select visible_profile_ids()));

-- ═══════════════════════════════════════════════════════════
-- FUNCTION: upsert_norte_profile
-- Llamada en cada login. Crea o actualiza el perfil del usuario.
-- El email marcelo.moyav@gmail.com recibe rol Admin siempre.
-- ═══════════════════════════════════════════════════════════
create or replace function public.upsert_norte_profile(
  p_email       text,
  p_name        text,
  p_full_name   text,
  p_avatar_url  text default '',
  p_user_id     uuid default null
)
returns public.profiles
language plpgsql security definer
as $$
declare
  v_role    text := 'Pro';
  v_profile public.profiles;
  v_parts   text[];
  v_initials text;
begin
  -- Super-admin hardcoded
  if p_email = 'marcelo.moyav@gmail.com' then
    v_role := 'Admin';
  end if;

  -- Derive initials from full_name
  v_parts := regexp_split_to_array(trim(coalesce(p_full_name, p_name, '')), '\s+');
  v_initials := upper(left(v_parts[1], 1) || coalesce(left(v_parts[2], 1), ''));

  -- Upsert by user_id if provided, else by email match in full_name (shouldn't happen)
  insert into public.profiles (user_id, name, full_name, initials, color, role, income, created_by)
  values (
    p_user_id,
    split_part(p_name, ' ', 1),
    coalesce(nullif(p_full_name,''), p_name),
    coalesce(nullif(v_initials,''), upper(left(p_name,2))),
    'emerald',
    v_role,
    0,
    p_user_id
  )
  on conflict (user_id) where user_id is not null
  do update set
    name      = excluded.name,
    full_name = excluded.full_name,
    initials  = excluded.initials,
    role      = case when profiles.role = 'Admin' then 'Admin' else excluded.role end;

  select * into v_profile from public.profiles where user_id = p_user_id;
  return v_profile;
end;
$$;

-- Unique index on user_id for upsert to work (only for non-null user_id)
create unique index if not exists profiles_user_id_unique
  on public.profiles(user_id) where user_id is not null;

-- ═══════════════════════════════════════════════════════════
-- Seed default categories helper (call after profile creation)
-- ═══════════════════════════════════════════════════════════
create or replace function public.seed_default_categories(p_profile_id uuid)
returns void
language plpgsql security definer
as $$
declare
  v_month date := date_trunc('month', now());
begin
  insert into public.categories (profile_id, name, icon, color, group_name, assigned, spent, fixed, month)
  values
    (p_profile_id, 'Arriendo / Hipoteca', 'home',     'slate',   'Fijos',     0, 0, true,  v_month),
    (p_profile_id, 'Servicios',           'zap',      'amber',   'Fijos',     0, 0, true,  v_month),
    (p_profile_id, 'Suscripciones',       'repeat',   'violet',  'Fijos',     0, 0, true,  v_month),
    (p_profile_id, 'Supermercado',        'cart',     'emerald', 'Variables', 0, 0, false, v_month),
    (p_profile_id, 'Restaurantes',        'utensils', 'red',     'Variables', 0, 0, false, v_month),
    (p_profile_id, 'Transporte',          'car',      'blue',    'Variables', 0, 0, false, v_month),
    (p_profile_id, 'Salud',               'heart',    'emerald', 'Variables', 0, 0, false, v_month),
    (p_profile_id, 'Entretenimiento',     'film',     'blue',    'Variables', 0, 0, false, v_month),
    (p_profile_id, 'Personal',            'bag',      'violet',  'Variables', 0, 0, false, v_month),
    (p_profile_id, 'Ahorro y metas',      'target',   'emerald', 'Ahorro',    0, 0, true,  v_month)
  on conflict do nothing;
end;
$$;
