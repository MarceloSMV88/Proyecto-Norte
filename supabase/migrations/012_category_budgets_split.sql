-- supabase/migrations/012_category_budgets_split.sql
-- Separa la identidad de la categoría (nombre/ícono/color/sección) de su presupuesto
-- mensual (assigned/spent). Antes categories tenía una fila por mes; ahora categories
-- es estable y category_budgets tiene la fila mensual. transactions y monthly_commitments
-- pasan a apuntar a la categoría estable en vez de a la fila-por-mes.

-- 1. Renombrar la tabla vieja — no se borra hasta confirmar el backfill (ver Task 1 Step 2).
alter table public.categories rename to categories_monthly_old;

-- 2. Tabla nueva: identidad estable
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  icon        text not null default 'tag',
  color       text not null default 'emerald',
  group_name  text not null check (group_name in ('Fijos','Variables','Ahorro')),
  fixed       boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz default now()
);

-- 3. Tabla nueva: presupuesto mensual
create table public.category_budgets (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.categories(id) on delete restrict,
  month        date not null,
  assigned     bigint not null default 0,
  spent        bigint not null default 0,
  unique (category_id, month)
);

create index category_budgets_month_idx on public.category_budgets(month);

-- 4. Redefinir las 3 funciones AHORA, antes de tocar transactions (punto 8): transactions
--    tiene el trigger trg_sync_category_spent (migración 008) que dispara sync_category_spent()
--    en cada UPDATE. Si se tocara transactions antes de redefinir esta función, el trigger
--    correría con el body VIEJO (el de la migración 008), que hace
--    "update public.categories set spent=... where month=..." — y la public.categories de
--    ACÁ EN ADELANTE ya es la tabla nueva sin columnas month/spent -> falla con
--    "column month does not exist". Encontrado en el primer intento de aplicar esta
--    migración (ver task-1-report.md): el error no lo agarró el bloque de verificación,
--    lo agarró Postgres antes de llegar ahí — el orden de las sentencias importa acá.

-- 4a. ensure_month_budgets: crea la fila de presupuesto de cada categoría activa que no
--     la tenga aún para ese mes, heredando el assigned de su fila anterior más reciente
--     (0 si es la primera vez). Idempotente.
create or replace function public.ensure_month_budgets(p_profile_id uuid, p_month date)
returns void
language plpgsql security definer
as $$
begin
  insert into public.category_budgets (category_id, month, assigned, spent)
  select
    c.id,
    p_month,
    coalesce((
      select cb.assigned from public.category_budgets cb
      where cb.category_id = c.id and cb.month < p_month
      order by cb.month desc limit 1
    ), 0),
    0
  from public.categories c
  where c.profile_id = p_profile_id and c.active = true
  on conflict (category_id, month) do nothing;
end;
$$;

-- 4b. sync_category_spent: ahora opera sobre category_budgets y hace upsert de la fila
--     del mes si todavía no existe (categorizar en un mes "no preparado" nunca falla).
create or replace function public.sync_category_spent()
returns trigger
language plpgsql
security definer
as $function$
declare
  v_cat_id uuid;
  v_month  date;
  v_spent  bigint;
begin
  if TG_OP = 'DELETE' then
    v_cat_id := OLD.category_id;
    v_month  := date_trunc('month', OLD.date);
  else
    v_cat_id := NEW.category_id;
    v_month  := date_trunc('month', NEW.date);
  end if;

  if v_cat_id is not null then
    select coalesce(sum(abs(amount)), 0) into v_spent
      from public.transactions
     where category_id = v_cat_id
       and (type = 'gasto' or (type = 'transfer' and amount > 0))
       and date_trunc('month', date) = v_month;

    insert into public.category_budgets (category_id, month, assigned, spent)
    values (v_cat_id, v_month, 0, v_spent)
    on conflict (category_id, month) do update set spent = excluded.spent;
  end if;

  if TG_OP = 'UPDATE' and OLD.category_id is not null and OLD.category_id <> NEW.category_id then
    select coalesce(sum(abs(amount)), 0) into v_spent
      from public.transactions
     where category_id = OLD.category_id
       and (type = 'gasto' or (type = 'transfer' and amount > 0))
       and date_trunc('month', date) = date_trunc('month', OLD.date);

    insert into public.category_budgets (category_id, month, assigned, spent)
    values (OLD.category_id, date_trunc('month', OLD.date), 0, v_spent)
    on conflict (category_id, month) do update set spent = excluded.spent;
  end if;

  return coalesce(NEW, OLD);
end;
$function$;

-- 4c. seed_default_categories: ahora siembra categorías estables + su primera fila de
--     presupuesto (se usa una sola vez, al crear un perfil nuevo — ver AuthContext.tsx).
create or replace function public.seed_default_categories(p_profile_id uuid)
returns void
language plpgsql security definer
as $$
declare
  v_month  date := date_trunc('month', now());
  v_cat_id uuid;
  v_row    record;
begin
  for v_row in
    select * from (values
      ('Arriendo / Hipoteca', 'home',     'slate',   'Fijos',     true),
      ('Servicios',           'zap',      'amber',   'Fijos',     true),
      ('Suscripciones',       'repeat',   'violet',  'Fijos',     true),
      ('Supermercado',        'cart',     'emerald', 'Variables', false),
      ('Restaurantes',        'utensils', 'red',     'Variables', false),
      ('Transporte',          'car',      'blue',    'Variables', false),
      ('Salud',               'heart',    'emerald', 'Variables', false),
      ('Entretenimiento',     'film',     'blue',    'Variables', false),
      ('Personal',            'bag',      'violet',  'Variables', false),
      ('Ahorro y metas',      'target',   'emerald', 'Ahorro',    true)
    ) as t(name, icon, color, group_name, fixed)
  loop
    insert into public.categories (profile_id, name, icon, color, group_name, fixed, active)
    values (p_profile_id, v_row.name, v_row.icon, v_row.color, v_row.group_name, v_row.fixed, true)
    on conflict do nothing
    returning id into v_cat_id;

    if v_cat_id is not null then
      insert into public.category_budgets (category_id, month, assigned, spent)
      values (v_cat_id, v_month, 0, 0)
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

-- 5. Backfill de categories: agrupar filas viejas por (profile_id, nombre) -> una fila
--    estable por grupo. icon/color/group_name/fixed se toman de la fila MÁS RECIENTE.
insert into public.categories (id, profile_id, name, icon, color, group_name, fixed, active, created_at)
select distinct on (profile_id, name)
  gen_random_uuid(), profile_id, name, icon, color, group_name, fixed, true, created_at
from public.categories_monthly_old
order by profile_id, name, month desc;

-- 6. Backfill de category_budgets: cada fila vieja -> su fila de presupuesto, ligada a
--    la categoría estable recién creada (match por profile_id+name, mismo criterio que
--    ya usaba copyPreviousMonth en Compromisos).
insert into public.category_budgets (category_id, month, assigned, spent)
select c.id, old.month, old.assigned, old.spent
from public.categories_monthly_old old
join public.categories c on c.profile_id = old.profile_id and c.name = old.name;

-- 7. Mapeo id-viejo -> id-nuevo (vive solo durante esta sesión/script) para remapear las FKs.
create temporary table cat_id_map as
select old.id as old_id, c.id as new_id
from public.categories_monthly_old old
join public.categories c on c.profile_id = old.profile_id and c.name = old.name;

-- 8. Remapear transactions.category_id. La función del punto 4b ya está activa, pero
--    trg_sync_category_spent además tiene una rama "OLD.category_id <> NEW.category_id"
--    (recategorización real de un movimiento) que para ESTE update interpretaría
--    OLD.category_id como si fuera una categoría válida vigente — y no lo es, es un id
--    viejo de categories_monthly_old que no existe en la categories nueva, así que
--    intenta insertar en category_budgets con un category_id que viola la FK. Encontrado
--    en el segundo intento de aplicar esta migración (ver task-1-report.md): la migración
--    ya no falla por la columna "month" (fix anterior), pero sigue fallando acá porque
--    esta rama del trigger no está pensada para una sustitución masiva de IDs, sino para
--    cuando un usuario recategoriza un movimiento a mano. Los valores de spent ya quedaron
--    bien calculados por el backfill del punto 6, así que no hace falta que el trigger
--    recalcule nada acá — se desactiva SOLO para este UPDATE puntual (no para el resto de
--    la migración) y se reactiva inmediatamente después.
--    (trg_sync_account_balance, el otro trigger de transactions, no se toca: solo mira
--    account_id/amount, que este UPDATE no cambia — resta y suma el mismo amount a la
--    misma cuenta, neto cero, verificado leyendo su body en 006_account_balance_trigger.sql.)
alter table public.transactions drop constraint if exists transactions_category_id_fkey;
alter table public.transactions disable trigger trg_sync_category_spent;
update public.transactions t
set category_id = m.new_id
from cat_id_map m
where t.category_id = m.old_id;
alter table public.transactions enable trigger trg_sync_category_spent;
alter table public.transactions
  add constraint transactions_category_id_fkey foreign key (category_id) references public.categories(id) on delete set null;

-- 9. Remapear monthly_commitments.category_id
alter table public.monthly_commitments drop constraint if exists monthly_commitments_category_id_fkey;
update public.monthly_commitments mc
set category_id = m.new_id
from cat_id_map m
where mc.category_id = m.old_id;
alter table public.monthly_commitments
  add constraint monthly_commitments_category_id_fkey foreign key (category_id) references public.categories(id) on delete restrict;

-- 10. Remapear subscriptions.category_id y upcoming.category_id — ambas tablas están
--     vacías hoy pero son features activas (subscriptions en habitos/page.tsx, upcoming
--     en resumen/page.tsx con un embedded select "categories(name,icon)"), y sus FKs
--     apuntan a categories(id) igual que transactions/monthly_commitments. Al renombrar
--     la tabla vieja (punto 1), esas 2 FKs quedaron apuntando a categories_monthly_old
--     en vez de a la nueva — sin este remap, Task 9 (DROP TABLE categories_monthly_old)
--     falla por dependencia, y cualquier insert futuro en estas 2 tablas rompe la FK.
--     (Encontrado en el primer intento de aplicar esta migración, ver task-1-report.md.)
alter table public.subscriptions drop constraint if exists subscriptions_category_id_fkey;
update public.subscriptions s
set category_id = m.new_id
from cat_id_map m
where s.category_id = m.old_id;
alter table public.subscriptions
  add constraint subscriptions_category_id_fkey foreign key (category_id) references public.categories(id) on delete set null;

alter table public.upcoming drop constraint if exists upcoming_category_id_fkey;
update public.upcoming u
set category_id = m.new_id
from cat_id_map m
where u.category_id = m.old_id;
alter table public.upcoming
  add constraint upcoming_category_id_fkey foreign key (category_id) references public.categories(id) on delete set null;

-- 11. RLS de las tablas nuevas (mismo criterio que el resto del schema: visible_profile_ids()).
alter table public.categories enable row level security;
create policy "categories_all" on public.categories
  for all using (profile_id in (select visible_profile_ids()));

alter table public.category_budgets enable row level security;
create policy "category_budgets_all" on public.category_budgets
  for all using (category_id in (select id from public.categories where profile_id in (select visible_profile_ids())));

-- 12. La tabla vieja NO se borra en este script — se deja renombrada como
--     categories_monthly_old. Se borra manualmente (DROP TABLE) en la Task 9,
--     después de confirmar que todo el plan quedó QA'eado.
