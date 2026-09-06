// Norte — datos mock multi-usuario (CLP). Expuesto como window.NORTE_DATA
(function () {
  function clp(n, withSign) {
    var v = Math.round(Math.abs(n));
    var s = '$' + v.toLocaleString('es-CL');
    if (withSign) return (n < 0 ? '−' : '+') + s;
    return (n < 0 ? '−' : '') + s;
  }
  function clpShort(n) {
    var a = Math.abs(n);
    if (a >= 1000000) return '$' + (n / 1000000).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + 'M';
    if (a >= 1000) return '$' + Math.round(n / 1000) + 'k';
    return '$' + Math.round(n);
  }
  function sum(arr, key) { return arr.reduce(function (s, x) { return s + x[key]; }, 0); }

  // ── Construye un dataset completo (resumen + insights) desde datos crudos ──
  function buildDataset(raw) {
    var categories = raw.categories;
    var accounts = raw.accounts;
    var goals = raw.goals || [];
    var upcoming = raw.upcoming || [];
    var transactions = raw.transactions || [];
    var subscriptions = raw.subscriptions || [];
    var months = raw.months;
    var dailyFlow = raw.dailyFlow;
    var income = raw.income;

    var assignedTotal = sum(categories, 'assigned');
    var spentTotal = sum(categories, 'spent');
    var unassigned = income - assignedTotal;
    var available = accounts.filter(function (a) { return a.type === 'Cuenta'; }).reduce(function (s, a) { return s + a.balance; }, 0);
    var savings = accounts.filter(function (a) { return a.type === 'Ahorro'; }).reduce(function (s, a) { return s + a.balance; }, 0);
    var variableAssigned = categories.filter(function (c) { return !c.fixed; }).reduce(function (s, c) { return s + c.assigned; }, 0);
    var variableSpent = categories.filter(function (c) { return !c.fixed; }).reduce(function (s, c) { return s + c.spent; }, 0);
    var daysLeft = raw.daysLeft || 12;
    var safeToday = Math.round((variableAssigned - variableSpent) / daysLeft / 100) * 100;
    if (safeToday < 0) safeToday = 0;

    var pace = [];
    var paceTotal = raw.paceTotal || variableAssigned;
    for (var i = 0; i < dailyFlow.length; i++) pace.push(Math.round(paceTotal * (i / 30)));

    var subsTotal = sum(subscriptions, 'amount');
    var unusedSubs = subscriptions.filter(function (x) { return x.used === 'bajo'; });
    var unusedAmount = sum(unusedSubs, 'amount');
    var topCats = categories.filter(function (c) { return c.id !== 'metas'; })
      .slice().sort(function (a, b) { return b.spent - a.spent; }).slice(0, 6);
    var insights = {
      subsTotal: subsTotal,
      unusedSubs: unusedSubs,
      unusedAmount: unusedAmount,
      topCats: topCats,
      avgDaily: Math.round(spentTotal / 18 / 100) * 100,
      biggestDay: raw.biggestDay || { label: '—', amount: 0 },
      projectedEnd: raw.projectedEnd || Math.round(spentTotal * 1.5),
      prevExpense: raw.prevExpense || (months.length > 1 ? months[months.length - 2].expense : 0),
      leaks: raw.leaks || []
    };

    return {
      monthLabel: raw.monthLabel || 'Mayo 2026',
      categories: categories, accounts: accounts, goals: goals, upcoming: upcoming,
      transactions: transactions, subscriptions: subscriptions, insights: insights,
      dailyFlow: dailyFlow, pace: pace, months: months,
      summary: {
        income: income, assignedTotal: assignedTotal, spentTotal: spentTotal,
        unassigned: unassigned, available: available, savings: savings,
        safeToday: safeToday, daysLeft: daysLeft,
        variableAssigned: variableAssigned, variableSpent: variableSpent
      }
    };
  }

  // ══════════════════════════════════════════════
  // PERFIL · Camila (administradora)
  // ══════════════════════════════════════════════
  var camila = buildDataset({
    monthLabel: 'Mayo 2026', income: 1450000, daysLeft: 12, paceTotal: 690000,
    biggestDay: { label: 'Viernes', amount: 78400 }, projectedEnd: 1180000, prevExpense: 1198000,
    categories: [
      { id: 'vivienda',   name: 'Arriendo',        icon: 'home',     group: 'Fijos',     assigned: 480000, spent: 480000, fixed: true,  color: 'slate' },
      { id: 'super',      name: 'Supermercado',    icon: 'cart',     group: 'Variables', assigned: 280000, spent: 198400, fixed: false, color: 'emerald' },
      { id: 'restaurant', name: 'Restaurantes',    icon: 'utensils', group: 'Variables', assigned: 120000, spent: 134500, fixed: false, color: 'red' },
      { id: 'transporte', name: 'Transporte',      icon: 'car',      group: 'Variables', assigned: 90000,  spent: 62300,  fixed: false, color: 'blue' },
      { id: 'servicios',  name: 'Servicios',       icon: 'zap',      group: 'Fijos',     assigned: 110000, spent: 95000,  fixed: true,  color: 'amber' },
      { id: 'subs',       name: 'Suscripciones',   icon: 'repeat',   group: 'Fijos',     assigned: 45000,  spent: 41990,  fixed: true,  color: 'violet' },
      { id: 'salud',      name: 'Salud',           icon: 'heart',    group: 'Variables', assigned: 45000,  spent: 12000,  fixed: false, color: 'emerald' },
      { id: 'ocio',       name: 'Entretenimiento', icon: 'film',     group: 'Variables', assigned: 70000,  spent: 58700,  fixed: false, color: 'blue' },
      { id: 'personal',   name: 'Personal',        icon: 'bag',      group: 'Variables', assigned: 60000,  spent: 23000,  fixed: false, color: 'violet' },
      { id: 'metas',      name: 'Ahorro y metas',  icon: 'target',   group: 'Ahorro',    assigned: 150000, spent: 150000, fixed: true,  color: 'emerald' }
    ],
    accounts: [
      { id: 'cc',     name: 'Cuenta Corriente', bank: 'Banco de Chile', type: 'Cuenta',  balance: 1284500, color: 'emerald' },
      { id: 'vista',  name: 'Cuenta Vista',     bank: 'BancoEstado',    type: 'Cuenta',  balance: 45000,   color: 'blue' },
      { id: 'credito',name: 'Tarjeta Crédito',  bank: 'Santander',      type: 'Crédito', balance: -185400, color: 'red' },
      { id: 'ahorro', name: 'Depósito a plazo', bank: 'Banco de Chile', type: 'Ahorro',  balance: 2350000, color: 'violet' }
    ],
    goals: [
      { id: 'emergencia', name: 'Fondo de emergencia', target: 3000000, current: 2350000, monthly: 150000, due: null,        color: 'emerald' },
      { id: 'vacaciones', name: 'Vacaciones — Sur',    target: 800000,  current: 320000,  monthly: 60000,  due: 'Dic 2026', color: 'blue' },
      { id: 'notebook',   name: 'Notebook nuevo',      target: 650000,  current: 180000,  monthly: 40000,  due: 'Sep 2026', color: 'violet' }
    ],
    upcoming: [
      { id: 'spotify',  name: 'Spotify',        amount: 5500,  inDays: 1, cat: 'subs',       account: 'Tarjeta Crédito' },
      { id: 'gym',      name: 'Gimnasio',       amount: 25990, inDays: 3, cat: 'salud',      account: 'Cuenta Corriente' },
      { id: 'internet', name: 'Internet hogar', amount: 28990, inDays: 6, cat: 'servicios',  account: 'Cuenta Corriente' },
      { id: 'seguro',   name: 'Seguro auto',    amount: 34500, inDays: 9, cat: 'transporte', account: 'Cuenta Corriente' }
    ],
    transactions: [
      { id: 't1',  cat: 'restaurant', name: 'La Picá del Centro',    amount: -18900, date: 'Hoy',    account: 'Crédito',   type: 'gasto' },
      { id: 't2',  cat: 'super',      name: 'Jumbo Costanera',       amount: -42360, date: 'Hoy',    account: 'Corriente', type: 'gasto' },
      { id: 't3',  cat: 'transporte', name: 'Recarga Bip!',          amount: -10000, date: 'Hoy',    account: 'Vista',     type: 'gasto' },
      { id: 't4',  cat: 'ocio',       name: 'Cine Hoyts',            amount: -14800, date: 'Ayer',   account: 'Crédito',   type: 'gasto' },
      { id: 't5',  cat: 'super',      name: 'Lider Express',         amount: -28740, date: 'Ayer',   account: 'Corriente', type: 'gasto' },
      { id: 't6',  cat: 'salud',      name: 'Farmacia Cruz Verde',   amount: -12000, date: 'Ayer',   account: 'Vista',     type: 'gasto' },
      { id: 't7',  cat: null,         name: 'Sueldo — Mayo',         amount: 1450000,date: '5 may',  account: 'Corriente', type: 'ingreso', source: 'Sueldo' },
      { id: 't8',  cat: 'subs',       name: 'Netflix',               amount: -9990,  date: '4 may',  account: 'Crédito',   type: 'gasto', recurring: true },
      { id: 't9',  cat: 'restaurant', name: 'Café Altura',           amount: -6500,  date: '4 may',  account: 'Vista',     type: 'gasto' },
      { id: 't10', cat: 'personal',   name: 'Falabella',             amount: -23000, date: '3 may',  account: 'Crédito',   type: 'gasto' },
      { id: 't11', cat: null,         name: 'Transferencia a Ahorro',amount: -150000,date: '3 may',  account: 'Corriente', type: 'transfer' },
      { id: 't12', cat: 'servicios',  name: 'Enel — electricidad',   amount: -38200, date: '2 may',  account: 'Corriente', type: 'gasto', recurring: true },
      { id: 't13', cat: 'ocio',       name: 'Spotify',               amount: -5500,  date: '2 may',  account: 'Crédito',   type: 'gasto', recurring: true },
      { id: 't14', cat: 'super',      name: 'Unimarc',               amount: -19840, date: '2 may',  account: 'Corriente', type: 'gasto' },
      { id: 't15', cat: 'transporte', name: 'Copec combustible',     amount: -32300, date: '1 may',  account: 'Crédito',   type: 'gasto' },
      { id: 't16', cat: 'vivienda',   name: 'Arriendo departamento', amount: -480000,date: '1 may',  account: 'Corriente', type: 'gasto', recurring: true },
      { id: 't17', cat: 'restaurant', name: 'Sushi Roll',            amount: -22400, date: '1 may',  account: 'Crédito',   type: 'gasto' },
      { id: 't18', cat: 'personal',   name: 'Peluquería',            amount: -15000, date: '30 abr', account: 'Vista',     type: 'gasto' },
      { id: 't19', cat: 'super',      name: 'Jumbo Costanera',       amount: -37620, date: '30 abr', account: 'Corriente', type: 'gasto' },
      { id: 't20', cat: null,         name: 'Reembolso Isapre',      amount: 28500,  date: '29 abr', account: 'Corriente', type: 'ingreso', source: 'Reembolso' },
      { id: 't21', cat: 'ocio',       name: 'Bar La Esquina',        amount: -16200, date: '29 abr', account: 'Crédito',   type: 'gasto' },
      { id: 't22', cat: 'subs',       name: 'iCloud 200GB',          amount: -2700,  date: '28 abr', account: 'Crédito',   type: 'gasto', recurring: true }
    ],
    subscriptions: [
      { id: 's1', name: 'Netflix',        amount: 9990,  cat: 'subs',      day: 4,  color: 'red',     used: 'alto' },
      { id: 's2', name: 'Spotify',        amount: 5500,  cat: 'subs',      day: 2,  color: 'emerald', used: 'alto' },
      { id: 's3', name: 'Gimnasio Energy',amount: 25990, cat: 'salud',     day: 6,  color: 'blue',    used: 'bajo' },
      { id: 's4', name: 'Disney+',        amount: 7900,  cat: 'subs',      day: 12, color: 'violet',  used: 'bajo' },
      { id: 's5', name: 'iCloud 200GB',   amount: 2700,  cat: 'subs',      day: 28, color: 'slate',   used: 'medio' },
      { id: 's6', name: 'Internet hogar', amount: 28990, cat: 'servicios', day: 8,  color: 'amber',   used: 'alto' }
    ],
    months: [
      { m: 'Dic', income: 1520000, expense: 1310000 },
      { m: 'Ene', income: 1450000, expense: 980000 },
      { m: 'Feb', income: 1450000, expense: 1120000 },
      { m: 'Mar', income: 1480000, expense: 1045000 },
      { m: 'Abr', income: 1450000, expense: 1198000 },
      { m: 'May', income: 1450000, expense: 612340, partial: true }
    ],
    dailyFlow: [0, 38200, 38200, 71430, 92330, 145690, 162190, 198550, 221550, 268900,
      289400, 334760, 361060, 402300, 451000, 489200, 538560, 561560, 590460, 612340],
    leaks: [
      { id: 'l1', cat: 'restaurant', label: 'Restaurantes superó su presupuesto', amount: 14500, color: 'red' },
      { id: 'l2', cat: 'subs',       label: 'Disney+ sin uso este mes',           amount: 7900,  color: 'violet' },
      { id: 'l3', cat: 'salud',      label: 'Gimnasio con baja asistencia',       amount: 25990, color: 'blue' }
    ]
  });

  // ══════════════════════════════════════════════
  // PERFIL · Diego (integrante)
  // ══════════════════════════════════════════════
  var diego = buildDataset({
    monthLabel: 'Mayo 2026', income: 980000, daysLeft: 12, paceTotal: 495000,
    biggestDay: { label: 'Sábado', amount: 62000 }, projectedEnd: 760000, prevExpense: 805000,
    categories: [
      { id: 'super',      name: 'Supermercado',    icon: 'cart',     group: 'Variables', assigned: 150000, spent: 96400,  fixed: false, color: 'emerald' },
      { id: 'restaurant', name: 'Restaurantes',    icon: 'utensils', group: 'Variables', assigned: 80000,  spent: 88200,  fixed: false, color: 'red' },
      { id: 'transporte', name: 'Transporte',      icon: 'car',      group: 'Variables', assigned: 140000, spent: 103600, fixed: false, color: 'blue' },
      { id: 'servicios',  name: 'Servicios',       icon: 'zap',      group: 'Fijos',     assigned: 55000,  spent: 52000,  fixed: true,  color: 'amber' },
      { id: 'subs',       name: 'Suscripciones',   icon: 'repeat',   group: 'Fijos',     assigned: 25000,  spent: 23390,  fixed: true,  color: 'violet' },
      { id: 'ocio',       name: 'Entretenimiento', icon: 'film',     group: 'Variables', assigned: 70000,  spent: 51500,  fixed: false, color: 'blue' },
      { id: 'personal',   name: 'Personal',        icon: 'bag',      group: 'Variables', assigned: 55000,  spent: 19000,  fixed: false, color: 'violet' },
      { id: 'metas',      name: 'Ahorro y metas',  icon: 'target',   group: 'Ahorro',    assigned: 120000, spent: 120000, fixed: true,  color: 'emerald' }
    ],
    accounts: [
      { id: 'cc',     name: 'Cuenta Corriente', bank: 'Banco Falabella', type: 'Cuenta',  balance: 540000,  color: 'blue' },
      { id: 'credito',name: 'Tarjeta Crédito',  bank: 'Tenpo',           type: 'Crédito', balance: -92000,  color: 'red' },
      { id: 'ahorro', name: 'Fondo Mutuo',      bank: 'Fintual',         type: 'Ahorro',  balance: 680000,  color: 'violet' }
    ],
    goals: [
      { id: 'emergencia', name: 'Fondo de emergencia', target: 1500000, current: 680000, monthly: 80000,  due: null,        color: 'emerald' },
      { id: 'moto',       name: 'Moto nueva',          target: 1800000, current: 240000, monthly: 100000, due: 'Mar 2027', color: 'blue' }
    ],
    upcoming: [
      { id: 'spotify', name: 'Spotify',     amount: 5500,  inDays: 2, cat: 'subs',       account: 'Tarjeta Crédito' },
      { id: 'gym',     name: 'Crossfit',    amount: 38000, inDays: 5, cat: 'servicios',  account: 'Cuenta Corriente' },
      { id: 'seguro',  name: 'Seguro moto', amount: 22000, inDays: 8, cat: 'transporte', account: 'Cuenta Corriente' }
    ],
    transactions: [
      { id: 'd1',  cat: 'transporte', name: 'Copec combustible',           amount: -28400, date: 'Hoy',    account: 'Crédito',   type: 'gasto' },
      { id: 'd2',  cat: 'restaurant', name: 'Doggis',                      amount: -9800,  date: 'Hoy',    account: 'Crédito',   type: 'gasto' },
      { id: 'd3',  cat: 'super',      name: 'Tottus',                      amount: -31200, date: 'Ayer',   account: 'Corriente', type: 'gasto' },
      { id: 'd4',  cat: null,         name: 'Sueldo — Mayo',               amount: 980000, date: '5 may',  account: 'Corriente', type: 'ingreso', source: 'Sueldo' },
      { id: 'd5',  cat: 'ocio',       name: 'Steam',                       amount: -18900, date: '4 may',  account: 'Crédito',   type: 'gasto' },
      { id: 'd6',  cat: 'subs',       name: 'YouTube Premium',             amount: -7900,  date: '3 may',  account: 'Crédito',   type: 'gasto', recurring: true },
      { id: 'd7',  cat: null,         name: 'Transferencia a Fondo Mutuo', amount: -120000,date: '3 may',  account: 'Corriente', type: 'transfer' },
      { id: 'd8',  cat: 'transporte', name: 'Taller mecánico',             amount: -45000, date: '2 may',  account: 'Corriente', type: 'gasto' },
      { id: 'd9',  cat: 'super',      name: 'Líder',                       amount: -24600, date: '1 may',  account: 'Corriente', type: 'gasto' },
      { id: 'd10', cat: 'servicios',  name: 'Movistar',                    amount: -23390, date: '1 may',  account: 'Corriente', type: 'gasto', recurring: true },
      { id: 'd11', cat: 'personal',   name: 'Sportline',                   amount: -19000, date: '30 abr', account: 'Crédito',   type: 'gasto' },
      { id: 'd12', cat: 'restaurant', name: 'Juan Maestro',                amount: -12400, date: '29 abr', account: 'Crédito',   type: 'gasto' }
    ],
    subscriptions: [
      { id: 's1', name: 'Spotify',          amount: 5500,  cat: 'subs',      day: 2,  color: 'emerald', used: 'alto' },
      { id: 's2', name: 'YouTube Premium',  amount: 7900,  cat: 'subs',      day: 3,  color: 'red',     used: 'alto' },
      { id: 's3', name: 'Crossfit',         amount: 38000, cat: 'servicios', day: 5,  color: 'blue',    used: 'medio' },
      { id: 's4', name: 'PlayStation Plus', amount: 9990,  cat: 'ocio',      day: 14, color: 'violet',  used: 'bajo' }
    ],
    months: [
      { m: 'Dic', income: 1050000, expense: 910000 },
      { m: 'Ene', income: 980000,  expense: 720000 },
      { m: 'Feb', income: 980000,  expense: 840000 },
      { m: 'Mar', income: 980000,  expense: 690000 },
      { m: 'Abr', income: 980000,  expense: 805000 },
      { m: 'May', income: 980000,  expense: 430690, partial: true }
    ],
    dailyFlow: [0, 28400, 38200, 69400, 88300, 134800, 153700, 161600, 184990, 230000,
      254600, 277990, 322990, 367990, 392590, 401690, 412090, 420690, 425690, 430690],
    leaks: [
      { id: 'l1', cat: 'restaurant', label: 'Restaurantes superó su presupuesto', amount: 8200,  color: 'red' },
      { id: 'l2', cat: 'ocio',       label: 'PlayStation Plus sin uso',           amount: 9990,  color: 'violet' },
      { id: 'l3', cat: 'transporte', label: 'Taller mecánico no presupuestado',   amount: 45000, color: 'blue' }
    ]
  });

  // ── Dataset inicial para integrantes nuevos ──
  function starterDataset(income) {
    income = income || 700000;
    function rk(f) { return Math.round(income * f / 1000) * 1000; }
    var cats = [
      { id: 'super',      name: 'Supermercado',    icon: 'cart',   group: 'Variables', assigned: rk(0.2),  spent: rk(0.1),  fixed: false, color: 'emerald' },
      { id: 'transporte', name: 'Transporte',      icon: 'car',    group: 'Variables', assigned: rk(0.1),  spent: rk(0.05), fixed: false, color: 'blue' },
      { id: 'ocio',       name: 'Entretenimiento', icon: 'film',   group: 'Variables', assigned: rk(0.08), spent: rk(0.03), fixed: false, color: 'violet' },
      { id: 'metas',      name: 'Ahorro y metas',  icon: 'target', group: 'Ahorro',    assigned: rk(0.12), spent: rk(0.12), fixed: true,  color: 'emerald' }
    ];
    var spent = sum(cats, 'spent');
    var flow = []; for (var i = 0; i < 14; i++) flow.push(Math.round(spent * (i / 13)));
    return buildDataset({
      monthLabel: 'Mayo 2026', income: income, categories: cats,
      accounts: [{ id: 'cc', name: 'Cuenta principal', bank: '—', type: 'Cuenta', balance: rk(0.4), color: 'emerald' }],
      goals: [{ id: 'meta1', name: 'Fondo de emergencia', target: income * 2, current: rk(0.3), monthly: rk(0.12), due: null, color: 'emerald' }],
      upcoming: [], transactions: [], subscriptions: [],
      months: [{ m: 'Abr', income: income, expense: Math.round(income * 0.55) }, { m: 'May', income: income, expense: spent, partial: true }],
      dailyFlow: flow, paceTotal: cats.filter(function (c) { return !c.fixed; }).reduce(function (s, c) { return s + c.assigned; }, 0),
      leaks: [], biggestDay: { label: '—', amount: 0 }, projectedEnd: Math.round(spent * 1.6), prevExpense: Math.round(income * 0.55)
    });
  }

  // ── Perfiles familiares ──
  var users = [
    { id: 'marcelo', name: 'Marcelo', full: 'Marcelo Moya', initials: 'MM', color: 'emerald', role: 'Admin', income: 1450000 },
    { id: 'diego',  name: 'Diego',  full: 'Diego Rojas',  initials: 'DR', color: 'blue',    role: 'Pro',     income: 980000 }
  ];
  var datasets = { marcelo: camila, diego: diego };

  var DATA = { clp: clp, clpShort: clpShort, users: users, datasets: datasets, activeUserId: 'marcelo' };

  function applyUser(id) {
    var d = datasets[id]; if (!d) return;
    DATA.activeUserId = id;
    DATA.monthLabel = d.monthLabel;
    DATA.categories = d.categories;
    DATA.accounts = d.accounts;
    DATA.goals = d.goals;
    DATA.upcoming = d.upcoming;
    DATA.transactions = d.transactions;
    DATA.subscriptions = d.subscriptions;
    DATA.insights = d.insights;
    DATA.dailyFlow = d.dailyFlow;
    DATA.pace = d.pace;
    DATA.months = d.months;
    DATA.summary = d.summary;
  }
  DATA.setUser = function (id) { applyUser(id); };
  DATA.activeUser = function () { return users.filter(function (u) { return u.id === DATA.activeUserId; })[0]; };
  DATA.addUser = function (cfg) {
    var base = (cfg.name || 'Nuevo').trim();
    var id = base.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Date.now().toString(36);
    var parts = base.split(/\s+/);
    var initials = (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
    var user = { id: id, name: parts[0], full: base, initials: initials, color: cfg.color || 'amber', role: cfg.role || 'Pro', income: cfg.income || 700000 };
    users.push(user);
    datasets[id] = starterDataset(cfg.income);
    return id;
  };
  DATA.setRole = function (id, role) {
    var u = users.filter(function (x) { return x.id === id; })[0];
    if (u && id !== 'marcelo') u.role = role;
  };
  DATA.removeUser = function (id) {
    if (id === 'marcelo') return;
    var i = users.map(function (u) { return u.id; }).indexOf(id);
    if (i > -1) users.splice(i, 1);
    delete datasets[id];
    if (DATA.activeUserId === id) applyUser('marcelo');
  };

  applyUser('marcelo');
  window.NORTE_DATA = DATA;
})();
