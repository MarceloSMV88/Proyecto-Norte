# Categorías y presupuesto mensual — separar identidad de asignación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar la identidad de una categoría de presupuesto (nombre/ícono/color/sección) de su asignación mensual (assigned/spent), para que Movimientos/Presupuesto/Compromisos/Resumen/Hábitos dejen de depender de que exista una fila de categoría para el mes actual.

**Architecture:** Se divide la tabla `categories` (hoy una fila por mes) en dos: `categories` (identidad estable, sin mes) y `category_budgets` (una fila por categoría+mes, solo `assigned`/`spent`). `transactions.category_id` y `monthly_commitments.category_id` pasan a apuntar a la categoría estable. Una función `ensure_month_budgets` crea automáticamente las filas de presupuesto de un mes nuevo a partir de las categorías activas. El trigger `sync_category_spent` hace upsert de la fila de presupuesto en vez de asumir que ya existe.

**Tech Stack:** Next.js 16 (App Router) + React 19, Supabase (Postgres + Edge Functions Deno), TypeScript. Sin framework de tests (`package.json` solo tiene `dev`/`build`/`start`, no hay carpeta de tests ni Jest/Vitest/Playwright configurado).

**Spec:** `docs/superpowers/specs/2026-08-01-categorias-presupuesto-mensual-design.md`

## Global Constraints

- No hay test runner en este proyecto. Cada tarea de base de datos se verifica con consultas SQL (vía Supabase MCP); cada tarea de frontend se verifica con `npm run build` (type-check de Next.js, debe salir sin errores) más una revisión manual puntual descrita en el propio paso — no "revisar que funcione", sino los clics exactos y el resultado esperado.
- **Orden estricto: Task 1 debe quedar aplicada y verificada en producción antes de tocar cualquier archivo de las Tasks 2-9.** Esos archivos asumen que la tabla `category_budgets` ya existe en producción; desplegarlos antes rompe la app en vivo.
- Proyecto Supabase: `gfswrtyxgsxakkpgduda`. Edge Functions se despliegan directo a ese proyecto (no hay Supabase CLI local en uso — el flujo de este repo es MCP `apply_migration`/`execute_sql`/`deploy_edge_function`).
- No commitear a git salvo que el usuario lo pida explícitamente para ese paso puntual (según su preferencia registrada). Cada task igual deja el commit como paso final del checklist — al ejecutar, confirmar con el usuario antes si hace tiempo que no se ha aclarado.
- Moneda: montos en `bigint` (pesos chilenos, sin decimales) — no introducir tipos flotantes en ningún cálculo nuevo.

---

## Task 1: Migración de esquema — `categories` estable + `category_budgets`, backfill y repunteo de FKs

**Files:**
- Create: `supabase/migrations/012_category_budgets_split.sql`

**Interfaces:**
- Produces: tabla `public.categories` (id, profile_id, name, icon, color, group_name, fixed, active, created_at — sin `month`/`assigned`/`spent`); tabla `public.category_budgets` (id, category_id, month, assigned, spent, unique(category_id, month)); función `public.ensure_month_budgets(p_profile_id uuid, p_month date) returns void`; función `public.sync_category_spent()` (trigger, reescrita); función `public.seed_default_categories(p_profile_id uuid)` (reescrita). `transactions.category_id` y `monthly_commitments.category_id` quedan apuntando a `categories.id` (estable).

- [ ] **Step 1: Escribir el archivo de migración completo**

```sql
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

-- 8. Remapear transactions.category_id (la función del punto 4b ya está activa, así que
--    el trigger que dispara este UPDATE corre con el body NUEVO — sin esto, falla).
alter table public.transactions drop constraint if exists transactions_category_id_fkey;
update public.transactions t
set category_id = m.new_id
from cat_id_map m
where t.category_id = m.old_id;
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
```

**Nota de estrategia:** no se usa una rama de Supabase (`create_branch`) para probar esto — tiene costo (~US$0.01344/hora, confirmado con `get_cost`) y el usuario está en plan free sin presupuesto para eso (ver memoria `feedback_supabase_no_paid_branching`). En su lugar, el Step 2 aplica la migración y la verifica DENTRO de la misma transacción SQL, contra producción directamente: si la verificación falla, se aborta con `raise exception` antes de llegar al `COMMIT` y producción queda exactamente como estaba, sin costo y sin riesgo.

- [ ] **Step 2: Aplicar la migración a producción dentro de una transacción verificada**

Vía `mcp__claude_ai_Supabase__execute_sql` contra el proyecto `gfswrtyxgsxakkpgduda`, correr en una sola llamada:

```sql
BEGIN;

-- [Acá va el contenido completo de los puntos 1-12 del script del Step 1, tal cual,
--  como sentencias sueltas — DDL es transaccional en Postgres, corre igual que el resto.]

-- Verificación: compara category_budgets (nuevo) contra categories_monthly_old (snapshot
-- intacto de antes de migrar, todavía presente en esta misma transacción) y aborta si
-- algo no cuadra, ANTES de llegar al COMMIT.
DO $verify$
declare
  v_old_rows bigint; v_new_rows bigint;
  v_old_sum_a bigint; v_new_sum_a bigint;
  v_old_sum_s bigint; v_new_sum_s bigint;
  v_orphan_tx bigint; v_orphan_cm bigint; v_orphan_sub bigint; v_orphan_up bigint;
begin
  select count(*), sum(assigned), sum(spent) into v_old_rows, v_old_sum_a, v_old_sum_s from public.categories_monthly_old;
  select count(*), sum(assigned), sum(spent) into v_new_rows, v_new_sum_a, v_new_sum_s from public.category_budgets;
  select count(*) into v_orphan_tx from public.transactions
    where category_id is not null and category_id not in (select id from public.categories);
  select count(*) into v_orphan_cm from public.monthly_commitments
    where category_id not in (select id from public.categories);
  select count(*) into v_orphan_sub from public.subscriptions
    where category_id is not null and category_id not in (select id from public.categories);
  select count(*) into v_orphan_up from public.upcoming
    where category_id is not null and category_id not in (select id from public.categories);

  if v_old_rows <> v_new_rows or v_old_sum_a is distinct from v_new_sum_a or v_old_sum_s is distinct from v_new_sum_s then
    raise exception 'Verificación falló: filas viejas=% nuevas=% · assigned viejo=% nuevo=% · spent viejo=% nuevo=%',
      v_old_rows, v_new_rows, v_old_sum_a, v_new_sum_a, v_old_sum_s, v_new_sum_s;
  end if;
  if v_orphan_tx > 0 then
    raise exception 'Verificación falló: % transacciones categorizadas quedaron huérfanas', v_orphan_tx;
  end if;
  if v_orphan_cm > 0 then
    raise exception 'Verificación falló: % compromisos quedaron huérfanos', v_orphan_cm;
  end if;
  if v_orphan_sub > 0 then
    raise exception 'Verificación falló: % suscripciones quedaron huérfanas', v_orphan_sub;
  end if;
  if v_orphan_up > 0 then
    raise exception 'Verificación falló: % upcoming quedaron huérfanos', v_orphan_up;
  end if;

  raise notice 'Verificación OK: % filas migradas, assigned=%, spent=%, sin huérfanos', v_new_rows, v_new_sum_a, v_new_sum_s;
end;
$verify$;

COMMIT;
```

Expected: el resultado de la llamada muestra el `NOTICE` "Verificación OK..." y la transacción queda comiteada. Si en cambio muestra un error `Verificación falló: ...`, la transacción se abortó sola — producción queda intacta, sin costo — y hay que revisar el contenido de los puntos 1-12 (pegados donde dice el comentario) antes de reintentar.

- [ ] **Step 3: Redeployar `transfer-ingest` inmediatamente después (ver Task 8)**

No dejar producción con el schema nuevo y la Edge Function vieja al mismo tiempo — la Task 8 (que solo cambia 3 líneas) se ejecuta a continuación de este mismo Step, antes de soltar el checkpoint de esta tarea.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/012_category_budgets_split.sql
git commit -m "feat(db): separar categories (estable) de category_budgets (mensual)"
```

---

## Task 2: Tipos de TypeScript

**Files:**
- Modify: `lib/types.ts:24-36`
- Modify: `lib/utils.ts` (agrega helper `flattenCategoryBudgets`)

**Interfaces:**
- Consumes: nada (solo tipos).
- Produces: `Category` (sin `month`/`assigned`/`spent`, con `active`); `CategoryBudget`; `CategoryWithBudget = Category & { assigned: number; spent: number; budget_id: string }`; `flattenCategoryBudgets(budgets): CategoryWithBudget[]` — usado por Tasks 4, 7.

- [ ] **Step 1: Reemplazar la interfaz `Category` y agregar `CategoryBudget`**

En `lib/types.ts`, reemplazar (líneas 24-36):

```ts
export interface Category {
  id: string
  profile_id: string
  name: string
  icon: string
  color: AccentColor
  group_name: CategoryGroup
  assigned: number
  spent: number
  fixed: boolean
  month: string
  created_at: string
}
```

por:

```ts
export interface Category {
  id: string
  profile_id: string
  name: string
  icon: string
  color: AccentColor
  group_name: CategoryGroup
  fixed: boolean
  active: boolean
  created_at: string
}

export interface CategoryBudget {
  id: string
  category_id: string
  month: string
  assigned: number
  spent: number
}

// Forma aplanada que usan Presupuesto/Resumen/Hábitos tras el join category_budgets+categories,
// para no tener que tocar el resto de cada pantalla (que ya usa cat.assigned/cat.spent/cat.name).
export type CategoryWithBudget = Category & { assigned: number; spent: number; budget_id: string }

// Forma cruda que devuelve supabase-js al pedir category_budgets con categories!inner(...)
// anidada — es lo que recibe flattenCategoryBudgets() antes de aplanar.
export type CategoryBudgetJoinRow = { id: string; assigned: number; spent: number; categories: Category | null }
```

- [ ] **Step 2: Agregar el helper `flattenCategoryBudgets` en `lib/utils.ts`**

Al final de `lib/utils.ts`, agregar:

```ts
import type { CategoryBudgetJoinRow, CategoryWithBudget } from './types'

export function flattenCategoryBudgets(budgets: CategoryBudgetJoinRow[]): CategoryWithBudget[] {
  return budgets
    .filter((b): b is CategoryBudgetJoinRow & { categories: NonNullable<CategoryBudgetJoinRow['categories']> } => b.categories !== null)
    .map(b => ({ ...b.categories, assigned: b.assigned, spent: b.spent, budget_id: b.id }))
}
```

(El `import type` va arriba del archivo junto a los demás imports si `lib/utils.ts` no tiene ninguno todavía — agregarlo como primera línea del archivo.)

- [ ] **Step 3: Verificar que compila**

Run: `npm run build`
Expected: falla en los archivos que todavía usan `Category.month`/`Category.assigned`/`Category.spent` directamente (Presupuesto, Movimientos, Compromisos, Resumen, Hábitos, CategoryModal) — **eso es lo esperado en este punto**, se resuelve en las Tasks 3-7. Confirmar que el error de build señala exactamente esos archivos y no algo inesperado.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts lib/utils.ts
git commit -m "feat(types): separar Category de CategoryBudget"
```

---

## Task 3: `CategoryModal.tsx` — crear/editar identidad y presupuesto en dos tablas

**Files:**
- Modify: `components/modals/CategoryModal.tsx` (reescritura completa)

**Interfaces:**
- Consumes: `Category`, `CategoryBudget` (Task 2).
- Produces: `CategoryModal` recibe ahora `category?: Category` (identidad) y `budget?: CategoryBudget` (fila del mes, para editar `assigned`) como props separadas — usado por Task 4 (Presupuesto).

- [ ] **Step 1: Reescribir el componente completo**

Reemplazar todo el contenido de `components/modals/CategoryModal.tsx` por:

```tsx
'use client'
import { useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { useEscapeClose } from '@/lib/useEscapeClose'
import { useAnimatedClose } from '@/lib/useAnimatedClose'
import { ICON_CATALOG, catEmoji } from '@/lib/icons'
import type { Category, CategoryBudget, CategoryGroup, AccentColor } from '@/lib/types'

const GROUPS: CategoryGroup[] = ['Fijos', 'Variables', 'Ahorro']

const COLORS: { key: AccentColor; hex: string }[] = [
  { key: 'emerald', hex: '#34c98a' },
  { key: 'blue', hex: '#4f93f5' },
  { key: 'violet', hex: '#9b8cf0' },
  { key: 'amber', hex: '#e6b25a' },
  { key: 'red', hex: '#ef7a63' },
]

interface CategoryModalProps {
  profileId: string
  month: string            // '2026-06-01' — mes activo en Presupuesto
  category?: Category      // si viene → modo edición de identidad
  budget?: CategoryBudget  // fila de category_budgets de ESTE mes (si existe) — para editar `assigned`
  defaultGroup?: CategoryGroup
  onClose: () => void
  onSaved: () => void
}

export default function CategoryModal({ profileId, month, category, budget, defaultGroup, onClose, onSaved }: CategoryModalProps) {
  const isEdit = !!category
  const [name, setName] = useState(category?.name ?? '')
  const [group, setGroup] = useState<CategoryGroup>(category?.group_name ?? defaultGroup ?? 'Variables')
  const [icon, setIcon] = useState(category?.icon ?? 'tag')
  const validColor = (c?: string): AccentColor => (COLORS.some(x => x.key === c) ? c as AccentColor : 'emerald')
  const color = validColor(category?.color)
  const [active, setActive] = useState(category?.active ?? true)
  const [assigned, setAssigned] = useState(budget ? String(budget.assigned) : '')
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()
  const supabase = createClient()
  const { closing, close } = useAnimatedClose(onClose)
  useEscapeClose(close)

  const assignedN = parseInt(assigned.replace(/\D/g, '')) || 0
  const formattedAssigned = assignedN > 0 ? assignedN.toLocaleString('es-CL') : ''
  // Variables = gasto discrecional (cuenta para "disponible hoy"); Fijos/Ahorro = fijo
  const fixed = group !== 'Variables'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)

    const identityPayload = {
      name: name.trim(),
      group_name: group,
      icon,
      color,
      fixed,
      ...(isEdit ? { active } : {}),
    }

    if (isEdit) {
      const { error: catErr } = await supabase.from('categories').update(identityPayload).eq('id', category!.id)
      if (catErr) { setSaving(false); showToast('Error al guardar'); return }

      const { error: budgetErr } = budget
        ? await supabase.from('category_budgets').update({ assigned: assignedN }).eq('id', budget.id)
        : await supabase.from('category_budgets').insert({ category_id: category!.id, month, assigned: assignedN, spent: 0 })
      setSaving(false)
      if (budgetErr) { showToast('Categoría guardada, pero no se pudo actualizar el monto asignado'); return }
      showToast('✓ Categoría actualizada')
      onSaved(); close()
      return
    }

    const { data: newCat, error: catErr } = await supabase.from('categories')
      .insert({ ...identityPayload, profile_id: profileId, active: true })
      .select('id').single()
    if (catErr || !newCat) { setSaving(false); showToast('Error al guardar'); return }
    const { error: budgetErr } = await supabase.from('category_budgets')
      .insert({ category_id: newCat.id, month, assigned: assignedN, spent: 0 })
    setSaving(false)
    if (budgetErr) { showToast('Categoría creada, pero no se pudo asignar el monto de este mes'); return }
    showToast('✓ Categoría creada')
    onSaved(); close()
  }

  async function handleDelete() {
    if (!category) return
    if (!confirm(`¿Eliminar por completo la categoría "${category.name}", incluyendo su historial de meses? Si solo querés dejar de usarla de acá en adelante sin perder el historial, desmarca "Activa" y guarda en vez de eliminar.`)) return
    setSaving(true)
    const { error } = await supabase.from('categories').delete().eq('id', category.id)
    setSaving(false)
    if (error) {
      if (error.code === '23503') {
        showToast('No se puede eliminar: tiene movimientos o compromisos asociados. Desmarcá "Activa" en vez de eliminar.')
      } else {
        showToast('Error al eliminar')
      }
      return
    }
    showToast('✓ Categoría eliminada')
    onSaved(); close()
  }

  const accentHex = (COLORS.find(c => c.key === color) ?? COLORS[0]).hex

  return (
    <div className="modal-scrim" data-closing={closing || undefined} onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ borderTop: `3px solid ${accentHex}` }}>
        <div className="modal-head">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>{catEmoji(icon)}</span>
            {isEdit ? 'Editar categoría' : 'Nueva categoría'}
          </h3>
          <button type="button" onClick={close} className="icon-btn ghost sm">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Nombre */}
          <label className="field-label">Nombre</label>
          <input
            className="text-input"
            type="text"
            placeholder="Ej: Supermercado, Arriendo…"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            maxLength={40}
          />

          {/* Sección (grupo) */}
          <label className="field-label" style={{ marginTop: 16 }}>Sección</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {GROUPS.map(g => (
              <button
                key={g}
                type="button"
                onClick={() => setGroup(g)}
                style={{
                  flex: 1,
                  padding: '9px',
                  borderRadius: 'var(--radius-sm)',
                  border: group === g ? `1px solid ${accentHex}` : '1px solid var(--border)',
                  background: group === g ? `color-mix(in oklab, ${accentHex} 14%, var(--surface-2))` : 'var(--surface-2)',
                  color: group === g ? 'var(--text)' : 'var(--text-2)',
                  fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  transition: '.15s',
                }}
              >
                {g}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>
            {group === 'Variables'
              ? 'Gasto discrecional — cuenta para "Disponible para gastar hoy".'
              : 'Gasto fijo — se reserva y no afecta el disponible diario.'}
          </div>

          {/* Monto asignado (de ESTE mes) */}
          <label className="field-label" style={{ marginTop: 16 }}>Monto asignado este mes ($)</label>
          <div className="amount-field" style={{ marginBottom: 0 }}>
            <span className="amount-cur">$</span>
            <input
              className="amount-input"
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={formattedAssigned}
              onChange={e => setAssigned(e.target.value.replace(/\D/g, ''))}
            />
          </div>

          {/* Ícono */}
          <label className="field-label" style={{ marginTop: 16 }}>Ícono</label>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6,
            maxHeight: 168, overflowY: 'auto', padding: 4,
            background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
          }}>
            {ICON_CATALOG.map(opt => (
              <button
                key={opt.key}
                type="button"
                title={opt.label}
                onClick={() => setIcon(opt.key)}
                style={{
                  aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, borderRadius: 9, cursor: 'pointer',
                  border: icon === opt.key ? `2px solid ${accentHex}` : '2px solid transparent',
                  background: icon === opt.key ? `color-mix(in oklab, ${accentHex} 16%, transparent)` : 'transparent',
                  transition: 'background .1s',
                }}
                onMouseEnter={e => { if (icon !== opt.key) e.currentTarget.style.background = 'var(--surface-3)' }}
                onMouseLeave={e => { if (icon !== opt.key) e.currentTarget.style.background = 'transparent' }}
              >
                {opt.emoji}
              </button>
            ))}
          </div>

          {/* Activa (solo al editar) */}
          {isEdit && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, fontSize: 13, fontFamily: 'var(--font-ui)', color: 'var(--text-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
              Activa — si la desmarcás, deja de aparecer en meses futuros (el historial de meses pasados no se toca)
            </label>
          )}

          {/* Acciones */}
          <div style={{ display: 'flex', gap: 10, marginTop: 20, alignItems: 'center' }}>
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                title="Eliminar categoría por completo"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 44, padding: '12px 0', borderRadius: 'var(--radius-sm)',
                  background: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--danger)', cursor: 'pointer', flexShrink: 0,
                }}
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="btn-primary block"
              style={{ background: accentHex, opacity: name.trim() ? 1 : 0.4, marginTop: 0 }}
            >
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear categoría'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run build`
Expected: `CategoryModal.tsx` ya no da error. Los errores restantes (si quedan) son de `presupuesto/page.tsx` (que todavía llama al modal con las props viejas) — se resuelve en la Task 4.

- [ ] **Step 3: Commit**

```bash
git add components/modals/CategoryModal.tsx
git commit -m "feat(presupuesto): CategoryModal edita identidad y presupuesto mensual por separado"
```

---

## Task 4: `app/(app)/presupuesto/page.tsx`

**Files:**
- Modify: `app/(app)/presupuesto/page.tsx`

**Interfaces:**
- Consumes: `flattenCategoryBudgets` (Task 2), `CategoryModal` con props `category`/`budget` (Task 3).
- Produces: nada consumido por otras tasks (pantalla hoja).

- [ ] **Step 1: Reemplazar el `load()` para llamar `ensure_month_budgets` y traer el mes aplanado**

Reemplazar (líneas 33-50 actuales):

```ts
  const load = useCallback(async () => {
    if (!activeProfile) return
    const nextMonth = nextMonthStr(selectedMonth)
    const [cats, accs, txs] = await Promise.all([
      supabase.from('categories').select('*').eq('profile_id', activeProfile.id).eq('month', selectedMonth).order('created_at'),
      supabase.from('accounts').select('*').eq('profile_id', activeProfile.id),
      // Igual criterio que sync_category_spent: gastos + la pata positiva (destino) de
      // transferencias categorizadas (ej. aportes a ahorro entre 2 cuentas propias).
      supabase.from('transactions').select('*, accounts(name)')
        .eq('profile_id', activeProfile.id)
        .or('type.eq.gasto,and(type.eq.transfer,amount.gt.0)')
        .gte('date', selectedMonth).lt('date', nextMonth)
        .order('date', { ascending: false }),
    ])
    setCategories((cats.data || []) as Category[])
    setAccounts((accs.data || []) as Account[])
    setTransactions((txs.data || []) as Transaction[])
  }, [activeProfile, supabase, selectedMonth])
```

por:

```ts
  const load = useCallback(async () => {
    if (!activeProfile) return
    await supabase.rpc('ensure_month_budgets', { p_profile_id: activeProfile.id, p_month: selectedMonth })
    const nextMonth = nextMonthStr(selectedMonth)
    const [budgets, accs, txs] = await Promise.all([
      supabase.from('category_budgets').select('id, assigned, spent, categories!inner(id, profile_id, name, icon, color, group_name, fixed, active, created_at)')
        .eq('categories.profile_id', activeProfile.id).eq('month', selectedMonth),
      supabase.from('accounts').select('*').eq('profile_id', activeProfile.id),
      // Igual criterio que sync_category_spent: gastos + la pata positiva (destino) de
      // transferencias categorizadas (ej. aportes a ahorro entre 2 cuentas propias).
      supabase.from('transactions').select('*, accounts(name)')
        .eq('profile_id', activeProfile.id)
        .or('type.eq.gasto,and(type.eq.transfer,amount.gt.0)')
        .gte('date', selectedMonth).lt('date', nextMonth)
        .order('date', { ascending: false }),
    ])
    setCategories(flattenCategoryBudgets((budgets.data || []) as CategoryBudgetJoinRow[]).sort((a, b) => a.name.localeCompare(b.name)))
    setAccounts((accs.data || []) as Account[])
    setTransactions((txs.data || []) as Transaction[])
  }, [activeProfile, supabase, selectedMonth])
```

Y actualizar el import de `Category` a `CategoryWithBudget` en la firma de estado y el import de `lib/utils`:

Reemplazar:
```ts
import { clp, computeSummary, formatDate, getCurrentMonth } from '@/lib/utils'
...
import type { Category, Account, CategoryGroup, Transaction } from '@/lib/types'
...
  const [categories, setCategories] = useState<Category[]>([])
```

por:
```ts
import { clp, computeSummary, flattenCategoryBudgets, formatDate, getCurrentMonth } from '@/lib/utils'
...
import type { CategoryWithBudget, CategoryBudgetJoinRow, Account, CategoryGroup, Transaction } from '@/lib/types'
...
  const [categories, setCategories] = useState<CategoryWithBudget[]>([])
```

- [ ] **Step 2: Pasar `budget` (no solo `category`) a `CategoryModal` al editar**

Reemplazar (bloque final del archivo, modales de crear/editar):

```tsx
      {addGroup && (
        <CategoryModal
          profileId={activeProfile.id}
          month={selectedMonth}
          defaultGroup={addGroup}
          onClose={() => setAddGroup(null)}
          onSaved={load}
        />
      )}
      {modalCat && (
        <CategoryModal
          profileId={activeProfile.id}
          month={selectedMonth}
          category={modalCat}
          onClose={() => setModalCat(null)}
          onSaved={load}
        />
      )}
```

por:

```tsx
      {addGroup && (
        <CategoryModal
          profileId={activeProfile.id}
          month={selectedMonth}
          defaultGroup={addGroup}
          onClose={() => setAddGroup(null)}
          onSaved={load}
        />
      )}
      {modalCat && (
        <CategoryModal
          profileId={activeProfile.id}
          month={selectedMonth}
          category={modalCat}
          budget={{ id: modalCat.budget_id, category_id: modalCat.id, month: selectedMonth, assigned: modalCat.assigned, spent: modalCat.spent }}
          onClose={() => setModalCat(null)}
          onSaved={load}
        />
      )}
```

`modalCat` ya es del tipo `CategoryWithBudget` (viene de `useState<Category | null>` → cambiar esa línea de estado también, cerca del inicio del componente:

Reemplazar: `const [modalCat, setModalCat] = useState<Category | null>(null)`
por: `const [modalCat, setModalCat] = useState<CategoryWithBudget | null>(null)`

- [ ] **Step 3: Verificar que compila**

Run: `npm run build`
Expected: `presupuesto/page.tsx` sin errores de tipo.

- [ ] **Step 4: Verificación manual (requiere Task 1 ya aplicada en producción)**

1. Abrir Presupuesto en un mes sin presupuesto todavía (ej. un mes futuro nuevo). Confirmar que aparecen automáticamente todas las categorías activas con `assigned` = el del mes anterior (o $0 si nunca se asignó).
2. Crear una categoría nueva. Confirmar que aparece de inmediato en este mes.
3. Editarla, cambiar el monto asignado, guardar. Confirmar que el número se actualiza.
4. Desmarcar "Activa" en una categoría existente y guardar. Cambiar a un mes futuro (que no exista todavía) y confirmar que esa categoría YA NO aparece ahí. Volver al mes en que se desactivó y confirmar que sigue apareciendo.
5. Intentar "Eliminar" una categoría que ya tiene movimientos o compromisos asociados. Confirmar que sale el toast "No se puede eliminar…" y NO se borra.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/presupuesto/page.tsx"
git commit -m "feat(presupuesto): usar category_budgets del mes con ensure_month_budgets"
```

---

## Task 5: `app/(app)/movimientos/page.tsx` — fix del bug original

**Files:**
- Modify: `app/(app)/movimientos/page.tsx`

**Interfaces:**
- Consumes: `Category` con `active` (Task 2).

- [ ] **Step 1: Simplificar la carga de categorías (ya no depende del mes)**

Reemplazar (dentro de `load()`, líneas 41-56 actuales):

```ts
    const [txs, cats, accs] = await Promise.all([
      q.order('date', { ascending: false }).order('created_at', { ascending: false }).limit(300),
      supabase.from('categories').select('*').eq('profile_id', activeProfile.id),
      supabase.from('accounts').select('*').eq('profile_id', activeProfile.id),
    ])
```

por:

```ts
    const [txs, cats, accs] = await Promise.all([
      q.order('date', { ascending: false }).order('created_at', { ascending: false }).limit(300),
      supabase.from('categories').select('*').eq('profile_id', activeProfile.id).eq('active', true),
      supabase.from('accounts').select('*').eq('profile_id', activeProfile.id),
    ])
```

- [ ] **Step 2: Quitar el filtro por mes de `gastoCategoriesFor`**

Reemplazar:

```ts
  // Las categorías tienen una fila por mes: al categorizar hay que ofrecer las del MISMO
  // mes del movimiento (no las de selectedMonth, que puede diferir si hay un rango de fechas activo).
  function gastoCategoriesFor(dateStr: string) {
    const month = dateStr.slice(0, 7) + '-01'
    return categories.filter(c => c.month === month && c.group_name !== 'Ahorro')
  }
```

por:

```ts
  // Las categorías ya no están ligadas a un mes: categorizar un movimiento no depende de
  // que exista una fila de presupuesto para ese mes (ver ensure_month_budgets / Task 1).
  function gastoCategoriesFor() {
    return categories.filter(c => c.group_name !== 'Ahorro')
  }
```

Y el único call site (dentro del `<select>` de categorizar):

Reemplazar: `{gastoCategoriesFor(tx.date).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}`
por: `{gastoCategoriesFor().map(c => <option key={c.id} value={c.id}>{c.name}</option>)}`

- [ ] **Step 3: Verificar que compila**

Run: `npm run build`
Expected: `movimientos/page.tsx` sin errores de tipo.

- [ ] **Step 4: Verificación manual — el caso original del bug**

1. Ir al mes de agosto en Movimientos (o el mes que en ese momento no tenga presupuesto armado en Presupuesto todavía).
2. Categorizar uno de los movimientos de "TC - Ripley". Confirmar que el dropdown tiene opciones y que categoriza sin error.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/movimientos/page.tsx"
git commit -m "fix(movimientos): categorizar ya no depende de que exista presupuesto del mes"
```

---

## Task 6: `app/(app)/compromisos/page.tsx`

**Files:**
- Modify: `app/(app)/compromisos/page.tsx`

**Interfaces:**
- Consumes: `Category` con `active` (Task 2), `CategoryBudget` (Task 2).

- [ ] **Step 1: Cargar categorías activas (sin mes) + presupuesto del mes seleccionado, separado**

Reemplazar (dentro de `load()`, líneas 136-150 actuales):

```ts
    const [cmts, cats, accs, txs] = await Promise.all([
      supabase.from('monthly_commitments')
        .select('*, categories(name,icon,color,group_name,assigned,spent), accounts(name), transactions(name,amount,date)')
        .eq('profile_id', activeProfile.id)
        .eq('month', selectedMonth)
        .order('group_name')
        .order('due_day', { nullsFirst: false })
        .order('name'),
      supabase.from('categories').select('*').eq('profile_id', activeProfile.id).eq('month', selectedMonth).order('group_name').order('name'),
      supabase.from('accounts').select('*').eq('profile_id', activeProfile.id).order('type').order('name'),
      supabase.from('transactions').select('*, categories(name,icon,color), accounts(name)')
        .eq('profile_id', activeProfile.id)
        .gte('date', selectedMonth).lt('date', nextMonth)
        .order('date', { ascending: false }).limit(400),
    ])
```

por:

```ts
    const [cmts, cats, budgets, accs, txs] = await Promise.all([
      supabase.from('monthly_commitments')
        .select('*, categories(name,icon,color,group_name), accounts(name), transactions(name,amount,date)')
        .eq('profile_id', activeProfile.id)
        .eq('month', selectedMonth)
        .order('group_name')
        .order('due_day', { nullsFirst: false })
        .order('name'),
      supabase.from('categories').select('*').eq('profile_id', activeProfile.id).eq('active', true).order('group_name').order('name'),
      supabase.from('category_budgets').select('category_id, assigned, spent, categories!inner(profile_id)')
        .eq('categories.profile_id', activeProfile.id).eq('month', selectedMonth),
      supabase.from('accounts').select('*').eq('profile_id', activeProfile.id).order('type').order('name'),
      supabase.from('transactions').select('*, categories(name,icon,color), accounts(name)')
        .eq('profile_id', activeProfile.id)
        .gte('date', selectedMonth).lt('date', nextMonth)
        .order('date', { ascending: false }).limit(400),
    ])
```

Y después de los `setState` existentes, agregar el estado y su asignación — declarar cerca de los otros `useState` (junto a `categories`):

```ts
  const [budgetByCategory, setBudgetByCategory] = useState<Map<string, { assigned: number; spent: number }>>(new Map())
```

y en `load()`, junto a los demás `setState`:

```ts
    setBudgetByCategory(new Map((budgets.data || []).map((b: { category_id: string; assigned: number; spent: number }) => [b.category_id, { assigned: b.assigned, spent: b.spent }])))
```

- [ ] **Step 2: Simplificar `copyPreviousMonth` — ya no matchea por nombre**

Reemplazar la función completa:

```ts
  async function copyPreviousMonth() {
    if (!activeProfile || copying) return
    setCopying(true)
    const prev = prevMonthStr(selectedMonth)
    const { data, error } = await supabase.from('monthly_commitments')
      .select('*, categories(name)')
      .eq('profile_id', activeProfile.id)
      .eq('month', prev)
      .order('group_name')
      .order('name')
    if (error) {
      setCopying(false)
      showToast('No pude leer el mes anterior')
      return
    }
    const previous = (data || []) as (MonthlyCommitment & { categories?: { name: string } | null })[]
    const categoryByName = new Map(categories.map(c => [c.name, c.id]))
    const payload = previous
      .map((c): CommitmentInsert | null => {
        const categoryId = c.categories?.name ? categoryByName.get(c.categories.name) : c.category_id
        if (!categoryId) return null
        return {
          profile_id: activeProfile.id,
          category_id: categoryId,
          account_id: c.account_id,
          name: c.name,
          group_name: c.group_name,
          expected_amount: c.expected_amount,
          due_day: c.due_day,
          payment_method: null,
          matcher_hint: null,
          status: 'pendiente' as CommitmentStatus,
          actual_amount: 0,
          month: selectedMonth,
        }
      })
      .filter((row): row is CommitmentInsert => row !== null)

    if (!payload.length) {
      setCopying(false)
      showToast(previous.length ? 'Faltan categorías equivalentes en este mes' : 'El mes anterior no tiene compromisos')
      return
    }
    const { error: insertError } = await supabase.from('monthly_commitments').insert(payload)
    setCopying(false)
    if (insertError) { showToast('Error al traer mes anterior'); return }
    showToast('Compromisos del mes anterior copiados')
    load()
  }
```

por:

```ts
  async function copyPreviousMonth() {
    if (!activeProfile || copying) return
    setCopying(true)
    const prev = prevMonthStr(selectedMonth)
    const { data, error } = await supabase.from('monthly_commitments')
      .select('*')
      .eq('profile_id', activeProfile.id)
      .eq('month', prev)
      .order('group_name')
      .order('name')
    if (error) {
      setCopying(false)
      showToast('No pude leer el mes anterior')
      return
    }
    const previous = (data || []) as MonthlyCommitment[]
    // La categoría es la misma fila estable todos los meses (Task 1) — ya no hace falta
    // matchear por nombre contra las categorías de este mes.
    const payload: CommitmentInsert[] = previous.map(c => ({
      profile_id: activeProfile.id,
      category_id: c.category_id,
      account_id: c.account_id,
      name: c.name,
      group_name: c.group_name,
      expected_amount: c.expected_amount,
      due_day: c.due_day,
      payment_method: null,
      matcher_hint: null,
      status: 'pendiente' as CommitmentStatus,
      actual_amount: 0,
      month: selectedMonth,
    }))

    if (!payload.length) {
      setCopying(false)
      showToast('El mes anterior no tiene compromisos')
      return
    }
    const { error: insertError } = await supabase.from('monthly_commitments').insert(payload)
    setCopying(false)
    if (insertError) { showToast('Error al traer mes anterior'); return }
    showToast('Compromisos del mes anterior copiados')
    load()
  }
```

- [ ] **Step 3: Pasar `budgetByCategory` a `CommitmentModal` y usarlo en el texto de "Control presupuestario"**

En el render de `CommitmentModal` (bloque final del archivo), agregar la prop:

Reemplazar:
```tsx
      {modalCommitment && (
        <CommitmentModal
          profileId={activeProfile.id}
          month={selectedMonth}
          categories={categories}
          accounts={accounts}
          commitment={modalCommitment === 'new' ? undefined : modalCommitment}
          onClose={() => setModalCommitment(null)}
          onSaved={load}
        />
      )}
```
por:
```tsx
      {modalCommitment && (
        <CommitmentModal
          profileId={activeProfile.id}
          month={selectedMonth}
          categories={categories}
          budgetByCategory={budgetByCategory}
          accounts={accounts}
          commitment={modalCommitment === 'new' ? undefined : modalCommitment}
          onClose={() => setModalCommitment(null)}
          onSaved={load}
        />
      )}
```

Y en la definición de `CommitmentModal` (misma archivo), agregar el prop y usarlo en el texto del "Control presupuestario":

Reemplazar la firma:
```tsx
function CommitmentModal({ profileId, month, categories, accounts, commitment, onClose, onSaved }: {
  profileId: string
  month: string
  categories: Category[]
  accounts: Account[]
  commitment?: MonthlyCommitment
  onClose: () => void
  onSaved: () => void
}) {
```
por:
```tsx
function CommitmentModal({ profileId, month, categories, budgetByCategory, accounts, commitment, onClose, onSaved }: {
  profileId: string
  month: string
  categories: Category[]
  budgetByCategory: Map<string, { assigned: number; spent: number }>
  accounts: Account[]
  commitment?: MonthlyCommitment
  onClose: () => void
  onSaved: () => void
}) {
```

Y el bloque del hint (dentro del `<select>` de categoría y el texto de abajo):

Reemplazar:
```tsx
          <label className="field-label">Categoría obligatoria</label>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} required>
            {categories.length === 0 && <option value="">Crea categorías para este mes primero</option>}
            {categories.map(c => <option key={c.id} value={c.id}>{catEmoji(c.icon)} {c.group_name} · {c.name}</option>)}
          </select>
          {selectedCategory && (
            <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>
              Control presupuestario: {clp(selectedCategory.spent)} gastado de {clp(selectedCategory.assigned)} asignado.
            </div>
          )}
```
por:
```tsx
          <label className="field-label">Categoría obligatoria</label>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} required>
            {categories.length === 0 && <option value="">Crea una categoría primero</option>}
            {categories.map(c => <option key={c.id} value={c.id}>{catEmoji(c.icon)} {c.group_name} · {c.name}</option>)}
          </select>
          {selectedCategory && (() => {
            const b = budgetByCategory.get(selectedCategory.id)
            return b ? (
              <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>
                Control presupuestario: {clp(b.spent)} gastado de {clp(b.assigned)} asignado.
              </div>
            ) : null
          })()}
```

- [ ] **Step 4: Verificar que compila**

Run: `npm run build`
Expected: `compromisos/page.tsx` sin errores de tipo.

- [ ] **Step 5: Verificación manual**

1. En Compromisos, abrir un compromiso existente y confirmar que "Control presupuestario" muestra el gastado/asignado correcto del mes.
2. Ir a un mes nuevo sin compromisos y usar "Traer mes anterior". Confirmar que los compromisos llegan con su categoría correcta (sin el toast "Faltan categorías equivalentes").

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/compromisos/page.tsx"
git commit -m "feat(compromisos): categoría estable, sin matching por nombre al copiar mes anterior"
```

---

## Task 7: `app/(app)/resumen/page.tsx` y `app/(app)/habitos/page.tsx`

**Files:**
- Modify: `app/(app)/resumen/page.tsx`
- Modify: `app/(app)/habitos/page.tsx`

**Interfaces:**
- Consumes: `flattenCategoryBudgets`, `CategoryWithBudget` (Task 2).

- [ ] **Step 1: `resumen/page.tsx` — reemplazar la consulta de categorías**

Reemplazar:
```ts
    const [cats, accs, gls, txs, upcs] = await Promise.all([
      supabase.from('categories').select('*').eq('profile_id', pid).eq('month', selectedMonth),
```
por:
```ts
    const [cats, accs, gls, txs, upcs] = await Promise.all([
      supabase.from('category_budgets').select('id, assigned, spent, categories!inner(id, profile_id, name, icon, color, group_name, fixed, active, created_at)')
        .eq('categories.profile_id', pid).eq('month', selectedMonth),
```

Y la línea que guarda el estado:

Reemplazar: `setCategories((cats.data || []) as Category[])`
por: `setCategories(flattenCategoryBudgets((cats.data || []) as CategoryBudgetJoinRow[]))`

Y el tipo de estado / import:

Reemplazar: `const [categories, setCategories] = useState<Category[]>([])`
por: `const [categories, setCategories] = useState<CategoryWithBudget[]>([])`

Reemplazar: `import type { Category, Account, Goal, Transaction, Upcoming, MonthlyBar } from '@/lib/types'`
por: `import type { CategoryWithBudget, CategoryBudgetJoinRow, Account, Goal, Transaction, Upcoming, MonthlyBar } from '@/lib/types'`

Reemplazar: `import { clp, clpShort, computeSummary, formatDate, getDaysLeftInMonth, getCurrentMonth, todayCL } from '@/lib/utils'`
por: `import { clp, clpShort, computeSummary, flattenCategoryBudgets, formatDate, getDaysLeftInMonth, getCurrentMonth, todayCL } from '@/lib/utils'`

- [ ] **Step 2: `habitos/page.tsx` — mismo cambio**

Reemplazar:
```ts
    const [cats, subs, txs] = await Promise.all([
      supabase.from('categories').select('*').eq('profile_id', pid).eq('month', month),
```
por:
```ts
    const [cats, subs, txs] = await Promise.all([
      supabase.from('category_budgets').select('id, assigned, spent, categories!inner(id, profile_id, name, icon, color, group_name, fixed, active, created_at)')
        .eq('categories.profile_id', pid).eq('month', month),
```

Reemplazar: `setCategories((cats.data || []) as Category[])`
por: `setCategories(flattenCategoryBudgets((cats.data || []) as CategoryBudgetJoinRow[]))`

Reemplazar: `const [categories, setCategories] = useState<Category[]>([])`
por: `const [categories, setCategories] = useState<CategoryWithBudget[]>([])`

Reemplazar: `import type { Category, Subscription, Transaction, MonthlyBar } from '@/lib/types'`
por: `import type { CategoryWithBudget, CategoryBudgetJoinRow, Subscription, Transaction, MonthlyBar } from '@/lib/types'`

Reemplazar: `import { clp, clpShort, getCurrentMonth, todayCL } from '@/lib/utils'`
por: `import { clp, clpShort, flattenCategoryBudgets, getCurrentMonth, todayCL } from '@/lib/utils'`

- [ ] **Step 3: Verificar que compila**

Run: `npm run build`
Expected: ambos archivos sin errores de tipo. Este debería ser el último error de build pendiente — si `npm run build` pasa completo acá, las Tasks 2-7 quedaron consistentes entre sí.

- [ ] **Step 4: Verificación manual**

Abrir Resumen y Hábitos en el mes actual y en un mes viejo (julio). Confirmar que "Presupuesto por categorías" (Resumen) y "Dónde gastas más" (Hábitos) muestran los mismos números que antes de la migración.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/resumen/page.tsx" "app/(app)/habitos/page.tsx"
git commit -m "fix(resumen,habitos): consultar category_budgets del mes en vez de categories.month"
```

---

## Task 8: Edge Function `transfer-ingest` — quitar el filtro por mes

**Files:**
- Modify: `supabase/functions/transfer-ingest/index.ts:128, 160, 266-267, 398-399, 411`

**Interfaces:**
- Consumes: schema nuevo de `categories` (Task 1, ya debe estar aplicado en producción antes de este paso — ver Global Constraints y Task 1 Step 3).

- [ ] **Step 1: Quitar `.eq('month', month)` de las 3 búsquedas de categoría**

Ubicación 1 (rama `pago_tc`, alrededor de la línea 128):

Reemplazar:
```ts
      const { data: catRow } = await sb.from('categories').select('id')
        .eq('profile_id', profileId).eq('name', 'Tarjetas de crédito').eq('month', month).limit(1).maybeSingle()
```
por:
```ts
      const { data: catRow } = await sb.from('categories').select('id')
        .eq('profile_id', profileId).eq('name', 'Tarjetas de crédito').limit(1).maybeSingle()
```

Ubicación 2 (rama `coopeuch_cuotas`, alrededor de la línea 160):

Reemplazar:
```ts
    const { data: cat } = await sb.from('categories').select('id')
      .eq('profile_id', profileId).eq('name', 'Ahorro - Personal').eq('month', month).limit(1).maybeSingle()
```
por:
```ts
    const { data: cat } = await sb.from('categories').select('id')
      .eq('profile_id', profileId).eq('name', 'Ahorro - Personal').limit(1).maybeSingle()
```

Ubicación 3 (rama `pago_servicio`, categoría por reglas, alrededor de la línea 266-267):

Reemplazar:
```ts
        const { data: cat } = await sb.from('categories').select('id')
          .eq('profile_id', profileId).eq('name', match.category_name).eq('month', month).limit(1).maybeSingle()
```
por:
```ts
        const { data: cat } = await sb.from('categories').select('id')
          .eq('profile_id', profileId).eq('name', match.category_name).limit(1).maybeSingle()
```

Ubicación 4 (rama genérica, categoría por reglas de gasto, alrededor de la línea 398-399 — mismo patrón que Ubicación 3, ocurre dos veces en el archivo):

Reemplazar:
```ts
        const { data: cat } = await sb.from('categories').select('id')
          .eq('profile_id', profileId).eq('name', match.category_name).eq('month', month).limit(1).maybeSingle()
```
por:
```ts
        const { data: cat } = await sb.from('categories').select('id')
          .eq('profile_id', profileId).eq('name', match.category_name).limit(1).maybeSingle()
```

Ubicación 5 (rama genérica, "Ahorro Premium", alrededor de la línea 411):

Reemplazar:
```ts
    const { data: cat } = await sb.from('categories').select('id')
      .eq('profile_id', profileId).eq('name', 'Ahorro - Personal').eq('month', month).limit(1).maybeSingle()
```
por:
```ts
    const { data: cat } = await sb.from('categories').select('id')
      .eq('profile_id', profileId).eq('name', 'Ahorro - Personal').limit(1).maybeSingle()
```

- [ ] **Step 2: Desplegar la función actualizada**

Vía `mcp__claude_ai_Supabase__deploy_edge_function` sobre el proyecto `gfswrtyxgsxakkpgduda`, function `transfer-ingest`, con `verify_jwt: false` (mismo valor que la versión actual — confirmar con `mcp__claude_ai_Supabase__list_edge_functions` antes de desplegar).

Este paso se ejecuta como parte del Task 1 Step 3 (inmediatamente después de aplicar la migración a producción) — si esta Task se hace por separado, no soltar el checkpoint de Task 1 hasta que esta Task esté desplegada.

- [ ] **Step 3: Verificación manual**

Provocar (o esperar) un correo de pago de TC / cuotas Coopeuch / pago de servicio con regla de categoría, y confirmar en `ingest_failures` (Supabase) que no aparece ningún error nuevo `bad_amount`/`insert_failed` asociado a estos cambios. Alternativa más rápida: correr manualmente el payload de prueba contra el endpoint (igual que se hizo para `giro_cajero` en la sesión anterior) y confirmar `category_matched: true` en la respuesta.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/transfer-ingest/index.ts
git commit -m "fix(transfer-ingest): categories ya no tiene columna month"
```

---

## Task 9: Cierre — borrar la tabla vieja y checklist final

**Files:**
- Ninguno (solo SQL vía MCP + checklist).

**Interfaces:**
- Consumes: todo lo anterior debe estar aplicado y verificado en producción.

- [ ] **Step 1: Confirmar que todas las pantallas quedaron QA'eadas**

Repasar los Steps de "Verificación manual" de las Tasks 4, 5, 6, 7 y 8 — todos deben estar en verde. Si alguno falló, no seguir a Step 2.

- [ ] **Step 2: Borrar `categories_monthly_old`**

Vía `mcp__claude_ai_Supabase__execute_sql` contra producción:

```sql
drop table public.categories_monthly_old;
```

- [ ] **Step 3: Correr `npm run build` una vez más sobre el estado final del repo**

Run: `npm run build`
Expected: build limpio, sin errores ni warnings de tipos relacionados a `categories`/`category_budgets`.

- [ ] **Step 4: Commit final (si quedó algo suelto)**

```bash
git status --short
```

Si hay cambios sin commitear de algún paso anterior, commitearlos ahora con un mensaje descriptivo. Si no hay nada, no hacer un commit vacío.
