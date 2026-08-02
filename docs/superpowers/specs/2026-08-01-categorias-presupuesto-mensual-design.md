# Categorías y presupuesto mensual — separar identidad de asignación

**Creado**: 2026-08-01
**Estado**: Aprobado por el usuario, pendiente de plan de implementación

## Contexto / problema

En Movimientos, los 4 movimientos de agosto de la tarjeta "TC - Ripley" no se podían categorizar. Causa raíz: la tabla `categories` guarda **una fila por mes** (nombre, ícono, color, sección, monto asignado, gastado, todo junto), y agosto no tenía ninguna fila creada — el dropdown de categorizar en Movimientos filtra por `categories.month = mes del movimiento`, así que no había nada para elegir.

Al investigar el modelo se encontró un problema más profundo: **no hay separación entre la identidad de una categoría (nombre, ícono, color) y su presupuesto de un mes concreto (asignado, gastado)**. Esto obliga a recrear cada categoría a mano todos los meses (no existe ningún mecanismo de arrastre en Presupuesto, a diferencia de Compromisos que sí tiene un botón "Traer mes anterior"), y ese botón de Compromisos además matchea categorías **por nombre de texto** contra el mes actual — si una categoría se renombra, el arrastre se rompe en silencio.

El usuario pidió explícitamente resolver esto de raíz: categorías como dato único persistente, presupuesto asignado como dato que cambia mes a mes, con la posibilidad de agregar o retirar una categoría en meses puntuales sin perder historial.

## Decisión de diseño

Separar el modelo en dos tablas:

- **`categories`** — identidad estable de la categoría. Vive una vez, se edita cuando se quiera (el cambio aplica a todos los meses al instante).
- **`category_budgets`** — una fila por (categoría, mes): solo `assigned` y `spent`. Esta es la que cambia mes a mes.

Se evaluaron 2 alternativas más simples (botón "copiar mes anterior" igual al de Compromisos, con o sin auto-ejecución) y se descartaron porque no resuelven el pedido del usuario (categoría como dato único) y heredan el bug de matching por nombre. Ver detalle de las 3 opciones discutidas en la conversación de brainstorming — se optó por la separación de tablas.

## Modelo de datos

### `categories` (reemplaza a la tabla actual del mismo nombre)

```
id            uuid PK
profile_id    uuid FK profiles
name          text
icon          text
color         text
group_name    text  check in ('Fijos','Variables','Ahorro')
fixed         boolean
active        boolean default true   -- nuevo: "retirada" hacia adelante sin borrar historial
created_at    timestamptz
```

### `category_budgets` (nueva)

```
id            uuid PK
category_id   uuid FK categories(id) on delete restrict
month         date
assigned      bigint default 0
spent         bigint default 0        -- se sigue sincronizando por trigger, igual que hoy
unique (category_id, month)
```

### Repunteo de FKs existentes

Antes apuntaban a la fila-por-mes; ahora apuntan a la fila estable:

- `transactions.category_id` → `categories.id` (estable). Esto es lo que arregla el bug original: categorizar un movimiento ya no depende de que exista la fila de presupuesto de ese mes.
- `monthly_commitments.category_id` → `categories.id` (estable). Esto es lo que simplifica Compromisos: un compromiso queda ligado a la MISMA categoría todos los meses, sin matching por nombre.

### Función `ensure_month_budgets(profile_id, month)`

Security definer, mismo patrón que `seed_default_categories` (ya existe en `001_schema.sql`). Por cada categoría `active = true` de ese perfil sin fila en `category_budgets` para ese mes, crea una con `assigned` = el `assigned` de la fila más reciente anterior de esa misma categoría (0 si es la primera vez; `spent` siempre arranca en 0). Idempotente (`insert ... on conflict (category_id, month) do nothing`).

### Trigger `sync_category_spent` (ajuste)

Al categorizar una transacción, además de sumar `spent`, hace upsert de la fila de `category_budgets` de ese (categoría, mes) si todavía no existe. Esto es la red de seguridad que garantiza que categorizar un movimiento en un mes "no preparado" (sin que el usuario haya entrado antes a Presupuesto) nunca falla.

## Cambios por pantalla

### Presupuesto (`app/(app)/presupuesto/page.tsx`)

- Al cargar el mes: llama a `ensure_month_budgets(profile_id, selectedMonth)`, luego trae `category_budgets` del mes con su categoría anidada (`category_budgets.select('*, categories(name,icon,color,group_name,fixed,active)')`). Se aplana el resultado apenas llega para minimizar cambios al resto del render, que sigue usando `cat.assigned`, `cat.spent`, `cat.name`, etc.
- "Agregar categoría" (`CategoryModal`): inserta en dos tablas — la fila estable en `categories` y su primera fila de `category_budgets` para el mes actual.
- "Editar categoría": separa qué campo va a cada tabla — nombre/ícono/color/sección/fijo → `categories` (afecta todos los meses); monto asignado → `category_budgets` de ese mes only.
- Nueva acción **"Retirar del presupuesto"** (`active = false`, no borra historial) junto a la ya existente "Eliminar categoría" (borrado duro, se mantiene el aviso actual de que los movimientos quedan sin categoría).
- `computeSummary` (`lib/utils.ts`) recibe la lista ya aplanada — su firma y lógica interna no cambian.

### Movimientos (`app/(app)/movimientos/page.tsx`)

- `gastoCategoriesFor` deja de filtrar por mes: el dropdown de "Categorizar" muestra las categorías `active`, sin importar si ese mes ya tiene fila de presupuesto. Este es el fix directo del bug reportado.
- No necesita llamar `ensure_month_budgets` — el trigger cubre la creación de la fila de `category_budgets` sobre la marcha si hace falta.

### Compromisos (`app/(app)/compromisos/page.tsx`)

- El dropdown de categoría en `CommitmentModal` deja de depender del mes.
- `copyPreviousMonth` se simplifica: ya no matchea por nombre (se elimina el `categoryByName` Map) — reutiliza `category_id` tal cual, porque la categoría es la misma fila siempre. Desaparece el modo de falla "Faltan categorías equivalentes en este mes".
- El texto "Control presupuestario: $X gastado de $Y asignado" pasa a leer `category_budgets` del mes del compromiso en vez de `categories` directamente.
- El guard `disabled={... || categories.length === 0}` del botón "Traer mes anterior" pasa a verificar "existe al menos una categoría activa" en vez de "el mes ya tiene categorías".
- El placeholder del select de categoría en `CommitmentModal` ("Crea categorías para este mes primero") pasa a "Crea una categoría primero", ya que dejar de estar ligado al mes hace que el mensaje original ya no sea preciso.

### Edge Functions (`supabase/functions/`)

`transfer-ingest/index.ts` tiene 3 lugares que buscan la categoría con `.eq('name', ...).eq('month', month)` (pago de TC, cuotas Coopeuch, y el flujo genérico de "Ahorro - Personal"). Como `categories` deja de tener columna `month`, estas 3 consultas se rompen si no se ajustan — se elimina el `.eq('month', month)` de esas 3 líneas (la búsqueda por nombre+perfil sigue siendo única sin el filtro de mes). `wallet-ingest` y `notif-ingest` ya buscan solo por nombre — no requieren cambios.

### Tipos (`lib/types.ts`)

- `Category`: se le quita `month`/`assigned`/`spent`, se le agrega `active`.
- Nuevo tipo `CategoryBudget`: `{ id, category_id, month, assigned, spent }`.
- Las pantallas que necesitan ambos (Presupuesto, Compromisos) trabajan con el resultado aplanado a nivel de fetch, no con un tipo compartido nuevo — evita sobre-diseñar un tipo genérico que no se usa en más de dos lugares.

## Migración y backfill

Estado actual: `categories` tiene 20 filas en julio y 11 en junio (31 en total).

1. Crear las tablas nuevas (`categories` estable + `category_budgets`) en paralelo, dejando la tabla vieja renombrada temporalmente (ej. `categories_monthly_old`) — no se borra hasta confirmar que todo quedó bien.
2. Agrupar las filas viejas por `(profile_id, nombre)` → una fila estable por grupo en la `categories` nueva (ícono/color/sección/fijo se toman de la fila más reciente del grupo).
3. Por cada fila vieja, crear su `category_budgets` (mes, assigned, spent tal cual estaban).
4. Re-mapear `transactions.category_id` y `monthly_commitments.category_id` de los ids viejos a los nuevos ids estables, usando la agrupación por nombre del paso 2.
5. Actualizar `sync_category_spent`, crear `ensure_month_budgets`, actualizar `seed_default_categories` (usada al crear un perfil nuevo) para que siembre categorías estables + su primera fila de presupuesto.
6. Todo el backfill corre dentro de una transacción SQL — si algo falla a mitad de camino, no queda a medias.

**Riesgos conocidos y aceptados por el usuario** (revisará manualmente por el front una vez migrado):
- Si una categoría fue renombrada entre junio y julio, el backfill la trata como dos categorías distintas (no hay forma automática de detectar un rename).
- Si una categoría cambió de sección (Fijos/Variables/Ahorro) entre esos meses, el backfill se queda con la más reciente — el monto histórico no cambia, solo bajo qué sección aparece agrupado el mes viejo.

## Testing y rollout

1. Correr el backfill completo en una **rama de Supabase** (`create_branch`) antes de tocar producción.
2. Verificar en la rama que los números cuadran exacto: cantidad de `transactions` categorizadas antes = después, cantidad de `monthly_commitments` antes = después, `sum(assigned)` y `sum(spent)` por categoría sin variación respecto a las filas viejas.
3. Aplicar la migración a producción (transacción SQL) y redeployar `transfer-ingest` inmediatamente después (para no dejar una ventana donde el filtro por mes ya no exista en el schema pero el código viejo lo siga usando).
4. QA manual por pantalla (a cargo del usuario):
   - Movimientos: categorizar los 4 movimientos de TC-Ripley de agosto (el caso original).
   - Presupuesto: crear una categoría nueva, editarla, retirarla y confirmar que desaparece de meses futuros pero se mantiene en el historial.
   - Compromisos: usar "Traer mes anterior" y confirmar que las categorías llegan sin el hack de nombre, y que "Control presupuestario" muestra el assigned/spent correcto del mes.
5. Mantener la tabla vieja renombrada un tiempo prudente antes de borrarla definitivamente.

## Fuera de alcance

- No se toca el flujo de creación de perfil más allá de actualizar `seed_default_categories` al nuevo modelo.
- No se agrega UI para fusionar manualmente categorías que el backfill haya separado por rename — si aparece el caso, se resuelve a mano vía SQL en el momento.
- No se cambia el comportamiento de `sync_category_spent` respecto a qué transacciones cuentan como gasto (eso ya está resuelto en la migración 008 y no es parte de este trabajo).
