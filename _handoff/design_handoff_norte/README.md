# Handoff: Norte — App de finanzas personales y familiares

## Overview
**Norte** es una app web de finanzas personales y familiares (estilo YNAB + Monarch + Copilot + PocketGuard), en español, moneda CLP. El objetivo: control fuerte del presupuesto con una interfaz simple, calmada y de aprendizaje rápido. Soporta **múltiples perfiles** dentro de un hogar, con privacidad estricta entre ellos y un rol **Admin** que gestiona a los demás.

La cifra estrella es **"Disponible para gastar hoy"** (estilo PocketGuard). El presupuesto usa el modelo de **sobres por categoría** de YNAB ("cada peso con un propósito").

## About the Design Files
Los archivos de este bundle son **referencias de diseño construidas en HTML/React (vía Babel en el navegador)** — un prototipo de alta fidelidad que muestra el aspecto e interacciones buscadas, **no** código de producción para copiar tal cual. La tarea es **recrear estos diseños en el entorno de la app real** usando los patrones y librerías del codebase destino.

Para producción se recomienda (según el brief original): **Next.js (App Router) + React + TypeScript**, componentes modulares, estado con Zustand o React Context, y persistencia simple (al inicio localStorage o SQLite/Postgres vía Prisma) con base para conectar autenticación después. Tailwind CSS encaja bien con los tokens listados abajo, pero cualquier sistema equivalente sirve.

## Fidelity
**Alta fidelidad (hifi).** Colores, tipografía, espaciado, animaciones e interacciones son finales. Recrear pixel-perfect con las librerías del codebase. El prototipo incluye datos de demostración (mock) — reemplazar por datos reales/persistidos.

---

## Arquitectura de datos (modelo)
El modelo está implementado en `data.js` y es la mejor referencia. Entidades:

### User (perfil)
```
id: string
name: string            // nombre corto, p.ej. "Marcelo"
full: string            // nombre completo, p.ej. "Marcelo Moya"
initials: string        // "MM" (para avatar)
color: 'emerald'|'blue'|'violet'|'amber'|'red'
role: 'Admin' | 'Pro'   // Admin gestiona; Pro solo ve lo suyo
income: number          // ingreso mensual (CLP)
```
Cada usuario posee su **propio dataset** (categorías, cuentas, metas, movimientos, suscripciones, etc.). **Privacidad:** un usuario solo ve sus propios datos cuando su perfil está activo. El **Admin** es el único que ve la lista completa de integrantes y puede asignar roles / agregar / quitar. Los **Pro** solo ven su propio perfil en Ajustes.

### Category (sobre de presupuesto)
```
id, name, icon, color
group: 'Fijos' | 'Variables' | 'Ahorro'
assigned: number        // monto asignado este mes
spent: number           // gastado
fixed: boolean          // gasto fijo (no cuenta para "disponible hoy")
```
`disponible = assigned - spent`. Estados visuales: verde (ok), ámbar (>88% gastado), rojo (excedido, spent>assigned).

### Account (cuenta)
```
id, name, bank, color
type: 'Cuenta' | 'Crédito' | 'Ahorro'
balance: number         // negativo en crédito = cupo usado
```
`Patrimonio neto = Σ(Cuenta) + Σ(Ahorro) + Σ(Crédito, negativo)`.

### Goal (meta)
```
id, name, color
target: number, current: number, monthly: number  // aporte mensual
due: string | null      // p.ej. "Dic 2026"
```
Proyección: `mesesRestantes = ceil((target - current) / monthly)`.

### Transaction (movimiento)
```
id, name, amount        // negativo=gasto, positivo=ingreso
cat: categoryId | null
date: string            // 'Hoy','Ayer','5 may',...
account: string
type: 'gasto' | 'ingreso' | 'transfer'
recurring?: boolean
source?: string         // origen del ingreso
```

### Subscription
```
id, name, amount, cat, day (día de cobro), color
used: 'alto' | 'medio' | 'bajo'    // nivel de uso (detecta fugas)
```

### Summary (derivado, por usuario)
`income, assignedTotal, spentTotal, unassigned (income-assigned, "Listo para asignar"), available (Σ cuentas líquidas), savings (Σ ahorro), variableAssigned, variableSpent, daysLeft`.
**safeToday ("Disponible para gastar hoy") = round((variableAssigned − variableSpent) / daysLeft)** redondeado a centena, mínimo 0.

### Insights (derivado, para Hábitos)
`subsTotal, unusedSubs[], unusedAmount, topCats[] (categorías ordenadas por gasto), avgDaily, biggestDay {label,amount}, projectedEnd, prevExpense, leaks[] {label,amount,color}`.

---

## Screens / Views
Navegación lateral (escritorio) o tab bar (móvil): **Resumen, Presupuesto, Movimientos, Metas, Cuentas, Hábitos** + **Ajustes** (pie de barra). Topbar contextual por página (título + subtítulo + acción primaria).

### 1. Resumen (Dashboard)
- **Hero "Disponible para gastar hoy"**: cifra gigante (`safeToday`), chip "Ritmo saludable", texto de contexto (días restantes + presupuesto variable restante), barra de ritmo (gastado hoy vs recomendado con marcador "hoy"), 4 acciones rápidas (Agregar gasto/ingreso, Mover dinero, Crear meta). Lateral: anillo de % variable usado + filas (ingreso, asignado, libre por asignar).
- **4 stat cards** con sparkline: Saldo disponible, Gastos del mes, Ahorro acumulado, Libre por asignar. Delta con flecha; color bueno/malo independiente de la dirección.
- **Flujo del mes** (área animada gasto real vs línea punteada de ritmo ideal; tabs "Este mes" / "6 meses" → barras pareadas ingreso/gasto).
- **Presupuesto por categorías** con filtro Todas/Fijos/Variables y **drill-down** (expande movimientos + alerta si excedido + "Mover dinero").
- Lateral: **Gasto por categoría** (donut), **Próximos vencimientos**, **Metas** (mini progreso).

### 2. Presupuesto
- Banner **"Listo para asignar"** (cifra grande; $0 = todo asignado) + barra ingreso vs asignado.
- 4 mini-stats (Ingreso, Asignado, Gastado, Disponible total).
- Grupos **Fijos / Variables / Ahorro**, cada uno con subtotales y filas: icono+nombre(+tag Fijo), asignado, barra+gastado, disponible (color por estado), botón mover.

### 3. Movimientos
- 3 mini-stats (Ingresos, Gastos, Balance).
- Filtros: buscador, chips (Todos/Gastos/Ingresos/Recurrentes), selector de cuenta.
- Lista **agrupada por fecha** con subtotal diario; fila: icono de categoría, nombre (+badge "Recurrente"), categoría, cuenta, monto (verde si ingreso).

### 4. Metas
- 3 mini-stats (Ahorrado, Objetivo total, Aporte mensual).
- Grid de tarjetas: anillo de progreso, nombre, actual/objetivo, fecha, aporte mensual, falta, **proyección "lista en N meses"**, acciones (Aportar / Ajustar). + tarjeta "Crear nueva meta".

### 5. Cuentas
- Hero **Patrimonio neto** con desglose Disponible / Ahorro / Deudas.
- Grupos por tipo (Cuentas, Ahorro e inversión, Tarjetas de crédito); tarjetas con icono, nombre, banco, saldo (rojo si negativo), botón transferir.

### 6. Hábitos
- 3 insight cards narrativos (Resumen, Suscripciones, Proyección fin de mes).
- **Dónde gastas más** (barras horizontales por categoría).
- **Evolución mensual** (barras ingreso/gasto 6 meses).
- **Posibles fugas** (alertas con monto + recorte potencial total/mes).
- **Suscripciones** (lista con nivel de uso alto/medio/bajo).

### 7. Ajustes
- **Apariencia**: tema (Oscuro / Claro clásico, con preview tiles), color de acento (5 swatches), densidad (Compacta/Normal/Amplia).
- **Perfiles**: 
  - **Admin** ve "Perfiles del hogar": nota de privacidad, lista de todos los integrantes con pill de rol, **selector Pro/Admin por integrante**, botón Cambiar, quitar, y "Agregar integrante" (modal).
  - **Pro** ve solo "Mi perfil": su propia tarjeta + nota "los demás perfiles los administra el responsable del hogar". No ve a nadie más.
- **Cuenta y datos**: moneda (CLP), toggles (alertas de presupuesto, detectar suscripciones, resumen por correo).

### Modales
- **Agregar gasto/ingreso/mover/meta**: campo de monto grande con formato CLP en vivo, chips de categoría/origen, selects de cuenta/fecha; acento de color por tipo (gasto rojo, ingreso verde, mover azul, meta violeta). Enter envía. Valida monto > 0.
- **Agregar integrante** (solo Admin): preview de avatar en vivo, nombre, perfil asignado (Pro/Admin), color, ingreso mensual. Crea un perfil **privado** con dataset inicial.

---

## Interactions & Behavior
- **Cambio de perfil**: reescribe todo el dataset activo y re-monta el contenido (`key` por usuario) → re-anima gráficos. El saludo, la barra lateral y todas las páginas reflejan al usuario activo.
- **Drill-down de presupuesto**: clic en categoría expande/colapsa (chevron rota 180°, animación slideDown 0.25s).
- **Toggle Escritorio/Móvil**: el móvil se muestra dentro de un marco de iPhone con tab bar + FAB central.
- **Animaciones de entrada**: líneas de gráfico con stroke-dashoffset (~1.1s cubic-bezier(.4,0,.1,1)), áreas con fade, barras con height + delay escalonado, anillos con stroke-dasharray. Respetar `prefers-reduced-motion`.
- **Toasts** de confirmación (~2.6s) tras cada acción.
- **Hover**: filas con fondo `--surface-2`; botones con brillo/borde.
- **Responsive**: sidebar se oculta ≤920px; grids colapsan; el grid de presupuesto colapsa columnas ≤1240px (mientras el sidebar sigue visible) para evitar overflow.

## State Management
Estado principal (en `app.jsx`, replicar con store/context):
- `activeUserId` — perfil activo; determina el dataset visible.
- `active` — página actual (resumen/presupuesto/.../ajustes).
- `view` — 'desktop' | 'mobile'.
- `modal` — null | 'gasto' | 'ingreso' | 'mover' | 'meta' | 'usuario'.
- `toast` — mensaje efímero.
- Tweaks/Ajustes persistidos: `theme` ('dark'|'light'), `accent`, `density`, `fontUi`, `cards`.
- Operaciones de datos: `setUser`, `addUser`, `removeUser`, `setRole`, registrar gasto/ingreso/transferencia (mutan el dataset del usuario activo).
- **Reglas de permisos**: solo `role==='Admin'` puede listar usuarios, agregar/quitar y `setRole`. El Admin no puede ser quitado ni cambiar su propio rol. Nuevos usuarios → rol `Pro` por defecto.

---

## Design Tokens
Fuente: `styles.css` (tema oscuro por defecto; `.theme-light` = claro clásico).

### Colores — Oscuro (default)
```
--bg: #08090b            --bg-2: #0c0e11
--surface: #111418       --surface-2: #161a1f      --surface-3: #1c2127
--hairline: rgba(255,255,255,.06)   --border: rgba(255,255,255,.085)   --border-strong: rgba(255,255,255,.14)
--text: #f1f3f5          --text-2: #a4abb3         --text-faint: #6a7178
```
### Colores — Claro clásico (.theme-light)
```
--bg: #f4f5f3            --bg-2: #eceeec
--surface: #ffffff       --surface-2: #f7f8f7      --surface-3: #eef0ee
--text: #15191c          --text-2: #545c63         --text-faint: #8a9197
```
### Acento (default esmeralda; intercambiable)
```
emerald #34c98a (default)   blue #4f93f5   violet #9b8cf0   amber #e6b25a   red #ef7a63
```
Texto sobre acento sólido: `#06140e`. Estados: ok=emerald, warn=amber, danger=red.

### Tipografía
```
--font-ui:   'Space Grotesk' (titulares, cifras, etiquetas) — geométrica
--font-body: 'Manrope' (texto)
font-variant-numeric: tabular-nums   // alinea montos
```
Escala aprox.: hero 44–64px / títulos de página 24px / card-title 16.5px / cifras stat 22–26px / cuerpo 13–14px / etiquetas 11–12px. `letter-spacing` negativo en cifras grandes (-.6 a -2px).

### Radios / espaciado / sombra
```
--radius: 18px   --radius-sm: 12px   (compact 14 / comfy 22)
--gap: 18px      --pad: 22px         (compact 13/16 · comfy 24/28)
--shadow: 0 1px 2px rgba(0,0,0,.4), 0 12px 32px -12px rgba(0,0,0,.55)
```
Estilos de tarjeta intercambiables: `borde` (default), `sombra`, `glass` (backdrop-blur).

### Formato CLP
`$1.450.000` (es-CL, sin decimales, miles con punto). Negativos con `−` (signo menos U+2212). Helpers `clp()` y `clpShort()` ($2,4M / $45k) en `data.js`.

## Assets
- **Sin imágenes externas.** Iconos = set propio de trazo simple en `icons.jsx` (componente `<Icon name size/>`, currentColor). Sustituir por la librería de iconos del codebase (Lucide encaja con el estilo de trazo).
- Fuentes: Google Fonts (Space Grotesk, Manrope).
- Logo: glifo SVG inline tipo estrella de 4 puntas (en `components.jsx` `Logo`).
- Marco de iPhone: `ios-frame.jsx` (solo para la vista móvil del prototipo; no se porta).

## Files
Prototipo (en la raíz del proyecto) — referencia, no producción:
- `Norte.html` — punto de entrada (carga scripts vía Babel).
- `data.js` — **modelo de datos + datasets mock + lógica de perfiles/roles** (la mejor referencia del dominio).
- `app.jsx` — app, estado, router, modales de movimiento, vistas escritorio/móvil, Tweaks.
- `components.jsx` — Sidebar, Topbar, HeroCard, StatCard, FlowCard, BudgetCard, CategoryDonut, UpcomingCard, GoalsCard, Logo.
- `pages.jsx` — Presupuesto, Movimientos, Metas, Cuentas, Hábitos.
- `settings.jsx` — página Ajustes (apariencia + perfiles con permisos) + UserModal.
- `charts.jsx` — gráficos SVG (AreaTrend, BarPairs, Donut, Progress, Spark).
- `icons.jsx` — set de iconos.
- `styles.css` — **tokens + todos los estilos** (oscuro + claro clásico + responsive).
- `tweaks-panel.jsx`, `ios-frame.jsx` — scaffolds del prototipo (no portar).

### Capturas
`screenshots/` — referencia visual de cada pantalla (escritorio, tema oscuro, perfil Admin):
`01-resumen`, `02-presupuesto`, `03-movimientos`, `04-metas`, `05-cuentas`, `06-habitos`, `07-ajustes`. Para ver el código en vivo, abrir `Norte.html` en un navegador.
