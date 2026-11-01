// Financier 3.0 — Unified Core Engine (Math, State Migration, Validation & Analytics)
export const IMPORTANCE = {
  unrated: 'Не оценено',
  unnecessary: 'Не нужно',
  wanted: 'Хотелось',
  needed: 'Нужно',
  essential: 'Обязательно'
};

export const TYPES = {
  expense: 'Расход',
  income: 'Доход',
  transfer: 'Перевод',
  lend: 'Дал в долг',
  borrow: 'Взял в долг',
  repay_in: 'Получил возврат',
  repay_out: 'Вернул долг',
  adjustment_in: 'Корректировка +',
  adjustment_out: 'Корректировка −'
};

export const uid = () => globalThis.crypto.randomUUID();

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function validDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v;
}

// Safe arithmetic expression parser ("250+180" -> 430)
export function calculate(raw) {
  const source = String(raw ?? '').replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s/g, '');
  if (!source || source.length > 200 || /[^\d.+*/()\-]/.test(source)) throw Error('Введи сумму или выражение');
  let pos = 0;
  const atom = () => {
    if (source[pos] === '+') { pos++; return atom(); }
    if (source[pos] === '-') { pos++; return -atom(); }
    if (source[pos] === '(') {
      pos++;
      const v = sum();
      if (source[pos++] !== ')') throw Error('Проверь скобки');
      return v;
    }
    const m = source.slice(pos).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (!m) throw Error('Проверь выражение');
    pos += m[0].length;
    return Number(m[0]);
  };
  const product = () => {
    let v = atom();
    while (['*', '/'].includes(source[pos])) {
      const op = source[pos++], n = atom();
      if (op === '/' && n === 0) throw Error('На ноль делить нельзя');
      v = op === '*' ? v * n : v / n;
    }
    return v;
  };
  const sum = () => {
    let v = product();
    while (['+', '-'].includes(source[pos])) {
      const op = source[pos++], n = product();
      v = op === '+' ? v + n : v - n;
    }
    return v;
  };
  const value = sum();
  if (pos !== source.length || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw Error('Проверь выражение');
  return value;
}

export const cents = (v) => {
  let raw = String(v ?? '').trim();
  if (/[+\-*/×÷()]/.test(raw.slice(1))) {
    try { raw = String(Math.round(calculate(raw) * 100) / 100); } catch {}
  }
  const s = raw.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw Error('Введите корректную сумму');
  const [a, b = ''] = s.split('.');
  const n = Number(a) * 100 + Number(b.padEnd(2, '0'));
  if (!Number.isSafeInteger(n)) throw Error('Слишком большая сумма');
  return n;
};

export const rub = (n) => new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: n % 100 ? 2 : 0
}).format((n || 0) / 100);

export const decimal = (n) => ((n || 0) / 100).toFixed(2).replace(/\.00$/, '');

export const pending = (p) => !p.paidTransactionId && p.status !== 'cancelled';

export function initialState() {
  return migrateState({
    version: 1,
    courier: { payday: 4, taxPercent: 4, taxTips: false, fuelPer100: 9.5, fuelPrice: 5850 },
    courierShifts: [],
    courierStatements: [],
    accounts: [],
    categories: [
      { id: 'food', name: 'Продукты и супермаркеты', color: '#10b981', kind: 'expense' },
      { id: 'home', name: 'Жильё и платежи', color: '#3b82f6', kind: 'expense' },
      { id: 'transport', name: 'Транспорт и авто', color: '#f59e0b', kind: 'expense' },
      { id: 'health', name: 'Здоровье и аптека', color: '#ec4899', kind: 'expense' },
      { id: 'joy', name: 'Кафе и для себя', color: '#8b5cf6', kind: 'expense' },
      { id: 'other', name: 'Прочее', color: '#64748b', kind: 'expense' }
    ],
    transactions: [],
    debts: [],
    goals: [],
    plans: [],
    quickActions: [],
    recurringPayments: [],
    completedMonths: [],
    appearance: { theme: 'auto' },
    budget: { income: 0, savings: 0, nextIncome: '', incomeMode: 'courier', caps: {} },
    reports: []
  });
}

export function migrateState(s) {
  s.courier ??= { payday: 4, taxPercent: 4, taxTips: false };
  s.courier.payday ??= 4;
  s.courier.taxPercent ??= 4;
  s.courier.taxTips ??= false;
  s.courier.fuelPer100 ??= 9.5;
  s.courier.fuelPrice ??= 5850;
  s.courierShifts ??= [];
  s.courierStatements ??= [];
  s.budget ??= { income: 0, savings: 0, nextIncome: '', incomeMode: 'courier', caps: {} };
  s.budget.incomeMode ??= 'courier';
  s.budget.caps ??= {};
  s.completedMonths ??= [];
  s.quickActions ??= [];
  s.recurringPayments ??= [];
  s.appearance ??= { theme: 'auto' };
  s.reports ??= [];
  s.notifications ??= {
    enabled: true,
    dayBefore: true,
    sameDay: true,
    overdueNextDay: true,
    hour: 10,
    lastNotifiedDay: ''
  };
  s.notifications.enabled ??= true;
  s.notifications.dayBefore ??= true;
  s.notifications.sameDay ??= true;
  s.notifications.overdueNextDay ??= true;
  s.notifications.hour ??= 10;

  if (!s.v12Installed) {
    for (const c of s.categories) c.kind ??= 'expense';
    const add = (name, parentId = null, working = false, color = '#10b981') => {
      const id = uid();
      s.categories.push({ id, name, parentId, kind: 'income', working, color });
      return id;
    };
    const work = add('Работа и доставка', null, true, '#10b981');
    s.incomeDefaults = {
      x5: add('Доставка', work, true, '#059669'),
      magnit: add('Доставка (доп.)', work, true, '#0d9488'),
      other: add('Другие доходы', null, false, '#6366f1'),
      tips: add('Чаевые', work, true, '#f59e0b')
    };
    s.v12Installed = true;
  }

  for (const c of s.categories) {
    c.kind ??= 'expense';
    if (s.incomeDefaults && c.id === s.incomeDefaults.x5 && c.name === 'X5') {
      c.name = 'Доставка';
    }
  }

  for (const t of s.transactions) {
    if (t.type === 'income' && !t.categoryId) {
      t.categoryId = s.incomeDefaults?.x5 || s.incomeDefaults?.other;
    }
  }

  return syncRecurring(s);
}

export function serviceCategory(s, service) {
  return service === 'Магнит' ? (s.incomeDefaults?.magnit || s.incomeDefaults?.x5) : (s.incomeDefaults?.x5 || s.incomeDefaults?.other);
}

export function balance(s, id, asOf = today()) {
  let n = s.accounts.find(a => a.id === id)?.opening || 0;
  for (const t of s.transactions) {
    if (t.date > asOf) continue;
    if (t.accountId === id) {
      n += ['income', 'borrow', 'repay_in', 'adjustment_in'].includes(t.type) ? t.amount : -t.amount;
    }
    if (t.type === 'transfer' && t.toAccountId === id) {
      n += t.amount;
    }
  }
  return n;
}

export function setAccountBalance(s, id, target, record) {
  if (!Number.isSafeInteger(target)) throw Error('Проверь остаток');
  const a = s.accounts.find(x => x.id === id);
  if (!a) throw Error('Не найден счёт');
  const delta = target - balance(s, id);
  if (!delta) return;
  if (record) {
    s.transactions.push({
      id: uid(),
      type: delta > 0 ? 'adjustment_in' : 'adjustment_out',
      amount: Math.abs(delta),
      date: today(),
      accountId: id,
      note: 'Корректировка остатка',
      createdAt: Date.now()
    });
  } else {
    a.opening += delta;
  }
}

export function isInstallmentDebt(d) {
  return Boolean(d?.isInstallment || (d?.schedule && d.schedule.length > 0));
}

// Signed balance for a person: > 0 means they owe the user ("Мне должны"), < 0 means user owes them ("Я должен")
export function personSignedBalance(s, id) {
  const d = s.debts.find(x => x.id === id);
  if (!d) return 0;
  let bal = (d.direction === 'owed' ? 1 : -1) * (d.opening || 0);
  for (const t of s.transactions) {
    if (t.debtId !== id) continue;
    if (t.type === 'lend' || t.type === 'repay_out') bal += t.amount;
    else if (t.type === 'borrow' || t.type === 'repay_in') bal -= t.amount;
  }
  return bal;
}

export function personDirection(s, id) {
  const d = s.debts.find(x => x.id === id);
  if (!d) return 'owed';
  if (isInstallmentDebt(d)) return 'owe';
  const bal = personSignedBalance(s, id);
  if (bal > 0) return 'owed';
  if (bal < 0) return 'owe';
  return d.direction || 'owed';
}

export function debtRemaining(s, id) {
  const d = s.debts.find(x => x.id === id);
  if (!d) return 0;
  if (!isInstallmentDebt(d)) {
    return Math.abs(personSignedBalance(s, id));
  }
  return Math.max(0, d.opening + s.transactions.filter(t => t.debtId === id).reduce((n, t) => n + (['borrow', 'lend'].includes(t.type) ? t.amount : -t.amount), 0));
}

export function repaymentTotal(s, id) {
  return s.transactions.filter(t => t.debtId === id && ['repay_out', 'repay_in'].includes(t.type)).reduce((n, t) => n + t.amount, 0);
}

export function buildSchedule(total, count, firstDate, interval) {
  if (!Number.isSafeInteger(total) || total <= 0 || !Number.isInteger(count) || count < 1 || count > 120 || total < count || !validDate(firstDate) || !['week', 'fortnight', 'month'].includes(interval)) {
    throw Error('Проверь сумму, число платежей (1–120), дату и интервал');
  }
  const base = Math.floor(total / count), extra = total % count;
  const [y, m, day] = firstDate.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    let date;
    if (interval === 'month') {
      const target = new Date(Date.UTC(y, m - 1 + i, 1, 12));
      const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
      target.setUTCDate(Math.min(day, last));
      date = target.toISOString().slice(0, 10);
    } else {
      date = addDays(firstDate, i * (interval === 'week' ? 7 : 14));
    }
    return { id: uid(), date, amount: base + (i < extra ? 1 : 0) };
  });
}

export function installmentStatus(s, debt) {
  if (!debt?.schedule?.length) return [];
  let paid = Math.max(0, repaymentTotal(s, debt.id) - (debt.schedulePaidBase || 0));
  return [...debt.schedule].sort((a, b) => a.date.localeCompare(b.date)).map(p => {
    const cover = Math.min(p.amount, paid);
    paid -= cover;
    return { ...p, paid: cover, remaining: p.amount - cover };
  });
}

export function categoryPath(s, id) {
  const c = s.categories.find(x => x.id === id);
  return c?.parentId ? `${s.categories.find(p => p.id === c.parentId)?.name || ''} / ${c.name}` : c?.name || 'Прочее';
}

export function categoryMatches(s, actual, filter) {
  return actual === filter || s.categories.some(c => c.id === actual && c.parentId === filter);
}

export function removeCategory(s, id, target) {
  const from = s.categories.find(c => c.id === id), to = s.categories.find(c => c.id === target);
  if (!from || !to || from.kind !== to.kind || target === id || to.parentId === id) {
    throw Error('Выберите другую категорию вне удаляемой группы');
  }
  const ids = new Set([id, ...(!from.parentId ? s.categories.filter(c => c.parentId === id).map(c => c.id) : [])]);
  for (const t of s.transactions) {
    if (ids.has(t.categoryId)) t.categoryId = target;
    for (const i of t.items || []) if (ids.has(i.categoryId)) i.categoryId = target;
    for (const key of ['deductFromCategoryId', 'taxForCategoryId']) if (ids.has(t[key])) t[key] = target;
  }
  for (const key of Object.keys(s.incomeDefaults || {})) if (ids.has(s.incomeDefaults[key])) s.incomeDefaults[key] = target;
  for (const p of [...s.plans, ...(s.quickActions || []), ...(s.recurringPayments || [])]) if (ids.has(p.categoryId)) p.categoryId = target;
  for (const p of s.plans) {
    for (const i of p.items || []) if (ids.has(i.categoryId)) i.categoryId = target;
    for (const key of ['deductFromCategoryId', 'taxForCategoryId']) if (ids.has(p[key])) p[key] = target;
  }
  const movedCap = s.budget.caps[id] || 0;
  for (const key of ids) delete s.budget.caps[key];
  if (movedCap) s.budget.caps[target] = (s.budget.caps[target] || 0) + movedCap;
  s.categories = s.categories.filter(c => !ids.has(c.id));
}

export function expenses(s, from, to) {
  return s.transactions.filter(t => t.type === 'expense' && t.date >= from && t.date <= to).flatMap(t =>
    t.items?.length
      ? t.items.map(i => ({ ...i, date: t.date, transactionId: t.id, accountId: t.accountId }))
      : [{ name: t.note || 'Покупка', amount: t.amount, categoryId: t.categoryId, importance: t.importance || 'unrated', date: t.date, transactionId: t.id, accountId: t.accountId, quantity: 1, unit: 'шт' }]
  );
}

export function summary(s, from, to) {
  const rows = expenses(s, from, to);
  const income = s.transactions.filter(t => t.type === 'income' && t.date >= from && t.date <= to).reduce((n, t) => n + t.amount, 0);
  const category = Object.fromEntries(s.categories.map(c => [c.id, 0]));
  const importance = Object.fromEntries(Object.keys(IMPORTANCE).map(k => [k, 0]));
  const days = {};
  for (const r of rows) {
    category[r.categoryId] = (category[r.categoryId] || 0) + r.amount;
    importance[r.importance] = (importance[r.importance] || 0) + r.amount;
    days[r.date] = (days[r.date] || 0) + r.amount;
  }
  const expense = rows.reduce((n, r) => n + r.amount, 0);
  const rootCategory = Object.fromEntries(s.categories.filter(c => !c.parentId).map(c => [c.id, 0]));
  for (const [id, n] of Object.entries(category)) {
    const c = s.categories.find(x => x.id === id);
    rootCategory[c?.parentId || id] = (rootCategory[c?.parentId || id] || 0) + n;
  }
  return { income, expense, net: income - expense, category, rootCategory, importance, days, rows };
}

export function taxAmount(amount, percent) {
  return Math.round(amount * (percent ?? 0) / 100);
}

export function taxReserve(s) {
  const assessed = {};
  for (const t of s.transactions.filter(t => t.type === 'income')) {
    const id = t.source === 'courierTip' ? (s.incomeDefaults?.x5 || t.categoryId) : t.categoryId;
    assessed[id] = (assessed[id] || 0) + taxAmount(t.amount, t.taxPercent);
  }
  const payments = s.transactions.filter(t => t.type === 'expense' && t.taxForCategoryId);
  for (const t of payments) {
    let amount = t.amount;
    for (const id of Object.keys(assessed).filter(k => categoryMatches(s, k, t.taxForCategoryId))) {
      const used = Math.min(assessed[id], amount);
      assessed[id] -= used;
      amount -= used;
    }
  }
  return Object.values(assessed).reduce((n, v) => n + v, 0);
}

export function nextPayday(s, asOf = today()) {
  const weekday = s.courier?.payday ?? 4;
  const current = new Date(asOf + 'T12:00:00Z').getUTCDay();
  let days = (weekday - current + 7) % 7;
  if (days === 0 && s.transactions.some(t => t.type === 'income' && t.source === 'courier' && t.date === asOf)) days = 7;
  return addDays(asOf, days);
}

export function incomeHorizon(s) {
  return s.budget.incomeMode === 'courier' ? nextPayday(s) : (s.budget.nextIncome && s.budget.nextIncome >= today() ? s.budget.nextIncome : today());
}

export function upcomingPayments(s, until = null) {
  const plans = s.plans.filter(p => pending(p) && (!until || p.date <= until)).map(p => ({
    id: p.id, kind: 'plan', name: p.name, date: p.date, amount: p.amount, categoryId: p.categoryId
  }));
  const debts = s.debts.filter(d => personDirection(s, d.id) === 'owe').flatMap(d => {
    if (d.schedule?.length) {
      return installmentStatus(s, d).filter(p => p.remaining > 0 && (!until || p.date <= until)).map(p => ({
        id: p.id, debtId: d.id, kind: 'installment', name: d.name, date: p.date, amount: p.remaining
      }));
    }
    const rem = debtRemaining(s, d.id);
    return rem > 0 && d.due && (!until || d.due <= until) ? [{ id: d.id, debtId: d.id, kind: 'debt', name: d.name, date: d.due, amount: rem }] : [];
  });
  return [...plans, ...debts].sort((a, b) => a.date.localeCompare(b.date));
}

export function available(s) {
  const cash = s.accounts.filter(a => a.kind !== 'savings').reduce((n, a) => n + balance(s, a.id), 0);
  const end = incomeHorizon(s);
  const duePlans = s.plans.filter(p => pending(p) && p.date <= end).reduce((n, p) => n + p.amount, 0);
  const dueDebts = s.debts.filter(d => personDirection(s, d.id) === 'owe').reduce((n, d) =>
    n + (d.schedule?.length
      ? installmentStatus(s, d).filter(p => p.date <= end).reduce((m, p) => m + p.remaining, 0)
      : (d.due && d.due <= end ? debtRemaining(s, d.id) : 0)), 0);
  const tax = taxReserve(s);
  return { cash, duePlans, dueDebts, savings: s.budget.savings, tax, end, free: cash - duePlans - dueDebts - s.budget.savings - tax };
}

export function freeMoney(s, asOf = today()) {
  const a = available(s);
  const days = Math.max(1, Math.ceil((Date.parse(a.end + 'T12:00:00Z') - Date.parse(asOf + 'T12:00:00Z')) / 86400000));
  return { ...a, days, perDay: Math.floor(Math.max(0, a.free) / days), deficit: Math.max(0, -a.free) };
}

export function statementRemaining(s, id) {
  const r = s.courierStatements.find(x => x.id === id);
  if (!r) return 0;
  const paid = s.transactions.filter(t => t.type === 'income' && t.statementId === id).reduce((n, t) => n + t.amount, 0);
  return Math.max(0, r.amount - paid);
}

export function shiftFuelStats(s, x) {
  if (!x) return { km: 0, liters: 0, cost: 0, fuelPer100: 0, fuelPrice: 0 };
  const hasOdo = x.odoStart !== undefined && x.odoStart !== null && x.odoStart !== '' &&
                 x.odoEnd !== undefined && x.odoEnd !== null && x.odoEnd !== '';
  let km = 0;
  if (hasOdo && Number(x.odoEnd) > Number(x.odoStart)) {
    km = Math.round((Number(x.odoEnd) - Number(x.odoStart)) * 10) / 10;
  } else if (x.km && Number(x.km) > 0) {
    km = Math.round(Number(x.km) * 10) / 10;
  }
  const fuelPer100 = Number(x.fuelPer100 ?? s.courier?.fuelPer100 ?? 0);
  const fuelPrice = Number(x.fuelPrice ?? s.courier?.fuelPrice ?? 0);
  const liters = km > 0 && fuelPer100 > 0 ? Math.round(km * fuelPer100) / 100 : 0;
  const cost = km > 0 && fuelPer100 > 0 && fuelPrice > 0 ? Math.round((km * fuelPer100 / 100) * fuelPrice) : 0;
  return { km, liters, cost, fuelPer100, fuelPrice };
}

export function lastKnownOdometer(s) {
  const sorted = [...(s.courierShifts || [])].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0) || b.date.localeCompare(a.date));
  for (const sh of sorted) {
    if (sh.odoEnd !== undefined && sh.odoEnd !== null && sh.odoEnd !== '' && Number(sh.odoEnd) > 0) return Number(sh.odoEnd);
    if (sh.odoStart !== undefined && sh.odoStart !== null && sh.odoStart !== '' && Number(sh.odoStart) > 0) return Number(sh.odoStart);
  }
  return '';
}

export function shiftLunchState(x, now = Date.now()) {
  const baseRem = x?.lunchRemainingMs !== undefined && x?.lunchRemainingMs !== null ? Number(x.lunchRemainingMs) : 3600000;
  if (x?.lunchStartedAt) {
    const elapsed = Math.max(0, now - Number(x.lunchStartedAt));
    const remainingMs = Math.max(0, baseRem - elapsed);
    return { active: true, remainingMs, elapsedCurrentMs: elapsed };
  }
  return { active: false, remainingMs: Math.max(0, baseRem), elapsedCurrentMs: 0 };
}

export function averageOrderAmountCents(s, orderCount = 1) {
  const n = Math.max(1, Number(orderCount) || 1);
  const baseDefaults = { 1: 21500, 2: 40000, 3: 44000 };
  const fallback = baseDefaults[n] || (n * 15000);
  const matching = [];
  for (const sh of (s.courierShifts || [])) {
    for (const e of (sh.entries || [])) {
      if (Number(e.orders) === n && Number.isFinite(e.amount) && e.amount > 0) {
        matching.push(e.amount);
      }
    }
  }
  if (!matching.length) return fallback;
  const avg = Math.round(matching.reduce((acc, v) => acc + v, 0) / matching.length);
  return avg;
}

export function shiftTotals(s, x) {
  const entries = x.entries || [];
  const tips = s.transactions.filter(t => t.shiftId === x.id && t.source === 'courierTip');
  const earned = entries.length ? entries.reduce((n, e) => n + (e.amount ?? 0), 0) : (x.earned ?? 0);
  const tipTotal = tips.reduce((n, t) => n + t.amount, 0);
  const taxRate = x.taxPercent ?? (x.service === 'X5' ? s.courier.taxPercent : 0);
  const estimatedTax = taxAmount(earned, taxRate) + tips.reduce((n, t) => n + taxAmount(t.amount, t.taxPercent), 0);
  const fuel = shiftFuelStats(s, x);
  return {
    trips: x.entries ? entries.length : null,
    unknown: x.entries ? entries.filter(e => e.amount === null).length : (x.earned === null ? 1 : 0),
    earned,
    tips: tipTotal,
    tax: estimatedTax,
    fuelCost: fuel.cost,
    fuelKm: fuel.km,
    fuelLiters: fuel.liters,
    net: earned + tipTotal - estimatedTax,
    orders: entries.length ? entries.reduce((n, e) => n + e.orders, 0) : x.orders,
    packages: entries.reduce((n, e) => n + (e.packages || 0), 0),
    hours: x.startedAt ? Math.max(0, ((x.endedAt || Date.now()) - x.startedAt) / 3600000) : x.hours
  };
}

export function syncShift(x) {
  const entries = x.entries || [];
  x.earned = entries.reduce((n, e) => n + (e.amount ?? 0), 0);
  x.orders = entries.reduce((n, e) => n + e.orders, 0);
  x.hours = x.endedAt ? Math.round((x.endedAt - x.startedAt) / 36000) / 100 : 0;
}

export function incomeBreakdown(s, from, to) {
  return s.categories.filter(c => c.kind === 'income').map(c => {
    const income = s.transactions.filter(t => t.type === 'income' && t.date >= from && t.date <= to && categoryMatches(s, t.categoryId, c.id));
    const deductions = s.transactions.filter(t => t.type === 'expense' && t.date >= from && t.date <= to && categoryMatches(s, t.deductFromCategoryId || t.taxForCategoryId, c.id)).reduce((n, t) => n + t.amount, 0);
    const gross = income.reduce((n, t) => n + t.amount, 0);
    const estimatedTax = income.reduce((n, t) => n + taxAmount(t.amount, t.taxPercent), 0);
    const taxPaid = s.transactions.filter(t => t.type === 'expense' && t.date >= from && t.date <= to && categoryMatches(s, t.taxForCategoryId, c.id)).reduce((n, t) => n + t.amount, 0);
    return { id: c.id, gross, deductions, net: gross - deductions, estimatedTax, taxPaid };
  }).filter(c => c.gross || c.deductions);
}

export function monthBudget(s, asOf = today(), incomeMode = 'all') {
  const [y, m, day] = asOf.split('-').map(Number);
  const previousEnd = new Date(Date.UTC(y, m - 1, 0, 12)).toISOString().slice(0, 10);
  const previousMonth = previousEnd.slice(0, 7), previousStart = previousMonth + '-01';
  const comparableEnd = previousMonth + '-' + String(Math.min(day, Number(previousEnd.slice(-2)))).padStart(2, '0');
  const current = summary(s, asOf.slice(0, 7) + '-01', asOf);
  const previous = summary(s, previousStart, comparableEnd);
  const full = summary(s, previousStart, previousEnd);
  const complete = s.completedMonths.includes(previousMonth) || full.expense > 0;
  const denominator = s.transactions.filter(t =>
    t.type === 'income' && t.date >= asOf.slice(0, 7) + '-01' && t.date <= asOf &&
    (incomeMode === 'all' || s.categories.find(c => c.id === t.categoryId)?.working || s.categories.find(c => c.id === s.categories.find(x => x.id === t.categoryId)?.parentId)?.working)
  ).reduce((n, t) => n + t.amount, 0);
  return {
    current, previous, previousMonth, previousStart, previousEnd, comparableEnd, complete, denominator,
    suggested: complete ? full.rootCategory : {},
    delta: current.expense - previous.expense,
    percent: previous.expense ? 100 * (current.expense - previous.expense) / previous.expense : null
  };
}

export function recurrenceDate(first, interval, index) {
  if (interval !== 'month') return addDays(first, index * (interval === 'week' ? 7 : 14));
  const [y, m, day] = first.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + index, 1, 12));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

export function syncRecurring(s, asOf = today()) {
  s.plans = s.plans.filter(p => !p.recurringId || p.date <= asOf || p.paidTransactionId || s.recurringPayments.some(r => r.id === p.recurringId && r.enabled));
  let through = addDays(asOf, 120);
  if (s.budget.nextIncome > through) through = s.budget.nextIncome;
  for (const r of s.recurringPayments) {
    if (!r.enabled || !validDate(r.firstDate) || !['week', 'fortnight', 'month'].includes(r.interval)) continue;
    for (let i = 0; i < 6000; i++) {
      const date = recurrenceDate(r.firstDate, r.interval, i);
      if (date > through || (r.endDate && date > r.endDate)) break;
      const id = r.id + ':' + date;
      if (r.skippedDates?.includes(date) || s.plans.some(p => p.id === id)) continue;
      s.plans.push({ id, name: r.name, amount: r.amount, date, categoryId: r.categoryId, recurringId: r.id, paidTransactionId: null });
    }
  }
  return s;
}

export function earningsCalendar(s, from, to) {
  const days = {};
  for (let d = from; d <= to; d = addDays(d, 1)) {
    days[d] = { date: d, confirmed: 0, expected: 0, tips: 0, hasData: false, allocated: false, shifts: [], statements: [] };
  }
  for (const x of s.courierShifts) {
    const day = days[x.date];
    if (!day) continue;
    day.hasData = true;
    day.shifts.push(x.id);
    const covered = s.courierStatements.some(r => r.from <= x.date && r.to >= x.date);
    if (!covered) day.expected += shiftTotals(s, x).earned;
  }
  for (const r of s.courierStatements) {
    const weights = {};
    for (const x of s.courierShifts.filter(sh => sh.date >= r.from && sh.date <= r.to)) {
      const earned = shiftTotals(s, x).earned;
      if (earned > 0) weights[x.date] = (weights[x.date] || 0) + earned;
    }
    const sum = Object.values(weights).reduce((n, v) => n + v, 0);
    if (!sum) {
      if (days[r.to]) {
        days[r.to].confirmed += r.amount;
        days[r.to].hasData = true;
        days[r.to].statements.push({ id: r.id, amount: r.amount, periodOnly: true });
      }
      continue;
    }
    const shares = Object.entries(weights).map(([date, w]) => {
      const exact = r.amount * w / sum;
      return { date, amount: Math.floor(exact), remainder: exact - Math.floor(exact) };
    });
    let remaining = r.amount - shares.reduce((n, p) => n + p.amount, 0);
    shares.sort((a, b) => b.remainder - a.remainder || a.date.localeCompare(b.date));
    for (const p of shares) if (remaining > 0) { p.amount++; remaining--; }
    for (const p of shares) {
      if (days[p.date]) {
        const day = days[p.date];
        day.confirmed += p.amount;
        day.hasData = true;
        day.allocated = true;
        day.statements.push({ id: r.id, amount: p.amount, periodOnly: false });
      }
    }
  }
  for (const t of s.transactions.filter(t => t.type === 'income' && t.source === 'courierTip')) {
    const x = s.courierShifts.find(sh => sh.id === t.shiftId);
    const day = days[x?.date || t.date];
    if (day) { day.tips += t.amount; day.hasData = true; }
  }
  const rows = Object.values(days);
  const confirmed = rows.reduce((n, d) => n + d.confirmed, 0);
  const expected = rows.reduce((n, d) => n + d.expected, 0);
  const tips = rows.reduce((n, d) => n + d.tips, 0);
  const paid = s.transactions.filter(t => t.type === 'income' && t.source === 'courier' && t.date >= from && t.date <= to).reduce((n, t) => n + t.amount, 0);
  return { days: rows, confirmed, expected, tips, paid, total: confirmed + expected + tips, unpaid: s.courierStatements.filter(r => r.to >= from && r.to <= to).reduce((n, r) => n + statementRemaining(s, r.id), 0), allocated: rows.some(d => d.allocated) };
}

export function expectedPayouts(s) {
  let gross = 0, unknown = 0;
  for (const r of s.courierStatements) gross += statementRemaining(s, r.id);
  for (const x of s.courierShifts) {
    if (s.courierStatements.some(r => r.from <= x.date && r.to >= x.date)) continue;
    const t = shiftTotals(s, x);
    unknown += t.unknown;
    gross += t.earned;
  }
  const unlinked = s.transactions.some(t => t.type === 'income' && t.source === 'courier' && !t.statementId);
  const net = gross - taxAmount(gross, s.courier.taxPercent || 0);
  return { gross, net, unknown, unlinked };
}

export function calendarMoney(s, from, to, mode = 'received') {
  const work = earningsCalendar(s, from, to);
  const days = work.days.map(d => ({ ...d, income: 0, expense: 0, estimate: 0, unknown: 0, plans: [], payments: [], transactions: [] }));
  const byDate = Object.fromEntries(days.map(d => [d.date, d]));
  for (const t of s.transactions) {
    const d = byDate[t.date];
    if (!d) continue;
    d.transactions.push(t.id);
    if (t.type === 'expense') d.expense += t.amount;
    if (t.type === 'income' && (mode === 'received' || !['courier', 'courierTip'].includes(t.source))) d.income += t.amount;
  }
  for (const d of days) {
    if (mode === 'earned') {
      d.income += d.confirmed + d.tips;
      d.estimate = d.expected;
    }
    for (const x of s.courierShifts.filter(sh => sh.date === d.date)) d.unknown += shiftTotals(s, x).unknown;
  }
  for (const p of s.plans.filter(pending)) if (byDate[p.date]) byDate[p.date].plans.push(p.id);
  for (const p of upcomingPayments(s, to)) if (byDate[p.date]) byDate[p.date].payments.push(p);
  const payout = expectedPayouts(s);
  let payoutDate = nextPayday(s);
  if (payoutDate <= today()) payoutDate = addDays(payoutDate, 7);
  if (byDate[payoutDate] && !payout.unlinked) byDate[payoutDate].expectedPayment = payout.net;
  return {
    days,
    max: Math.max(1, ...days.flatMap(d => [d.income + d.estimate, d.expense])),
    allocated: mode === 'earned' && work.allocated,
    income: days.reduce((n, d) => n + d.income, 0),
    expense: days.reduce((n, d) => n + d.expense, 0),
    estimate: days.reduce((n, d) => n + d.estimate, 0)
  };
}

export function forecastMoney(s, endDate) {
  const cash = s.accounts.filter(a => a.kind !== 'savings').reduce((n, a) => n + balance(s, a.id), 0);
  const starting = cash - taxReserve(s) - s.budget.savings;
  const due = upcomingPayments(s, endDate);
  const expected = expectedPayouts(s);
  let payday = nextPayday(s);
  if (payday <= today()) payday = addDays(payday, 7);
  let certain = starting, scenario = starting, firstDeficit = null;
  const rows = [];
  for (let d = today(); d <= endDate; d = addDays(d, 1)) {
    const out = (d === today() ? due.filter(p => p.date <= d) : due.filter(p => p.date === d)).reduce((n, p) => n + p.amount, 0);
    const incoming = !expected.unlinked && d === payday ? expected.net : 0;
    certain -= out;
    scenario = scenario - out + incoming;
    if (certain < 0 && !firstDeficit) firstDeficit = d;
    if (d === today() || out > 0 || incoming > 0 || d === endDate) {
      rows.push({ date: d, out, incoming, certain, scenario });
    }
  }
  return { starting, payday, expected, firstDeficit, rows };
}

export function monthlyMoney(s, month) {
  const from = month + '-01';
  const [y, m] = month.split('-').map(Number);
  const to = new Date(Date.UTC(y, m, 0, 12)).toISOString().slice(0, 10);
  const end = to > today() ? today() : to;
  const report = summary(s, from, end);
  const work = earningsCalendar(s, from, end);
  const tx = s.transactions.filter(t => t.date >= from && t.date <= end);
  const savingsIds = new Set(s.accounts.filter(a => a.kind === 'savings').map(a => a.id));
  const savings = tx.filter(t => t.type === 'transfer').reduce((n, t) => n + (savingsIds.has(t.toAccountId) ? t.amount : 0) - (savingsIds.has(t.accountId) ? t.amount : 0), 0);
  return {
    ...report, from, to, end,
    complete: s.completedMonths.includes(month),
    current: month === today().slice(0, 7),
    savings,
    repaid: tx.filter(t => t.type === 'repay_out').reduce((n, t) => n + t.amount, 0),
    remaining: s.accounts.reduce((n, a) => n + balance(s, a.id, end), 0),
    unpaid: s.courierStatements.filter(r => r.to >= from && r.to <= end).reduce((n, r) => n + statementRemaining(s, r.id), 0),
    expected: work.expected
  };
}

export function planFromExpense(s, tx) {
  if (tx.type !== 'expense' || tx.date <= today() || !validDate(tx.date)) throw Error('Для плана выбери будущую дату расхода');
  validateTransaction(s, { ...tx, date: today() });
  const p = {
    id: uid(),
    name: tx.note || 'Запланированная покупка',
    amount: tx.amount,
    date: tx.date,
    accountId: tx.accountId,
    categoryId: tx.categoryId,
    importance: tx.importance,
    items: tx.items,
    deductFromCategoryId: tx.deductFromCategoryId || null,
    taxForCategoryId: tx.taxForCategoryId || null,
    paidTransactionId: null,
    status: 'pending'
  };
  s.plans.push(p);
  return p;
}

export function validateTransaction(s, t, editingId) {
  if (!Object.hasOwn(TYPES, t.type) || !Number.isSafeInteger(t.amount) || t.amount <= 0) throw Error('Сумма должна быть больше нуля');
  if (!validDate(t.date) || t.date > today()) throw Error('Операция должна иметь дату не позже сегодняшней. Будущие платежи добавляются в план');
  if (!s.accounts.some(a => a.id === t.accountId)) throw Error('Выберите счёт');
  if (t.type === 'transfer' && (!s.accounts.some(a => a.id === t.toAccountId) || t.toAccountId === t.accountId)) throw Error('Для перевода выберите два разных счёта');
  if (t.type === 'expense') {
    const rows = t.items?.length ? t.items : [t];
    if (rows.some(r => !s.categories.some(c => c.id === r.categoryId) || !Object.hasOwn(IMPORTANCE, r.importance))) throw Error('Выберите категорию и важность');
    if (t.items?.length && rows.reduce((n, r) => n + r.amount, 0) !== t.amount) throw Error('Сумма частей чека должна совпадать с общей суммой покупки');
  }
  if (['borrow', 'lend', 'repay_out', 'repay_in'].includes(t.type)) {
    const d = s.debts.find(x => x.id === t.debtId);
    if (!d) throw Error('Выбери человека или рассрочку');
    if (isInstallmentDebt(d)) {
      if (!['borrow', 'repay_out'].includes(t.type)) throw Error('Для рассрочки доступен только платёж погашения');
      if (t.type === 'repay_out') {
        const old = s.transactions.find(x => x.id === editingId);
        const remaining = debtRemaining(s, d.id) + (old?.debtId === d.id && old.type === 'repay_out' ? old.amount : 0);
        if (t.amount > remaining) throw Error('Сумма превышает остаток рассрочки');
      }
    }
  }
}

export function validateState(s) {
  if (!s || s.version !== 1) throw Error('Неподдерживаемая версия резервной копии');
  migrateState(s);
  for (const key of ['accounts', 'categories', 'transactions', 'debts', 'goals', 'plans']) {
    if (!Array.isArray(s[key])) throw Error(`Отсутствует раздел ${key}`);
  }
  for (const t of s.transactions) validateTransaction(s, t, t.id);
  return s;
}


export function duePaymentNotifications(s, refDate = today()) {
  const cfg = s.notifications || { enabled: true, dayBefore: true, sameDay: true, overdueNextDay: true, hour: 10 };
  const tomorrow = addDays(refDate, 1);
  const allDue = upcomingPayments(s, tomorrow);
  const items = [];
  for (const p of allDue) {
    if (p.date < refDate && cfg.overdueNextDay) {
      items.push({
        id: 'overdue_' + p.id + '_' + p.date,
        stage: 'overdue',
        date: p.date,
        name: p.name,
        amount: p.amount,
        title: '🔴 Просрочен платёж: ' + p.name,
        body: `Сумма ${rub(p.amount)} (срок был ${p.date}). Открой Финансист, чтобы отметить оплату или перенести дату.`
      });
    } else if (p.date === refDate && cfg.sameDay) {
      items.push({
        id: 'today_' + p.id + '_' + p.date,
        stage: 'today',
        date: p.date,
        name: p.name,
        amount: p.amount,
        title: '🟠 Сегодня оплата: ' + p.name,
        body: `Сегодня по плану нужно заплатить ${rub(p.amount)}.`
      });
    } else if (p.date === tomorrow && cfg.dayBefore) {
      items.push({
        id: 'tomorrow_' + p.id + '_' + p.date,
        stage: 'tomorrow',
        date: p.date,
        name: p.name,
        amount: p.amount,
        title: '🔔 Завтра платёж: ' + p.name,
        body: `Завтра (${p.date}) запланирован платёж «${p.name}» на сумму ${rub(p.amount)}.`
      });
    }
  }
  return items;
}
