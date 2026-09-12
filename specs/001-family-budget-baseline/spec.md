# Feature Specification: Gestión Financiera Familiar (Baseline Actual)

**Feature Branch**: `001-family-budget-baseline`

**Created**: 2026-07-16

**Status**: Draft

**Input**: User description: "Documentar como especificación base el estado actual de la app Norte (finanzas personales y familiares) para que /speckit-converge pueda evaluar el código existente contra un source of intent y detectar trabajo pendiente."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Acceso e identidad multi-perfil (Priority: P1)

Un integrante del hogar entra a Norte, se autentica con su cuenta de Google y accede a su perfil financiero privado dentro del hogar compartido. El primer usuario del hogar (o uno designado) es Admin y puede administrar a los demás integrantes; el resto son Pro y solo ven lo suyo.

**Why this priority**: Sin autenticación e identidad de perfil no existe aislamiento de datos entre integrantes del hogar; es el prerrequisito de todo lo demás.

**Independent Test**: Iniciar sesión con una cuenta Google nueva, verificar que se crea/asocia un perfil, que las categorías por defecto se siembran automáticamente, y que un usuario Pro no puede ver ni administrar otros perfiles.

**Acceptance Scenarios**:

1. **Given** un usuario sin sesión, **When** inicia sesión con Google OAuth, **Then** el sistema crea o recupera su perfil de Norte y lo deja en la app con su dataset propio activo.
2. **Given** un usuario con rol Pro autenticado, **When** navega a Ajustes, **Then** solo ve su propio perfil, sin listado de otros integrantes.
3. **Given** un usuario con rol Admin autenticado, **When** navega a Ajustes, **Then** ve el listado completo de perfiles del hogar y puede cambiar roles, agregar o quitar integrantes (excepto a sí mismo).
4. **Given** un usuario Admin, **When** intenta quitarse su propio rol de Admin o eliminarse a sí mismo, **Then** el sistema lo impide.

---

### User Story 2 - Panel de resumen y "Disponible para gastar hoy" (Priority: P1)

El usuario abre Norte y ve de inmediato cuánto puede gastar hoy sin desviarse del presupuesto, junto con un resumen visual de su mes (ingreso, asignado, gastado, ahorro, patrimonio disponible).

**Why this priority**: Es la propuesta de valor central de la app (estilo PocketGuard); es la pantalla de entrada y el motivo principal de uso diario.

**Independent Test**: Con datos de un perfil cargado, abrir la pantalla Resumen y verificar que la cifra "Disponible para gastar hoy" y las tarjetas de estadísticas reflejan los movimientos y presupuesto reales del mes actual del perfil activo.

**Acceptance Scenarios**:

1. **Given** un perfil con categorías, cuentas, metas y movimientos del mes, **When** el usuario abre Resumen, **Then** ve la cifra "Disponible para gastar hoy", el gasto por categoría, el flujo del mes y las próximas metas/vencimientos, todo calculado a partir de datos reales del perfil activo.
2. **Given** un perfil recién creado sin movimientos, **When** el usuario abre Resumen, **Then** el sistema muestra valores en cero/estado vacío en vez de fallar.
3. **Given** el usuario cambia de perfil activo (si es Admin), **When** el cambio ocurre, **Then** todo el dashboard se recalcula y remonta con el dataset del perfil recién seleccionado.

---

### User Story 3 - Presupuesto por sobres (categorías) (Priority: P2)

El usuario asigna montos mensuales a categorías agrupadas en Fijos, Variables y Ahorro, y ve cuánto le queda disponible por categoría a medida que gasta.

**Why this priority**: Es el mecanismo central de control de presupuesto (modelo YNAB de sobres); sin él, la app es solo un registro de gastos.

**Independent Test**: Editar el monto asignado de una categoría y verificar que el "Disponible" de esa categoría y el banner "Listo para asignar" se recalculan de inmediato.

**Acceptance Scenarios**:

1. **Given** el usuario está en Presupuesto, **When** edita el monto asignado de una categoría, **Then** el sistema persiste el cambio y recalcula disponible, subtotales de grupo y "Listo para asignar".
2. **Given** una categoría con gasto mayor a lo asignado, **When** se visualiza en Presupuesto o Resumen, **Then** se marca visualmente como excedida (estado rojo).
3. **Given** una categoría marcada como fija, **When** se calcula "Disponible para gastar hoy", **Then** su gasto no se incluye en el cálculo del disponible variable diario.

---

### User Story 4 - Registro y consulta de movimientos (Priority: P2)

El usuario registra manualmente gastos, ingresos o transferencias entre cuentas, y puede buscar/filtrar su historial de movimientos por texto, tipo o cuenta.

**Why this priority**: Es la base de datos que alimenta presupuesto, resumen y hábitos; debe existir de forma confiable antes de que el resto tenga sentido.

**Independent Test**: Crear un gasto vía el modal correspondiente y verificar que aparece agrupado por fecha en Movimientos, con el monto correcto y afectando el saldo de la cuenta asociada.

**Acceptance Scenarios**:

1. **Given** el usuario abre el modal de agregar gasto/ingreso, **When** completa monto, categoría/origen, cuenta y fecha y confirma, **Then** el movimiento se guarda, la lista de Movimientos se actualiza agrupada por fecha con subtotal diario, y el saldo de la cuenta afectada se actualiza.
2. **Given** una lista de movimientos, **When** el usuario busca por texto o filtra por tipo (gasto/ingreso/recurrente) o por cuenta, **Then** la lista se reduce a los movimientos que cumplen el filtro.
3. **Given** un movimiento inválido (monto ≤ 0), **When** el usuario intenta guardarlo, **Then** el sistema rechaza el guardado y muestra el error.

---

### User Story 5 - Ingesta automática de movimientos (Priority: P2)

Los movimientos bancarios y de billeteras digitales se registran automáticamente a partir de notificaciones push (Google Wallet vía MacroDroid), notificaciones de apps bancarias, y correos de transferencia de Gmail, sin que el usuario los tipee a mano.

**Why this priority**: Es la ventaja diferenciadora de Norte frente a un registro manual puro; reduce la fricción que hace fracasar a la mayoría de apps de presupuesto.

**Independent Test**: Enviar un payload de prueba autenticado al endpoint de una de las funciones de ingesta (wallet-ingest, notif-ingest o transfer-ingest) y verificar que se crea el movimiento correspondiente o se registra en `ingest_failures` si no puede procesarse.

**Acceptance Scenarios**:

1. **Given** una notificación push de Google Wallet reenviada por MacroDroid con el header secreto correcto, **When** llega a `wallet-ingest`, **Then** el sistema crea el movimiento correspondiente asociado a la cuenta y perfil correctos.
2. **Given** una notificación de una app bancaria conocida, **When** llega a `notif-ingest`, **Then** el sistema la parsea, evita duplicarla si ya fue ingresada por Wallet, y crea el movimiento.
3. **Given** un correo de transferencia bancaria reenviado por el Apps Script de Gmail, **When** llega a `transfer-ingest`, **Then** el sistema identifica la cuenta por número/RUT/nombre, crea el movimiento y lo vincula a un compromiso mensual si corresponde.
4. **Given** un payload sin el header/secreto de autenticación válido, **When** llega a cualquier función de ingesta, **Then** el sistema lo rechaza sin crear movimientos.
5. **Given** un payload que no puede parsearse o vincularse a una cuenta, **When** ocurre el fallo, **Then** el sistema lo registra en un log de fallos de ingesta para revisión manual, sin perder el evento silenciosamente.

---

### User Story 6 - Metas de ahorro (Priority: P3)

El usuario crea metas de ahorro con un objetivo, aporte mensual y fecha límite opcional, aporta manualmente a ellas y ve una proyección de cuándo se completarán.

**Why this priority**: Aporta valor motivacional y de planificación a mediano plazo, pero la app es utilizable sin metas.

**Independent Test**: Crear una meta con objetivo y aporte mensual, y verificar que la proyección "lista en N meses" se calcula correctamente a partir de `(objetivo - actual) / aporte mensual`.

**Acceptance Scenarios**:

1. **Given** el usuario crea una meta nueva con objetivo, aporte mensual y color, **When** confirma, **Then** la meta aparece en Metas con anillo de progreso en 0% (o el aporte inicial indicado).
2. **Given** una meta existente, **When** el usuario aporta un monto manualmente, **Then** el progreso y la proyección de meses restantes se recalculan.

---

### User Story 7 - Cuentas y patrimonio neto (Priority: P3)

El usuario ve todas sus cuentas (corrientes, ahorro, crédito) agrupadas por tipo, con su saldo, y un total de patrimonio neto que resta la deuda de crédito.

**Why this priority**: Da visión consolidada de la situación financiera total, complementaria al presupuesto mensual.

**Independent Test**: Con cuentas de los tres tipos cargadas, verificar que el patrimonio neto mostrado es igual a la suma de cuentas líquidas y ahorro menos el saldo usado de crédito.

**Acceptance Scenarios**:

1. **Given** cuentas de tipo Cuenta, Ahorro y Crédito con saldos, **When** el usuario abre Cuentas, **Then** ve el patrimonio neto y el desglose Disponible/Ahorro/Deudas, y las tarjetas de crédito con saldo negativo se muestran en rojo.
2. **Given** una cuenta existente, **When** el usuario sube una imagen personalizada para ella (máx. 3 MiB, tipo `image/*`), **Then** la imagen queda asociada a la cuenta y visible en su tarjeta; un archivo que no sea imagen o exceda el tamaño máximo se rechaza sin modificar la cuenta.

---

### User Story 8 - Hábitos e insights de gasto (Priority: P3)

El usuario ve un análisis de sus patrones de gasto: categorías donde más gasta, evolución mensual, suscripciones con bajo uso ("fugas") y una proyección de cierre de mes.

**Why this priority**: Ayuda a la toma de decisiones y a reducir gasto hormiga, pero no es indispensable para el uso básico de la app.

**Independent Test**: Con datos de suscripciones y movimientos de varios meses, verificar que las suscripciones marcadas de uso "bajo" aparecen listadas como posibles fugas con su monto de ahorro potencial.

**Acceptance Scenarios**:

1. **Given** movimientos de los últimos meses, **When** el usuario abre Hábitos, **Then** ve las categorías de mayor gasto, la evolución mensual ingreso/gasto y una proyección de fin de mes basada en el promedio diario.
2. **Given** suscripciones con nivel de uso "bajo", **When** se muestran en Hábitos, **Then** aparecen listadas como fugas potenciales junto al monto total de ahorro estimado.

---

### User Story 9 - Compromisos mensuales (Priority: P3)

El usuario gestiona una lista de pagos recurrentes esperados cada mes (arriendo, servicios, suscripciones grandes) y el sistema detecta automáticamente cuándo cada uno fue pagado a partir de los movimientos ingresados o ingestados.

**Why this priority**: Extiende el control de presupuesto a compromisos fijos de forma proactiva, pero es una capa adicional sobre el registro base de movimientos.

**Independent Test**: Registrar un compromiso mensual y, al ingresar (manual o vía ingesta) un movimiento que calce con su monto/cuenta esperada, verificar que su estado cambia de "pendiente" a "pagado" automáticamente.

**Acceptance Scenarios**:

1. **Given** un compromiso mensual configurado, **When** llega el mes sin un movimiento que lo cubra, **Then** su estado es "pendiente" y, tras la fecha esperada, pasa a "vencido".
2. **Given** un compromiso mensual, **When** un movimiento (manual o ingestado) calza con su monto y cuenta esperados, **Then** el compromiso pasa a estado "pagado" y queda vinculado a ese movimiento.
3. **Given** un compromiso detectado automáticamente por una integración pero no confirmado, **When** se lista en Compromisos, **Then** se distingue como "detectado" hasta confirmación o hasta omitirse.
4. **Given** un compromiso marcado como PAC (pago automático de cuentas) con un `due_day` fijo, **When** llega ese día del mes, **Then** el sistema MUST generar el movimiento y marcar el compromiso "pagado" sin depender de una notificación externa — algunos cargos PAC (ej. donaciones) no generan notificación al celular y quedarían silenciosamente fuera del registro si se dependiera solo de la ingesta.

---

### User Story 10 - Personalización y administración de cuenta (Priority: P3)

El usuario ajusta apariencia (tema oscuro/claro, color de acento, densidad) y preferencias de cuenta (moneda, alertas de presupuesto, detección de suscripciones, resumen por correo).

**Why this priority**: Mejora la experiencia y adecuación personal, pero no bloquea ninguna funcionalidad financiera central.

**Independent Test**: Cambiar el tema a claro y el acento a otro color, recargar la app y verificar que la preferencia persiste para ese usuario.

**Acceptance Scenarios**:

1. **Given** el usuario cambia tema, acento o densidad en Ajustes, **When** navega a otra pantalla o recarga, **Then** la preferencia se mantiene aplicada.

---

### Edge Cases

- ¿Qué pasa si dos integrantes del hogar intentan editar la misma categoría/cuenta al mismo tiempo? (última escritura gana, sin bloqueo optimista documentado)
- ¿Qué pasa si una notificación de ingesta llega duplicada desde Wallet y desde la app bancaria para la misma transacción? El sistema debe deduplicar antes de crear un segundo movimiento.
- ¿Qué pasa si el Admin único del hogar se elimina a sí mismo o pierde acceso? Debe estar bloqueado por regla de permisos (no se puede quitar el propio rol de Admin).
- ¿Qué pasa si un perfil Pro intenta acceder a la API/datos de otro perfil directamente (bypass de UI)? Las políticas RLS de la base de datos deben impedirlo, no solo la UI.
- ¿Qué pasa si `daysLeft` es 0 al calcular "Disponible para gastar hoy"? El cálculo debe evitar división por cero.
- ¿Qué pasa si una función de ingesta recibe un payload malformado o de un banco no soportado? Debe registrarse en `ingest_failures` en vez de fallar silenciosamente o crear datos corruptos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST autenticar usuarios mediante Google OAuth (Supabase Auth) antes de dar acceso a cualquier dato financiero.
- **FR-002**: El sistema MUST crear o vincular automáticamente un perfil de Norte al primer login de un usuario, sembrando categorías por defecto.
- **FR-003**: El sistema MUST aislar los datos (categorías, cuentas, metas, movimientos, suscripciones, compromisos) por perfil, de forma que un perfil Pro solo pueda leer/escribir su propio dataset.
- **FR-004**: El sistema MUST permitir que cualquier perfil con rol Admin liste todos los perfiles del hogar. Cambiar roles y agregar/quitar integrantes MUST estar reservado a un único perfil **SuperAdmin** (hoy, el hogar fundador identificado por email fijo), no a todo perfil con rol Admin. Esta es una decisión de producto deliberada, no un defecto: mientras el hogar tenga un solo administrador real, no hace falta abrir la gestión a más perfiles; se revisará cuando exista un segundo Admin legítimo.
- **FR-005**: El sistema MUST impedir que el SuperAdmin se quite a sí mismo el rol de Admin o se elimine a sí mismo.
- **FR-006**: El sistema MUST calcular "Disponible para gastar hoy" como `round((asignado_variable − gastado_variable) / días_restantes_del_mes)`, con mínimo 0 y sin dividir por cero.
- **FR-007**: El sistema MUST permitir asignar y editar un monto mensual por categoría, agrupada en Fijos, Variables o Ahorro.
- **FR-008**: El sistema MUST marcar visualmente una categoría como excedida cuando el gasto supera lo asignado, y como en alerta cuando supera ~88% de lo asignado.
- **FR-009**: El sistema MUST excluir el gasto de categorías marcadas como fijas del cálculo del disponible variable diario.
- **FR-010**: El sistema MUST permitir registrar manualmente gastos, ingresos y transferencias entre cuentas, actualizando el saldo de la(s) cuenta(s) afectada(s).
- **FR-011**: El sistema MUST validar que el monto de un movimiento sea mayor a 0 antes de guardarlo.
- **FR-012**: El sistema MUST permitir buscar y filtrar movimientos por texto, tipo (gasto/ingreso/recurrente) y cuenta.
- **FR-013**: El sistema MUST recibir e ingerir movimientos automáticamente desde tres fuentes externas: notificaciones de Google Wallet (vía MacroDroid), notificaciones de apps bancarias, y correos de transferencia de Gmail (vía Apps Script).
- **FR-014**: El sistema MUST autenticar cada request a las funciones de ingesta mediante un header/secreto, rechazando los que no lo incluyan.
- **FR-015**: El sistema MUST deduplicar movimientos cuando el mismo evento llega por más de una vía de ingesta (p. ej. Wallet y notificación bancaria).
- **FR-016**: El sistema MUST registrar en un log de fallos (`ingest_failures`) cualquier payload de ingesta que no pueda parsearse o vincularse a una cuenta/perfil.
- **FR-017**: El sistema MUST permitir crear metas de ahorro con objetivo, aporte mensual, color y fecha límite opcional, y aportar manualmente a ellas.
- **FR-018**: El sistema MUST calcular la proyección de meses restantes de una meta como `ceil((objetivo − actual) / aporte_mensual)`.
- **FR-019**: El sistema MUST calcular y mostrar el patrimonio neto como la suma de cuentas líquidas y de ahorro menos el saldo usado de las cuentas de crédito.
- **FR-019a**: El sistema MUST permitir subir una imagen personalizada por cuenta (máx. 3 MiB, `content-type` `image/*`), rechazando archivos que no sean imagen o excedan el tamaño máximo sin modificar la cuenta.
- **FR-020**: El sistema MUST calcular insights de hábitos: categorías de mayor gasto, promedio diario, proyección de cierre de mes, y suscripciones con bajo uso como fugas potenciales.
- **FR-021**: El sistema MUST permitir registrar compromisos mensuales recurrentes y transicionar su estado (pendiente, detectado, pagado, vencido, omitido, sin_gasto) automáticamente cuando un movimiento coincidente se registra o se ingesta.
- **FR-021a**: El sistema MUST generar automáticamente, el día `due_day` de cada mes, el movimiento y el estado "pagado" de todo compromiso marcado como PAC (`payment_method = 'PAC'`), sin depender de una notificación bancaria externa.
- **FR-022**: El sistema MUST persistir preferencias de apariencia (tema, acento, densidad) y de cuenta (moneda, alertas, detección de suscripciones, resumen por correo) por usuario.
- **FR-023**: El sistema MUST formatear todos los montos monetarios en pesos chilenos (CLP) sin decimales, con separador de miles y signo menos unicode para negativos.

### Key Entities

- **Profile (Perfil)**: Integrante del hogar vinculado a un usuario autenticado; tiene nombre, iniciales, color, rol (Admin/Pro) e ingreso mensual. Es el límite de aislamiento de datos.
- **Category (Categoría)**: Sobre de presupuesto de un perfil; pertenece a un grupo (Fijos/Variables/Ahorro), tiene monto asignado y gastado del mes, y un indicador de si es fija.
- **Account (Cuenta)**: Cuenta bancaria/billetera de un perfil; tiene tipo (Cuenta/Crédito/Ahorro), banco y saldo.
- **Goal (Meta)**: Objetivo de ahorro de un perfil con monto objetivo, monto actual, aporte mensual y fecha límite opcional.
- **Transaction (Movimiento)**: Gasto, ingreso o transferencia de un perfil; referencia una categoría y/o cuenta, tiene monto, fecha y origen (manual o ingesta automática).
- **Subscription (Suscripción)**: Cargo recurrente de un perfil con día de cobro y nivel de uso (alto/medio/bajo), usado para detectar fugas de gasto.
- **MonthlyCommitment (Compromiso mensual)**: Pago recurrente esperado de un perfil, con estado de ciclo de vida propio, vinculado opcionalmente a un movimiento que lo satisface.
- **IngestFailure (Fallo de ingesta)**: Registro de un payload de ingesta automática que no pudo procesarse, para revisión manual.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un usuario nuevo del hogar puede iniciar sesión y ver su primer perfil funcional (con categorías por defecto) en menos de 30 segundos desde el click de login.
- **SC-002**: Un perfil Pro nunca puede leer ni modificar datos de otro perfil, verificado tanto desde la interfaz como directamente contra las políticas de la base de datos.
- **SC-003**: Al menos el 80% de los movimientos bancarios del usuario se registran automáticamente vía ingesta (Wallet, notificaciones o Gmail) sin intervención manual.
- **SC-004**: La cifra "Disponible para gastar hoy" se actualiza de forma consistente e inmediata tras registrar cualquier movimiento o cambio de asignación de presupuesto.
- **SC-005**: Un usuario puede identificar sus 3 principales fugas de gasto (suscripciones de bajo uso) en la pantalla de Hábitos sin necesitar exportar o analizar datos externamente.
- **SC-006**: Ningún payload de ingesta automática se pierde silenciosamente: todo evento no procesable queda visible en el log de fallos.

## Assumptions

- El hogar tiene un único método de autenticación (Google OAuth); no se requiere email/password ni otros proveedores.
- La moneda es exclusivamente CLP; no se requiere soporte multi-moneda en este baseline.
- La ingesta automática está acotada al ecosistema descrito (Google Wallet vía MacroDroid, apps bancarias chilenas, Gmail vía Apps Script); no se asume una integración bancaria directa (Open Banking/API oficial).
- El rol Admin es asignado manualmente (no hay flujo de "primer usuario = Admin" documentado como requerimiento separado); se asume que ya existe al menos un Admin por hogar.
- "Compromisos mensuales" se documenta como parte del baseline porque ya existe implementado en el código, aunque no aparecía en el documento de diseño original.
- No se asume una app móvil nativa; el soporte "móvil" es responsive web.
