// Financier 3.0 — Unified UI & Controller (Android 2026 / Material 3 Expressive)
import {
  IMPORTANCE, TYPES, uid, today, addDays, validDate, calculate, cents, rub, decimal, pending,
  initialState, migrateState, serviceCategory, balance, setAccountBalance, debtRemaining,
  repaymentTotal, buildSchedule, installmentStatus, categoryPath, categoryMatches, removeCategory,
  summary, taxReserve, nextPayday, incomeHorizon, upcomingPayments, available, freeMoney,
  statementRemaining, shiftTotals, syncShift, incomeBreakdown, monthBudget, syncRecurring,
  calendarMoney, forecastMoney, monthlyMoney, planFromExpense, validateTransaction, validateState,
  duePaymentNotifications, isInstallmentDebt, personSignedBalance, personDirection,
  shiftFuelStats, lastKnownOdometer, shiftLunchState, averageOrderAmountCents
} from './core.js';

const KEY = 'financier.personal.v1';
const IDB_NAME = 'financier.idb.v1';

let state = initialState(), storageError = '';
try {
  const saved = localStorage.getItem(KEY);
  if (saved) state = validateState(JSON.parse(saved));
} catch (e) {
  storageError = 'Не удалось прочитать данные. Экспортируйте исходный файл в настройках перед восстановлением: ' + e.message;
}

let view = 'home';
let filters = { from: '', to: '', category: '', importance: '', search: '', typeGroup: '' };
let period = { from: today().slice(0, 7) + '-01', to: today() };
let installEvent = null;
let quickOrders = 1, quickPlusMode = false;
let drumRubles = 215, drumKopeks = 0, drumTouched = false;
let catKind = 'expense', openRootCat = null, budgetIncomeMode = 'all', purchasesTab = 'upcoming';
let calAnchor = today(), calSpan = 'week', calMode = 'received', monthCursor = today().slice(0, 7);

const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = (v) => v ? new Date(v + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : 'Без срока';
const clock = (n) => new Date(n).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const localDatetime = (n) => {
  const d = new Date(n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const formatShiftElapsed = (x, now = Date.now()) => {
  if (!x?.startedAt) return '0 мин';
  const totalMin = Math.max(0, Math.floor(((x.endedAt || now) - x.startedAt) / 60000));
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return h > 0 ? `${h} ч ${String(m).padStart(2, '0')} мин` : `${m} мин`;
};

const formatLunchClock = (ms) => {
  const totalSec = Math.max(0, Math.ceil((ms || 0) / 1000));
  const m = Math.floor(totalSec / 60), s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const formatDrumString = (r = drumRubles, k = drumKopeks) => {
  const rubClean = Math.max(0, Math.round(Number(r) || 0));
  const kopClean = Math.max(0, Math.min(99, Math.round(Number(k) || 0)));
  return kopClean > 0 ? `${rubClean}.${String(kopClean).padStart(2, '0')}` : `${rubClean}`;
};

function resetDrumToAverage(ordersCount = quickOrders) {
  const avgCents = averageOrderAmountCents(state, ordersCount);
  drumRubles = Math.floor(avgCents / 100);
  drumKopeks = avgCents % 100;
  drumTouched = false;
}

const option = (id, label, selected) => `<option value="${esc(id)}" ${id === selected ? 'selected' : ''}>${esc(label)}</option>`;
const accountOpts = (selected, kind) => state.accounts.filter(a => !kind || a.kind === kind).map(a => option(a.id, a.name, selected)).join('');
const categoryOpts = (selected, kind = 'expense') => state.categories
  .filter(c => !c.parentId && (!kind || c.kind === kind) && (!c.hidden || c.id === selected || state.categories.find(x => x.id === selected)?.parentId === c.id))
  .map(c => option(c.id, c.name, selected) + state.categories.filter(x => x.parentId === c.id && (!x.hidden || x.id === selected)).map(x => option(x.id, '↳ ' + x.name, selected)).join(''))
  .join('');
const importanceOpts = (selected) => Object.entries(IMPORTANCE).map(([id, n]) => option(id, n, selected)).join('');
const field = (label, control, full = false) => `<label class="field ${full ? 'full' : ''}"><span>${label}</span>${control}</label>`;
const input = (name, value = '', type = 'text', extra = '') => `<input name="${name}" type="${type}" value="${esc(value)}" ${extra}>`;
const btn = (actionName, label, id = '', cls = 'ghost') => `<button type="button" class="${cls}" data-action="${actionName}" data-id="${esc(id)}">${label}</button>`;
const section = (title, body, actions = '') => `<section class="flat-section"><div class="section-title"><h2>${title}</h2>${actions ? `<div class="actions">${actions}</div>` : ''}</div>${body}</section>`;
const listButton = (actionName, title, subtitle, id = '') => `<button type="button" class="list-button" data-action="${actionName}" data-id="${esc(id)}"><span><b>${esc(title)}</b><small>${esc(subtitle)}</small></span><span aria-hidden="true">›</span></button>`;
const category = (id) => categoryPath(state, id);
const account = (id) => state.accounts.find(a => a.id === id)?.name || 'Счёт';

const icon = (name) => {
  const paths = {
    home: '<path d="M3 10.5 12 3l9 7.5v10.5a1 1 0 0 1-1 1h-5.5v-6.5h-5V22H4a1 1 0 0 1-1-1z"/>',
    transactions: '<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>',
    courier: '<path d="M5 17a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm14 0a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM3 17h13l3-8h-7l-2-4H5m11 4h4l2 4v4h-2.5"/>',
    accounts: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 9.5h19M7 15h4"/>',
    more: '<rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.more}</svg>`;
};

const views = { home: 'Обзор', transactions: 'Операции', courier: 'Доставка', accounts: 'Счета', more: 'Ещё' };
const subViews = ['budget', 'reports', 'settings', 'categories', 'quick', 'recurring', 'earnings', 'purchases', 'forecast', 'monthly'];

function toast(msg) {
  const el = document.querySelector('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3200);
}

// IndexedDB & Local Backup Engine
function openIDB() {
  return new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej();
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function mirrorToIDB(rawState) {
  try {
    const db = await openIDB();
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(rawState, 'latest');
    tx.objectStore('kv').put({ stamp: new Date().toISOString(), data: rawState }, 'day_' + today());
  } catch {}
}

function autoBackup() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    let copies = JSON.parse(localStorage.getItem(KEY + '.copies') || '[]');
    const stamp = new Date().toISOString(), day = today();
    if (!copies.some(c => c.day === day && c.daily)) copies.unshift({ stamp, day, daily: true, data: raw });
    copies = copies.filter(c => c.daily).slice(0, 14).concat([{ stamp, day, daily: false, data: raw }, ...copies.filter(c => !c.daily).slice(0, 4)]);
    localStorage.setItem(KEY + '.copies', JSON.stringify(copies));
  } catch {}
}

function persist(next = state) {
  if (storageError) throw Error('Сначала сохраните исходные данные и восстановите копию или сбросьте хранилище в настройках');
  autoBackup();
  const raw = JSON.stringify(next);
  try {
    localStorage.setItem(KEY, raw);
  } catch (e) {
    if (e.name !== 'QuotaExceededError') throw e;
    localStorage.removeItem(KEY + '.copies');
    localStorage.setItem(KEY, raw);
    toast('Старые автокопии в localStorage очищены, база сохранена в IndexedDB');
  }
  mirrorToIDB(raw);
  state = next;
}

function mutate(fn) {
  const next = structuredClone(state);
  fn(next);
  validateState(next);
  persist(next);
  render();
setTimeout(() => { checkStartupPaymentAlerts(); syncNativeNotifications(false); }, 600);
  syncNativeNotifications(false);
}

async function nativeApkShareFile(name, text) {
  const cap = window.Capacitor;
  const fsPlugin = cap?.Plugins?.Filesystem;
  const sharePlugin = cap?.Plugins?.Share;
  if (fsPlugin && sharePlugin) {
    const written = await fsPlugin.writeFile({
      path: name,
      data: text,
      directory: 'CACHE',
      encoding: 'utf8'
    });
    await sharePlugin.share({
      title: 'Резервная копия Финансист',
      text: 'Резервная копия базы Финансист (' + name + ')',
      url: written.uri,
      dialogTitle: 'Сохранить или отправить копию'
    });
    return true;
  }
  return false;
}

function backupTextModal(customText = null, title = 'Резервная копия JSON') {
  const text = customText ?? JSON.stringify(state, null, 2);
  modal(title,
    `<p class="muted">Нажми «Скопировать JSON» и вставь в «Избранное» Telegram или Заметки. В версии 3.0 восстановить базу можно прямо из скопированного текста без создания файла.</p>` +
    `<div class="actions section">` +
      `<button type="button" class="primary" id="copyBackupJsonBtn">📋 Скопировать весь JSON</button>` +
      `<button type="button" class="soft" id="shareBackupTextBtn">📤 Отправить текстом</button>` +
    `</div>` +
    `<textarea id="backupTextarea" rows="12" readonly class="section">${esc(text)}</textarea>`
  );
  const ta = dialog.querySelector('#backupTextarea');
  dialog.querySelector('#copyBackupJsonBtn').onclick = () => {
    ta.select();
    copy(text);
  };
  dialog.querySelector('#shareBackupTextBtn').onclick = async () => {
    try {
      if (window.Capacitor?.Plugins?.Share) {
        await window.Capacitor.Plugins.Share.share({ title: 'Финансист JSON', text });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: 'Финансист JSON', text });
        return;
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
    ta.select();
    copy(text);
  };
}

async function download(name, obj) {
  const text = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  try {
    if (await nativeApkShareFile(name, text)) {
      toast('Выбери приложение для сохранения файла');
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError' || String(e?.message || '').includes('canceled')) return;
  }
  if (window.Capacitor) {
    try { await navigator.clipboard.writeText(text); toast('JSON скопирован в буфер обмена'); } catch {}
    backupTextModal(text, 'Сохранение копии (' + name + ')');
    return;
  }
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function shareBackup() {
  const name = 'financier-backup-' + today() + '.json';
  const text = JSON.stringify(state, null, 2);
  try {
    if (await nativeApkShareFile(name, text)) {
      toast('Копия готова к отправке');
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError' || String(e?.message || '').includes('canceled')) return;
  }
  try {
    const file = new File([new Blob([text], { type: 'application/json' })], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Резервная копия Финансист', text: 'Копия базы Финансист от ' + today() });
      toast('Копия отправлена');
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;
  }
  try {
    if (navigator.share) {
      await navigator.share({ title: name, text });
      toast('Копия отправлена текстом');
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;
  }
  try { await navigator.clipboard.writeText(text); toast('JSON скопирован в буфер обмена'); } catch {}
  backupTextModal(text);
}

async function copy(s) {
  try {
    await navigator.clipboard.writeText(s);
    toast('Скопировано в буфер обмена');
    return;
  } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = s;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) { toast('Скопировано в буфер обмена'); return; }
  } catch {}
  modal('Скопируйте текст', `<textarea rows="14" readonly>${esc(s)}</textarea>`);
  dialog.querySelector('textarea').select();
}

// Theme Management
const mediaDark = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const theme = state.appearance?.theme || 'auto';
  const resolved = theme === 'auto' ? (mediaDark.matches ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = resolved === 'dark' ? '#0b0f17' : '#f4f6fa';
}
mediaDark.addEventListener('change', applyTheme);

// Modal Dialog Helper
function modal(title, body, onSubmit, extraClass = '') {
  dialog.className = extraClass;
  dialog.innerHTML = `<form id="modalForm"><div class="sheet-handle" aria-hidden="true"></div><div class="dialoghead"><h2>${title}</h2><button type="button" class="close" data-close aria-label="Закрыть">×</button></div>${body}<div class="error" id="formError" role="alert"></div>${onSubmit ? '<div class="dialogfoot"><button type="button" class="ghost" data-close>Отмена</button><button class="primary" type="submit">Сохранить</button></div>' : ''}</form>`;
  dialog.showModal();
  dialog.querySelectorAll('[data-close]').forEach(b => b.onclick = () => dialog.close());
  if (onSubmit) {
    dialog.querySelector('form').onsubmit = e => {
      e.preventDefault();
      if (e.target.dataset.busy) return;
      e.target.dataset.busy = 'true';
      const submit = e.target.querySelector('[type=submit]');
      submit.disabled = true;
      try {
        onSubmit(new FormData(e.target));
        dialog.close();
        toast('Сохранено');
      } catch (err) {
        delete e.target.dataset.busy;
        submit.disabled = false;
        dialog.querySelector('#formError').textContent = err.message;
      }
    };
  }
}

function confirmModal(title, message, fn) {
  modal(title, `<p>${message}</p>`, () => fn());
  dialog.querySelector('button[type="submit"]').textContent = 'Подтвердить';
}

// Shared UI Components
function row(t) {
  const down = ['expense', 'lend', 'repay_out', 'transfer', 'adjustment_out'].includes(t.type);
  const iconChar = t.type === 'transfer' ? '⇄' : down ? '↗' : '↙';
  return `<div class="row"><div class="badge ${t.type === 'income' ? 'badge-inc' : down ? 'badge-exp' : ''}">${iconChar}</div><div class="row-main"><div class="row-title">${esc(t.note || TYPES[t.type])}</div><div class="row-meta">${date(t.date)} · ${esc(account(t.accountId))}${['expense', 'income'].includes(t.type) ? ' · ' + esc(t.items?.length ? `Разделён (${t.items.length})` : category(t.categoryId)) : ''}${t.type === 'transfer' ? ' → ' + esc(account(t.toAccountId)) : ''}${t.debtId ? ' · ' + esc(state.debts.find(d => d.id === t.debtId)?.name) : ''}</div></div><div class="amount ${t.type === 'income' ? 'positive' : ''}">${t.type === 'transfer' ? '' : down ? '−' : '+'}${rub(t.amount)}</div><div class="actions">${!t.type.startsWith('adjustment') ? `<button type="button" class="small ghost" data-action="repeatTx" data-id="${t.id}" title="Повторить сегодня" aria-label="Повторить">↻</button>` : ''}<button type="button" class="small ghost" data-action="editTx" data-id="${t.id}" aria-label="Изменить">✎</button></div></div>`;
}

function paymentRow(p) {
  const overdue = p.date < today();
  const act = p.kind === 'plan' ? 'payPlan' : p.kind === 'debt' ? 'repayDebt' : 'payInstallment';
  const id = p.kind === 'plan' ? p.id : p.kind === 'debt' ? p.debtId : p.debtId + '|' + p.id;
  return `<div class="row payment-row"><div class="row-main"><div class="row-title">${esc(p.name)}</div><div class="row-meta ${overdue ? 'negative' : ''}">${date(p.date)}${overdue ? ' · просрочен' : ''}${p.kind === 'installment' ? ' · рассрочка' : ''}</div></div><b class="amount">${rub(p.amount)}</b>${btn(act, 'Оплатить', id, 'small primary')}</div>`;
}

function bars(values, labels, colorFn) {
  const max = Math.max(...Object.values(values), 1);
  return Object.entries(values).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([id, n]) => {
    const col = colorFn?.(id);
    return `<div class="barrow"><div class="bar-label"><span>${esc(labels(id))}</span><strong>${rub(n)}</strong></div><div class="track"><div class="fill" style="width:${n / max * 100}%;background:${/^#[0-9a-f]{6}$/i.test(col || '') ? col : 'var(--accent)'}"></div></div></div>`;
  }).join('') || '<p class="muted empty-line">Пока нет данных по расходам</p>';
}

function trend(days, from, to) {
  const dates = [];
  for (let d = new Date(from + 'T12:00:00'); d <= new Date(to + 'T12:00:00') && dates.length < 3660; d.setDate(d.getDate() + 1)) {
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  if (!dates.length) return '';
  const grouped = dates.length > 31
    ? Array.from({ length: Math.min(24, dates.length) }, (_, i) => {
        const slice = dates.slice(Math.floor(i * dates.length / 24), Math.floor((i + 1) * dates.length / 24));
        return { date: slice[0], n: slice.reduce((n, d) => n + (days[d] || 0), 0) };
      })
    : dates.map(d => ({ date: d, n: days[d] || 0 }));
  const max = Math.max(...grouped.map(d => d.n), 1);
  const w = 560, h = 130, step = (w - 24) / grouped.length;
  return `<svg class="chart" role="img" aria-label="Динамика расходов" viewBox="0 0 560 160"><line x1="5" y1="130" x2="555" y2="130"/>${grouped.map((d, i) => `<rect x="${12 + i * step}" y="${h - d.n / max * 110}" width="${Math.max(step * 0.65, 3)}" height="${d.n / max * 110}" rx="4"><title>${esc(d.date)}: ${rub(d.n)}</title></rect>`).join('')}<text x="10" y="151">${date(from)}</text><text x="550" y="151" text-anchor="end">${date(to)}</text></svg>`;
}

function shiftExpensesTotal(x) {
  return state.transactions.filter(t => t.type === 'expense' && t.date === x.date && (t.shiftId === x.id || t.deductFromCategoryId === state.incomeDefaults?.x5)).reduce((n, t) => n + t.amount, 0);
}

function activeShiftBanner() {
  const active = state.courierShifts.filter(x => x.startedAt && !x.endedAt);
  if (!active.length) return '';
  return active.map(x => {
    const t = shiftTotals(state, x), exp = shiftExpensesTotal(x), clean = t.net - exp - (t.fuelCost || 0);
    const lunch = shiftLunchState(x);
    return `<section class="flat-section shift-live-banner"><div class="section-title"><div class="actions"><span class="statusdot"></span><h2>Смена на линии</h2><span class="pill" data-live-shift-elapsed="${esc(x.id)}">⏱ ${formatShiftElapsed(x)}</span><span class="pill" data-live-lunch-timer="${esc(x.id)}">🍱 ${formatLunchClock(lunch.remainingMs)}</span></div><div class="actions">${btn('navigate', 'Пульт смены →', 'courier', 'small soft')}</div></div><div class="shift-live-row"><div class="shift-live-amount"><strong>${t.unknown && !t.earned ? 'Ждёт сумм' : rub(clean)}</strong><small>чистыми · грязными ${rub(t.earned)}${t.fuelCost ? ` · бензин −${rub(t.fuelCost)}` : ''}${exp ? ` · расход −${rub(exp)}` : ''}</small></div><div class="actions">${btn('instantTrip1', '⚡ +1 выдача', x.id, 'small primary')}${btn('instantTrip2', '+2 выдачи', x.id, 'small soft')}${btn('toggleLunch', lunch.active ? '▶ С обеда' : '🍱 Обед', x.id, 'small ghost')}</div></div></section>`;
  }).join('');
}

function planRows(plans) {
  return plans.map(p => `<div class="row wrap-row"><span class="row-main"><b>${esc(p.name)}</b><small>${date(p.date)} · ${esc(category(p.categoryId))}${p.recurringId ? ' · регулярно' : ''}${p.date < today() ? ' · <span class="negative">просрочено</span>' : ''}</small></span><b class="amount">${rub(p.amount)}</b><div class="actions">${btn('buyPurchase', 'Купил', p.id, 'small primary')}${btn('movePurchase', 'Перенести', p.id, 'small ghost')}${btn('cancelPurchase', 'Отменить', p.id, 'small ghost')}</div></div>`).join('') || '<p class="muted">Нет запланированных покупок.</p>';
}

// === VIEWS ===

function homeView() {
  const a = freeMoney(state);
  const m = summary(state, today().slice(0, 7) + '-01', today());
  const dueToday = state.plans.filter(p => pending(p) && p.date <= today());
  const upcoming = upcomingPayments(state, addDays(today(), 7));
  const recent = [...state.transactions].sort((x, y) => y.date.localeCompare(x.date) || y.createdAt - x.createdAt).slice(0, 5);
  const savingsTotal = state.accounts.filter(acc => acc.kind === 'savings').reduce((n, acc) => n + balance(state, acc.id), 0);
  const oweTotal = state.debts.filter(d => personDirection(state, d.id) === 'owe').reduce((n, d) => n + debtRemaining(state, d.id), 0);
  const owedTotal = state.debts.filter(d => personDirection(state, d.id) === 'owed').reduce((n, d) => n + debtRemaining(state, d.id), 0);

  return (
    (!state.accounts.length ? `<div class="note"><strong>Начнём с твоих счетов.</strong> Добавь основную карту или наличные с текущим остатком. ${btn('addAccount', '+ Добавить счёт', '', 'small primary')}</div>` : '') +
    activeShiftBanner() +
    (dueToday.length ? section('На сегодня и просроченные', planRows(dueToday)) : '') +
    section('Свободные деньги',
      `<div class="free-total"><strong class="${a.free < 0 ? 'negative' : ''}">${rub(a.free)}</strong><span>доступно после обязательств до ${date(a.end)}</span></div>` +
      `<p>${a.deficit ? `Не хватает <b class="negative">${rub(a.deficit)}</b> на обязательные платежи` : `Ориентир на день: <b>${rub(a.perDay)}</b> · ${a.days} дн. до выплаты`}</p>` +
      `<details><summary>Из чего складывается остаток</summary><div class="money-details">` +
      [['Карты и наличные', a.cash], ['Планы и регулярные платежи', -a.duePlans], ['Долги и рассрочки к сроку', -a.dueDebts], ['Налоговый резерв', -a.tax], ['Резерв на накопления', -a.savings]]
        .map(([n, v]) => `<div class="row"><span class="row-main">${n}</span><b>${rub(v)}</b></div>`).join('') +
      `</div><p class="muted">Накопительные счета и ещё не полученный заработок со смен сюда не входят.</p></details>`
    ) +
    section('Быстрые шаблоны',
      `<div class="quick-buttons">${state.quickActions.map(q => btn('useQuick', esc(q.name), q.id, 'soft')).join('') || '<p class="muted">Создай кнопку для частых трат (бензин, кофе, продукты) — счёт и категория подставятся сами.</p>'}</div>`,
      btn('navigate', 'Настроить', 'quick', 'small ghost')
    ) +
    `<div class="compact-stats">` +
      `<div><span>Доходы за месяц</span><b class="positive">${rub(m.income)}</b></div>` +
      `<div><span>Расходы за месяц</span><b>${rub(m.expense)}</b></div>` +
      `<div><span>В накоплениях</span><b>${rub(savingsTotal)}</b></div>` +
      `<div><span>Я должен / мне должны</span><b>${rub(oweTotal)} / ${rub(owedTotal)}</b></div>` +
    `</div>` +
    section('Ближайшие платежи (7 дней)', upcoming.length ? upcoming.slice(0, 5).map(paymentRow).join('') : '<p class="muted empty-line">На ближайшие 7 дней обязательных платежей нет</p>', btn('navigate', 'Все планы →', 'purchases', 'small ghost')) +
    `<div class="flat-columns">` +
      section('Последние операции', recent.map(row).join('') || '<p class="muted empty-line">Запиши первую покупку или доход</p>', btn('navigate', 'Все →', 'transactions', 'small ghost')) +
      section('Куда уходят деньги', bars(m.rootCategory, category, id => state.categories.find(c => c.id === id)?.color)) +
    `</div>`
  );
}

function transactionsView() {
  const ts = state.transactions.filter(t =>
    (!filters.from || t.date >= filters.from) &&
    (!filters.to || t.date <= filters.to) &&
    (!filters.typeGroup || (filters.typeGroup === 'debt' ? ['borrow', 'lend', 'repay_out', 'repay_in'].includes(t.type) : t.type === filters.typeGroup)) &&
    (!filters.search || [t.note, TYPES[t.type], state.debts.find(d => d.id === t.debtId)?.name, ...(t.items || []).map(i => i.name)].join(' ').toLowerCase().includes(filters.search.toLowerCase())) &&
    (!filters.category || (t.items?.length ? t.items.some(i => categoryMatches(state, i.categoryId, filters.category)) : categoryMatches(state, t.categoryId, filters.category))) &&
    (!filters.importance || (t.items?.length ? t.items.some(i => i.importance === filters.importance) : t.importance === filters.importance))
  ).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const hasActiveFilters = Boolean(filters.from || filters.to || filters.category || filters.importance || filters.search || filters.typeGroup);

  return `<div class="card"><div class="cardhead"><h2>История операций</h2><div class="actions"><span class="pill">${ts.length} записей</span><button type="button" class="ghost filter-trigger" data-action="openFilters" aria-label="Фильтры"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg>${hasActiveFilters ? '<span class="filter-active"></span>' : ''}</button></div></div>` +
    `<div class="tx-quick-bar"><input type="search" id="liveTxSearch" value="${esc(filters.search)}" placeholder="🔍 Поиск по названию, категории или должнику…"><div class="tx-chips">${[['', 'Все'], ['expense', 'Расходы'], ['income', 'Доходы'], ['debt', 'Долги'], ['transfer', 'Переводы']].map(([id, label]) => `<button type="button" class="small ${filters.typeGroup === id ? 'primary' : 'ghost'}" data-tx-group="${id}">${label}</button>`).join('')}${hasActiveFilters ? `<button type="button" class="small danger" data-action="resetFilters">Сбросить</button>` : ''}</div></div>` +
    `${ts.map(row).join('') || '<div class="empty">По выбранным условиям операций нет</div>'}</div>`;
}

function deliveryList(x) {
  const entries = x.entries || [];
  if (!entries.length) return '<p class="muted">Пока нет поездок. Выбери 1, 2 или 3+ выдачи и нажми «+ Записать».</p>';
  return [...entries].map((e, idx) => ({ e, idx })).reverse().map(({ e, idx }) =>
    `<div class="row trip-row">` +
      `<div class="badge">#${idx + 1}</div>` +
      `<div class="row-main">` +
        `<div class="row-title">${e.takenAt ? e.takenAt.slice(11, 16) : 'Без времени'} · <b>${e.orders} ${e.orders === 1 ? 'выдача' : e.orders < 5 ? 'выдачи' : 'выдач'}</b></div>` +
        `<div class="row-meta">${e.amount === null ? '<span class="expected-text">Сумма не указана</span>' : 'Оценка поездки'}</div>` +
      `</div>` +
      `<div class="amount ${e.amount === null ? 'expected-text' : 'positive'}">${e.amount === null ? '—' : rub(e.amount)}</div>` +
      `<div class="actions">` +
        `${e.amount === null ? `<button type="button" class="small soft" data-action="editDelivery" data-id="${esc(x.id + '|' + e.id)}">+ Сумма ₽</button>` : `<button type="button" class="small ghost" data-action="editDelivery" data-id="${esc(x.id + '|' + e.id)}" aria-label="Изменить">✎</button>`}` +
        `<button type="button" class="small danger" data-action="deleteDelivery" data-id="${esc(x.id + '|' + e.id)}" aria-label="Удалить">×</button>` +
      `</div>` +
    `</div>`
  ).join('');
}

function courierView() {
  const active = state.courierShifts.filter(x => x.startedAt && !x.endedAt);
  const closed = state.courierShifts.filter(x => !x.startedAt || x.endedAt);
  const pendingPayout = state.courierStatements.reduce((n, r) => n + statementRemaining(state, r.id), 0);
  const unconfList = state.courierShifts.filter(x => !state.courierStatements.some(r => r.from <= x.date && r.to >= x.date));
  const unconfirmed = unconfList.reduce((n, x) => n + shiftTotals(state, x).earned, 0);
  const defaultTax = state.courier.taxPercent ?? 4;
  const fuelPer100 = state.courier.fuelPer100 ?? 9.5;
  const fuelPrice = state.courier.fuelPrice ?? 5850;
  const lastOdo = lastKnownOdometer(state);
  const nowClock = clock(Date.now());

  if (!drumTouched && active.length) {
    const avgC = averageOrderAmountCents(state, quickOrders);
    drumRubles = Math.floor(avgC / 100);
    drumKopeks = avgC % 100;
  }

  return `<div class="courier-topbar"><div class="actions">` +
      `${btn('navigate', '📅 Календарь денег', 'earnings', 'soft')}` +
      `${btn('fuelSettings', `⛽ ${fuelPer100} л/100 · ${decimal(fuelPrice)} ₽/л`, '', 'ghost')}` +
      `${btn('addShift', '+ Смена за прошлую дату', '', 'ghost')}` +
      `${taxReserve(state) > 0 ? btn('payTax', 'Оплатить налог (' + rub(taxReserve(state)) + ')', '', 'ghost') : ''}` +
    `</div></div>` +
    (!active.length
      ? `<section class="flat-section start-shift-card">` +
          `<div class="section-title"><div><h2>Начать смену</h2><p class="muted">Укажи налог, время выхода и пробег на старте</p></div><span class="service-badge x5">🛵</span></div>` +
          `<div class="shift-tax-picker">` +
            `<span class="label">Налог смены, %:</span>` +
            `<div class="tax-preset-btns">` +
              [0, 4, 6].map(p => `<button type="button" class="small ${Number(defaultTax) === p ? 'primary' : 'ghost'}" data-start-tax-preset="${p}">${p}%</button>`).join('') +
              `<input type="number" id="startShiftTaxInput" data-no-math="true" value="${esc(defaultTax)}" min="0" max="100" step="0.1" aria-label="Процент налога смены">` +
            `</div>` +
          `</div>` +
          `<div class="formgrid">` +
            `<label class="field"><span>Время начала смены</span><input type="time" id="startShiftTimeInput" value="${esc(nowClock)}" required></label>` +
            `<label class="field"><span>Пробег на старте, км</span><input type="text" inputmode="decimal" data-no-math="true" id="startShiftOdoInput" value="${esc(lastOdo)}" placeholder="Например: 154200"></label>` +
          `</div>` +
          `<button type="button" class="primary courier-order" data-action="startDeliveryShift">▶ Выйти на смену</button>` +
        `</section>`
      : '') +
    active.map(x => {
      const t = shiftTotals(state, x), exp = shiftExpensesTotal(x), cleanNet = t.net - exp - (t.fuelCost || 0);
      const hrs = Math.max(0.1, t.hours || 0.1), rate = (t.earned || t.tips) ? Math.round(cleanNet / hrs) : 0, avgOrder = t.orders ? Math.round(t.earned / t.orders) : 0;
      const lunch = shiftLunchState(x);
      const is4Plus = quickPlusMode || quickOrders >= 4;
      const avgForCurOrders = averageOrderAmountCents(state, quickOrders);
      const avgRubCenter = Math.floor(avgForCurOrders / 100);
      const sliderMin = Math.max(10, Math.min(drumRubles - 40, avgRubCenter - 120));
      const sliderMax = Math.max(drumRubles + 40, avgRubCenter + 160);
      const prevRub = Math.max(0, drumRubles - 1), nextRub = drumRubles + 1;
      const prevKop = (drumKopeks + 99) % 100, nextKop = (drumKopeks + 1) % 100;

      return `<section class="flat-section shift-cockpit" data-shift-cockpit="${esc(x.id)}">` +
        `<div class="section-title">` +
          `<div class="actions">` +
            `<span class="statusdot"></span>` +
            `<h2>Смена с ${clock(x.startedAt)}</h2>` +
            `<span class="pill essential" data-live-shift-elapsed="${esc(x.id)}">⏱ ${formatShiftElapsed(x)}</span>` +
            `<button type="button" class="small ghost" data-action="editShiftTax" data-id="${esc(x.id)}">Налог ${x.taxPercent ?? 0}% ✎</button>` +
          `</div>` +
          `<div class="actions">${btn('finishShift', '⏹ Завершить', x.id, 'danger small')}</div>` +
        `</div>` +

        `<div class="shift-lunch-odo-bar">` +
          `<div class="lunch-box ${lunch.active ? 'lunch-running' : ''}">` +
            `<div class="lunch-info">` +
              `<span class="lunch-label">🍱 Таймер обеда</span>` +
              `<strong class="lunch-clock" data-live-lunch-timer="${esc(x.id)}">${formatLunchClock(lunch.remainingMs)}</strong>` +
            `</div>` +
            `<button type="button" class="small ${lunch.active ? 'primary' : 'soft'}" data-action="toggleLunch" data-id="${esc(x.id)}">${lunch.active ? '▶ Сняться с обеда' : '⏸ Уйти на обед'}</button>` +
          `</div>` +
          `<div class="odo-box">` +
            `<div class="odo-info">` +
              `<span class="lunch-label">⛽ Пробег и бензин</span>` +
              `<strong>${t.fuelKm > 0 ? `${t.fuelKm} км · ${t.fuelLiters} л (−${rub(t.fuelCost)})` : (x.odoStart ? `Старт: ${x.odoStart} км` : 'Не указан')}</strong>` +
            `</div>` +
            `<button type="button" class="small ghost" data-action="shiftOdoModal" data-id="${esc(x.id)}">${x.odoEnd ? 'Изменить км' : '+ Пробег км'}</button>` +
          `</div>` +
        `</div>` +

        `<div class="compact-stats">` +
          `<div><span>Чистыми на руки</span><b class="${cleanNet < 0 ? 'negative' : 'positive'}">${t.unknown && !t.earned && !exp && !t.fuelCost ? 'Ждёт сумм' : rub(cleanNet)}</b><small class="muted">Налог −${rub(t.tax)}${t.fuelCost ? ` · бенз −${rub(t.fuelCost)}` : ''}${exp ? ` · расх −${rub(exp)}` : ''}</small></div>` +
          `<div><span>Грязными + чай</span><b>${rub(t.earned + t.tips)}</b><small class="muted">Заказы ${rub(t.earned)} · чай ${rub(t.tips)}</small></div>` +
          `<div><span>Поездки / выдачи</span><b>${t.trips ?? 0} / ${t.orders ?? 0}</b><small class="muted">${avgOrder ? `Средняя: ${rub(avgOrder)}` : 'Отмечай ниже'}</small></div>` +
          `<div><span>Чистый темп</span><b>${rate ? rub(rate) + '/ч' : '—'}</b><small class="muted">${t.unknown ? `Без суммы: ${t.unknown}` : 'Все суммы внесены'}</small></div>` +
        `</div>` +

        `<div class="quick-trip-box">` +
          `<div class="orders-4btn-row">` +
            `<span class="label">Выдач в поездке:</span>` +
            `<div class="orders-3btn-group" role="group" aria-label="Количество выдач">` +
              `<button type="button" class="${!is4Plus && quickOrders === 1 ? 'primary' : 'ghost'}" data-quick-order="1" data-shift="${esc(x.id)}">1</button>` +
              `<button type="button" class="${!is4Plus && quickOrders === 2 ? 'primary' : 'ghost'}" data-quick-order="2" data-shift="${esc(x.id)}">2</button>` +
              `<button type="button" class="${!is4Plus && quickOrders === 3 ? 'primary' : 'ghost'}" data-quick-order="3" data-shift="${esc(x.id)}">3</button>` +
              `<button type="button" class="${is4Plus ? 'primary' : 'ghost'}" data-quick-order="4+" data-shift="${esc(x.id)}">4+</button>` +
              `<input type="number" id="customQuickOrders_${esc(x.id)}" data-no-math="true" class="custom-orders-inp" value="${is4Plus ? Math.max(4, quickOrders) : 4}" min="4" max="100" ${is4Plus ? '' : 'hidden'} aria-label="Точное число выдач">` +
            `</div>` +
          `</div>` +

          `<div class="alarm-Display-box">` +
            `<div class="alarm-display-header">` +
              `<span>Точная сумма заказа (средняя для ${quickOrders} выд.: <b>${rub(avgForCurOrders)}</b>)</span>` +
            `</div>` +
            `<div class="alarm-main-input-wrap">` +
              `<input type="text" inputmode="decimal" data-no-math="true" class="alarm-main-input" data-quick-amount="${esc(x.id)}" value="${esc(formatDrumString())}" placeholder="Введи сумму или крути барабан ниже">` +
              `<span class="alarm-rub-sign">₽</span>` +
            `</div>` +
          `</div>` +

          `<div class="alarm-drums-grid" data-drum-root="${esc(x.id)}">` +
            `<div class="alarm-drum-col">` +
              `<div class="alarm-drum-title">Рубли (₽)</div>` +
              `<div class="alarm-drum-wheel" data-wheel-kind="rub" data-shift="${esc(x.id)}">` +
                `<button type="button" class="drum-step-Neighbor" data-drum-step="rub|-1" data-shift="${esc(x.id)}">${prevRub}</button>` +
                `<div class="drum-active-val" data-drum-rub-val="${esc(x.id)}">${drumRubles}</div>` +
                `<button type="button" class="drum-step-Neighbor" data-drum-step="rub|1" data-shift="${esc(x.id)}">${nextRub}</button>` +
              `</div>` +
              `<input type="range" class="drum-slider" data-drum-rub-slider="${esc(x.id)}" min="${sliderMin}" max="${sliderMax}" value="${drumRubles}">` +
              `<div class="drum-fine-btns">` +
                `<button type="button" class="small ghost" data-drum-step="rub|-10" data-shift="${esc(x.id)}">−10</button>` +
                `<button type="button" class="small ghost" data-drum-step="rub|-1" data-shift="${esc(x.id)}">−1</button>` +
                `<button type="button" class="small ghost" data-drum-step="rub|1" data-shift="${esc(x.id)}">+1</button>` +
                `<button type="button" class="small ghost" data-drum-step="rub|10" data-shift="${esc(x.id)}">+10</button>` +
              `</div>` +
            `</div>` +

            `<div class="alarm-drum-sep">:</div>` +

            `<div class="alarm-drum-col">` +
              `<div class="alarm-drum-title">Копейки (коп)</div>` +
              `<div class="alarm-drum-wheel" data-wheel-kind="kop" data-shift="${esc(x.id)}">` +
                `<button type="button" class="drum-step-Neighbor" data-drum-step="kop|-1" data-shift="${esc(x.id)}">${String(prevKop).padStart(2, '0')}</button>` +
                `<div class="drum-active-val" data-drum-kop-val="${esc(x.id)}">${String(drumKopeks).padStart(2, '0')}</div>` +
                `<button type="button" class="drum-step-Neighbor" data-drum-step="kop|1" data-shift="${esc(x.id)}">${String(nextKop).padStart(2, '0')}</button>` +
              `</div>` +
              `<input type="range" class="drum-slider" data-drum-kop-slider="${esc(x.id)}" min="0" max="99" value="${drumKopeks}">` +
              `<div class="drum-fine-btns">` +
                `<button type="button" class="small ghost" data-drum-step="kop|-10" data-shift="${esc(x.id)}">−10</button>` +
                `<button type="button" class="small ghost" data-drum-step="kop|-1" data-shift="${esc(x.id)}">−1</button>` +
                `<button type="button" class="small ghost" data-drum-step="kop|1" data-shift="${esc(x.id)}">+1</button>` +
                `<button type="button" class="small ghost" data-drum-step="kop|10" data-shift="${esc(x.id)}">+10</button>` +
              `</div>` +
            `</div>` +
          `</div>` +

          `<div class="alarm-submit-row">` +
            `<button type="button" class="primary alarm-save-btn" data-action="quickAddDelivery" data-id="${esc(x.id)}">+ Записать поездку</button>` +
            `<button type="button" class="ghost" data-action="quickAddNoAmount" data-id="${esc(x.id)}">Без суммы</button>` +
          `</div>` +
        `</div>` +

        `<div class="quick-tips-bar">` +
          `<div class="actions"><span class="label">🍵 Чай:</span>` +
            [50, 100, 150, 200].map(v => `<button type="button" class="small soft" data-action="quickTip" data-id="${esc(x.id)}|${v}">+${v} ₽</button>`).join('') +
            `${btn('tip', 'Свой…', x.id, 'small ghost')}` +
          `</div>` +
          `<div class="actions">${btn('shiftExpense', '− Расход на смене (еда / проезд)', x.id, 'small ghost')}</div>` +
        `</div>` +
        `<div class="shift-trips-section">` +
          `<div class="cardhead"><h3>Поездки смены (${(x.entries || []).length})</h3>${(x.entries || []).length ? `<button type="button" class="small ghost" data-action="delivery" data-id="${esc(x.id)}">+ С выбором времени</button>` : ''}</div>` +
          `${deliveryList(x)}` +
        `</div>` +
      `</section>`;
    }).join('') +
    section('Выплаты и сверка расчётки',
      `<div class="compact-stats">` +
        `<div><span>К получению по расчёткам</span><b class="positive">${rub(pendingPayout)}</b><small class="muted">Подтверждено</small></div>` +
        `<div><span>Накоплено по сменам</span><b class="expected-text">${rub(unconfirmed)}</b><small class="muted">Ждёт расчётки (${unconfList.length} смен)</small></div>` +
        `<div><span>Ближайший четверг</span><b>${date(nextPayday(state))}</b><small class="muted">День выплаты</small></div>` +
        `<div><span>Налоговый резерв</span><b>${rub(taxReserve(state))}</b><small class="muted">Отложено с выплат</small></div>` +
      `</div>` +
      `<div class="actions">${btn('courierPayout', '💰 Пришла выплата на карту', '', 'primary')}${btn('autoStatement', '📋 Сверить и внести расчётку', '', 'soft')}</div>`
    ) +
    section('Расчётки по неделям', [...state.courierStatements].sort((a, b) => b.to.localeCompare(a.to)).map(r => {
      const rem = statementRemaining(state, r.id);
      return `<div class="row wrap-row"><div class="row-main"><b>${date(r.from)} — ${date(r.to)}</b><small>${r.note ? esc(r.note) + ' · ' : ''}${rem > 0 ? `Ждёт выплаты: <b class="expected-text">${rub(rem)}</b>` : '✓ Выплачено на счёт'}</small></div><b class="amount">${rub(r.amount)}</b><div class="actions">${rem > 0 ? btn('statementPayout', 'Зачислить на счёт', r.id, 'small primary') : ''}${btn('editStatement', '✎', r.id, 'small ghost')}</div></div>`;
    }).join('') || '<p class="muted">Когда придёт недельная расчётка, нажми «Сверить и внести расчётку» — увидишь бонус или расхождение со сменами.</p>') +
    section('История смен', [...closed].sort((a, b) => b.date.localeCompare(a.date)).map(x => {
      const t = shiftTotals(state, x), exp = shiftExpensesTotal(x), clean = t.net - exp - (t.fuelCost || 0);
      const rate = t.hours > 0 ? Math.round(clean / t.hours) : 0;
      return listButton(x.entries ? 'shiftDetails' : 'editShift', `${date(x.date)} · чистыми ${rub(clean)}`, `Поездок: ${t.trips ?? '—'} · выдач: ${t.orders} · грязными ${rub(t.earned)}${t.tips ? ' + чай ' + rub(t.tips) : ''}${t.fuelCost ? ` − бенз ${rub(t.fuelCost)} (${t.fuelKm} км)` : ''}${exp ? ' − расх ' + rub(exp) : ''} · налог ${x.taxPercent ?? 0}%${rate ? ' · ' + rub(rate) + '/ч' : ''}`, x.id);
    }).join('') || '<p class="muted">История закрытых смен с чистым заработком, пробегом и темпом ₽/час.</p>');
}

function accountsView() {
  const accRows = state.accounts.map(a => `<div class="row"><span class="account-dot ${a.kind}"></span><div class="row-main"><div class="row-title">${esc(a.name)}</div><div class="row-meta">${{ card: 'Банковская карта', cash: 'Наличные', savings: 'Накопительный счёт' }[a.kind]}</div></div><b class="amount ${balance(state, a.id) < 0 ? 'negative' : ''}">${rub(balance(state, a.id))}</b>${btn('editAccount', '✎', a.id, 'small ghost')}</div>`).join('');
  const goalRows = state.goals.map(g => {
    const cur = balance(state, g.accountId);
    return `<div class="goal-line"><div class="row"><div class="row-main"><div class="row-title">${esc(g.name)}</div><div class="row-meta">${date(g.due)} · ${esc(account(g.accountId))}</div></div><b>${rub(cur)} / ${rub(g.target)}</b>${btn('goalTransfer', '+ Пополнить', g.id, 'small soft')}${btn('editGoal', '✎', g.id, 'small ghost')}</div><div class="track"><div class="fill" style="width:${Math.min(100, Math.max(0, cur / g.target * 100))}%"></div></div></div>`;
  }).join('');

  const peopleList = state.debts.filter(d => !isInstallmentDebt(d));
  const instList = state.debts.filter(d => isInstallmentDebt(d));

  const peopleRows = peopleList.map(d => {
    const signed = personSignedBalance(state, d.id);
    const rem = Math.abs(signed);
    const dir = signed > 0 ? 'owed' : signed < 0 ? 'owe' : (d.direction || 'owed');
    const statusLabel = signed > 0 ? 'Мне должен' : signed < 0 ? 'Я должен' : 'В расчёте';
    const statusCls = signed > 0 ? 'essential' : signed < 0 ? 'negative' : '';
    const txCount = state.transactions.filter(t => t.debtId === d.id).length;
    return `<div class="debt-line">` +
      `<div class="row">` +
        `<div class="row-main">` +
          `<div class="row-title">${esc(d.name)} <span class="pill ${statusCls}">${statusLabel}</span></div>` +
          `<div class="row-meta">${d.due ? 'Срок: ' + date(d.due) : 'Без срока'}${d.note ? ' · ' + esc(d.note) : ''}</div>` +
        `</div>` +
        `<b class="amount ${signed > 0 ? 'positive' : signed < 0 ? 'negative' : ''}">${signed > 0 ? '+' : signed < 0 ? '−' : ''}${rub(rem)}</b>` +
        `${btn('debtHistory', 'История (' + txCount + ')', d.id, 'small soft')}` +
        `${btn('editDebt', '✎', d.id, 'small ghost')}` +
      `</div>` +
      `<div class="actions debt-actions">` +
        `${rem > 0 ? btn('repayDebt', dir === 'owe' ? 'Отдать долг' : 'Мне вернули', d.id, 'small primary') : ''}` +
        `${btn('lendPerson', 'Дал в долг', d.id, 'small soft')}` +
        `${btn('borrowPerson', 'Взял в долг', d.id, 'small ghost')}` +
      `</div>` +
    `</div>`;
  }).join('');

  const instRows = instList.map(d => {
    const ps = installmentStatus(state, d), pendingInst = ps.filter(p => p.remaining);
    const txCount = state.transactions.filter(t => t.debtId === d.id).length;
    return `<div class="debt-line">` +
      `<div class="row">` +
        `<div class="row-main">` +
          `<div class="row-title">${esc(d.name)} <span class="pill">Рассрочка</span></div>` +
          `<div class="row-meta">${pendingInst.length ? `Осталось платежей: ${pendingInst.length} · ближайший ${date(pendingInst[0].date)} (${rub(pendingInst[0].remaining)})` : 'Погашена полностью'}${d.note ? ' · ' + esc(d.note) : ''}</div>` +
        `</div>` +
        `<b class="amount">${rub(debtRemaining(state, d.id))}</b>` +
        `${btn('debtHistory', 'История (' + txCount + ')', d.id, 'small soft')}` +
        `${btn('editInstallment', '✎', d.id, 'small ghost')}` +
      `</div>` +
      `<details><summary>График платежей (${ps.length})</summary>${ps.map((p, i) => `<div class="row schedule-row"><span class="row-meta">${i + 1}</span><div class="row-main"><div class="row-title">${date(p.date)}</div><div class="row-meta">${p.remaining === 0 ? 'Оплачен' : p.paid ? 'Частично: ' + rub(p.paid) : p.date < today() ? 'Просрочен' : 'По графику'}</div></div><b>${rub(p.remaining)}</b>${p.remaining ? btn('payInstallment', 'Оплатить', d.id + '|' + p.id, 'small primary') : '<span class="positive">✓</span>'}</div>`).join('')}</details>` +
    `</div>`;
  }).join('');

  return section('Мои счета', accRows || '<p class="muted empty-line">Добавь карту или наличные</p>', btn('addAccount', '+ Счёт', '', 'small primary')) +
    section('Цели и накопления', goalRows || '<p class="muted empty-line">Привяжи цель к накопительному счёту</p>', btn('addGoal', '+ Цель', '', 'small soft')) +
    section('🤝 Долги (люди)', peopleRows || '<p class="muted empty-line">Добавь человека здесь или прямо при записи операции</p>', btn('addDebt', '+ Человек', '', 'small primary')) +
    section('💳 Рассрочки и графики', instRows || '<p class="muted empty-line">Добавь рассрочку с разбивкой платежей по датам</p>', btn('addInstallment', '+ Рассрочка', '', 'small soft'));
}

function moreView() {
  const dueAlerts = duePaymentNotifications(state).length;
  const items = [
    ['purchases', 'Платежи и регулярные' + (dueAlerts ? ` (${dueAlerts})` : ''), 'Разовые планы, аренда, подписки по расписанию и пуш-уведомления'],
    ['forecast', 'Прогноз на 30 дней', 'Остаток денег по дням с учётом планов и выплат'],
    ['monthly', 'Итог месяца', 'Сводка доходов, расходов, накоплений и долгов'],
    ['earnings', 'Календарь денег', 'Наглядные столбцы доходов и расходов по дням'],
    ['quick', 'Быстрые шаблоны', 'Кнопки частых трат и доходов в 1 касание'],
    ['budget', 'Бюджет и лимиты', 'Автолимиты по прошлому месяцу и контроль категорий'],
    ['reports', 'Отчёты и авторазбор', 'Факты по периоду, динамика и выписка для ИИ'],
    ['categories', 'Категории', 'Настройка категорий и подкатегорий'],
    ['settings', 'Настройки, пуши и бэкап', 'Уведомления о платежах, тема, копия в Telegram и защита базы']
  ];
  return `<div class="bento-menu">${items.map(([id, t, sub]) => listButton('navigate', t, sub, id)).join('')}</div>`;
}

function budgetView() {
  const m = monthBudget(state, today(), budgetIncomeMode);
  const effective = state.categories.filter(c => c.kind === 'expense').map(c => {
    const cap = state.budget.caps[c.id] ?? m.suggested[c.id];
    const spent = (c.parentId ? m.current.category[c.id] : m.current.rootCategory[c.id]) || 0;
    return cap !== undefined && (cap > 0 || spent > 0 || state.budget.caps[c.id] !== undefined)
      ? `<div class="barrow"><div class="bar-label"><span>${esc(category(c.id))}</span><b class="${spent > cap ? 'negative' : ''}">${rub(spent)} / ${rub(cap)}</b></div><div class="track"><div class="fill" style="width:${cap ? Math.min(100, spent / cap * 100) : spent ? 100 : 0}%;background:${spent > cap ? 'var(--danger)' : 'var(--accent)'}"></div></div></div>`
      : '';
  }).join('');
  const capsInputs = state.categories.filter(c => c.kind === 'expense').map(c => {
    const val = state.budget.caps[c.id] !== undefined ? decimal(state.budget.caps[c.id]) : (m.complete && m.suggested[c.id] ? decimal(m.suggested[c.id]) : '');
    return field(esc(category(c.id)), input('cap_' + c.id, val, 'text', 'inputmode="decimal" placeholder="Без лимита"'));
  }).join('');

  return `<div class="actions toolbar">${btn('navigate', '← Ещё', 'more', 'small ghost')}${btn('navigate', 'Регулярные платежи', 'recurring', 'small soft')}</div>` +
    section('Сравнение с прошлым месяцем',
      `<p class="muted">${date(today().slice(0, 7) + '-01')} — ${date(today())} против ${date(m.previousStart)} — ${date(m.comparableEnd)}</p>` +
      `<div class="compact-stats">` +
        `<div><span>Потрачено сейчас</span><b>${rub(m.current.expense)}</b></div>` +
        `<div><span>За те же дни прошлого мес.</span><b>${rub(m.previous.expense)}</b></div>` +
        `<div><span>Разница</span><b class="${m.delta > 0 ? 'negative' : 'positive'}">${m.delta > 0 ? '+' : ''}${rub(m.delta)}</b></div>` +
        `<div><span>Динамика</span><b>${m.percent === null ? '—' : (m.percent > 0 ? '+' : '') + m.percent.toFixed(1) + '%'}</b></div>` +
      `</div>` +
      `<div class="segmented">${btn('incomeMode', 'От всех доходов', 'all', budgetIncomeMode === 'all' ? 'primary' : 'ghost')}${btn('incomeMode', 'Только от рабочих', 'work', budgetIncomeMode === 'work' ? 'primary' : 'ghost')}</div>` +
      `<p>Доля расходов: <b>${m.denominator ? (m.current.expense / m.denominator * 100).toFixed(1) + '% дохода' : 'Доход в этом месяце ещё не поступал'}</b></p>`
    ) +
    section('Лимиты категорий на месяц',
      `<p class="muted">${m.complete ? 'Ориентиры автоматически подтянуты из прошлого месяца. Ниже можно задать свои лимиты.' : 'Задай месячные ориентиры для нужных категорий.'}</p>` +
      `${effective || '<p class="muted">Лимиты пока не заданы</p>'}` +
      `<details class="section"><summary>Изменить горизонт дохода, резерв и лимиты</summary><form id="budgetForm" class="section"><div class="formgrid">` +
        `${field('Горизонт расчёта свободных денег', `<select name="incomeMode"><option value="courier" ${state.budget.incomeMode === 'courier' ? 'selected' : ''}>Доставка: до ближайшего четверга</option><option value="manual" ${state.budget.incomeMode === 'manual' ? 'selected' : ''}>До выбранной даты</option></select>`)}` +
        `${field('Дата следующего дохода (ручной режим)', input('nextIncome', state.budget.nextIncome, 'date'))}` +
        `${field('Ожидаемый доход за месяц, ₽', input('income', decimal(state.budget.income), 'text', 'inputmode="decimal" required'))}` +
        `${field('Отложить в накопления до выплаты, ₽', input('savings', decimal(state.budget.savings), 'text', 'inputmode="decimal" required'))}` +
      `</div><h3 class="section">Лимиты по категориям, ₽</h3><div class="formgrid">${capsInputs}</div><div id="budgetError" class="error"></div><button class="primary section" type="submit">Сохранить бюджет</button></form></details>`
    ) +
    section('Предстоящие обязательные платежи', upcomingPayments(state).map(paymentRow).join('') || '<p class="muted">Нет предстоящих платежей</p>', btn('addPlan', '+ Платёж', '', 'small primary'));
}

function buildLocalInsights(s, prev) {
  const list = [];
  if (prev.expense > 0) {
    const diff = s.expense - prev.expense, pct = Math.round(diff / prev.expense * 100);
    list.push({
      badge: diff > 0 ? 'Рост трат' : 'Снижение трат',
      title: diff > 0 ? `Расходы выросли на ${rub(diff)} (+${pct}%) к прошлому периоду` : `Расходы снизились на ${rub(Math.abs(diff))} (${pct}%) к прошлому периоду`,
      text: `Потрачено ${rub(s.expense)} против ${rub(prev.expense)} за предыдущий отрезок такой же длины.`
    });
  }
  const impulse = (s.importance.unnecessary || 0) + (s.importance.wanted || 0);
  if (impulse > 0) {
    const share = s.expense ? Math.round(impulse / s.expense * 100) : 0;
    list.push({
      badge: 'Импульсивные траты',
      title: `«Не нужно» и «Хотелось» заняли ${rub(impulse)} (${share}% всех расходов)`,
      text: `«Не нужно»: ${rub(s.importance.unnecessary || 0)}, «Хотелось»: ${rub(s.importance.wanted || 0)}. Если урезать их вдвое, освободится ${rub(Math.round(impulse / 2))}.`
    });
  }
  const topCat = Object.entries(s.rootCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
  if (topCat) {
    const share = s.expense ? Math.round(topCat[1] / s.expense * 100) : 0;
    list.push({
      badge: 'Главная статья',
      title: `«${category(topCat[0])}» — ${rub(topCat[1])} (${share}% бюджета)`,
      text: `Крупнейшее направление расходов за выбранный период.`
    });
  }
  return list;
}

function copyReadableReport() {
  const start = new Date(period.from + 'T12:00:00'), end = new Date(period.to + 'T12:00:00'), len = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - len + 1);
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const cur = summary(state, period.from, period.to), prev = summary(state, fmt(prevStart), fmt(prevEnd));
  const cats = Object.entries(cur.rootCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([id, v]) => `- ${category(id)}: ${rub(v)}`).join('\n');
  const imp = Object.entries(cur.importance).filter(([, v]) => v > 0).map(([k, v]) => `- ${IMPORTANCE[k]}: ${rub(v)}`).join('\n');
  const text = `Разбери мой бюджет за период ${period.from} — ${period.to} (${len} дн.) по фактам и без воды:\n\n` +
    `Доходы: ${rub(cur.income)}\nРасходы: ${rub(cur.expense)} (прошлый период: ${rub(prev.expense)})\nРазница: ${rub(cur.net)}\nСвободные деньги сейчас: ${rub(available(state).free)}\n\n` +
    `По категориям:\n${cats || 'нет'}\n\nОценка важности покупок:\n${imp || 'нет'}\n\n` +
    `Напиши коротко: 1) Где главная дыра в бюджете; 2) Конкретный план действий на следующую неделю в цифрах.`;
  copy(text);
}

function reportsView() {
  const start = new Date(period.from + 'T12:00:00'), end = new Date(period.to + 'T12:00:00'), len = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - len + 1);
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const s = summary(state, period.from, period.to), prev = summary(state, fmt(prevStart), fmt(prevEnd));
  const insights = buildLocalInsights(s, prev);
  const incRows = incomeBreakdown(state, period.from, period.to);

  return `<div class="actions toolbar">${btn('navigate', '← Ещё', 'more', 'small ghost')}</div>` +
    `<div class="card"><div class="filterbar">${field('Начало периода', input('reportFrom', period.from, 'date'))}${field('Конец периода', input('reportTo', period.to, 'date'))}<button type="button" data-action="applyPeriod" class="soft">Обновить</button><button type="button" class="primary" data-action="copyTextReport">📋 Выписка для ИИ</button></div>` +
    `<div class="compact-stats"><div><span>Доходы</span><b class="positive">${rub(s.income)}</b></div><div><span>Расходы</span><b>${rub(s.expense)}</b></div><div><span>Итог периода</span><b class="${s.net < 0 ? 'negative' : 'positive'}">${rub(s.net)}</b></div></div>${trend(s.days, period.from, period.to)}</div>` +
    section('⚡ Авторазбор периода по фактам', insights.length ? insights.map(ins => `<div class="insight"><span class="pill">${esc(ins.badge)}</span><h3 class="section">${esc(ins.title)}</h3><p>${esc(ins.text)}</p></div>`).join('') : '<p class="muted">Добавь операции за выбранный период для автоматического разбора.</p>') +
    section('Доходы и рабочие вычеты (налог и расходы смены)', incRows.map(r => `<div class="income-detail"><b>${esc(category(r.id))}</b><div class="row"><span>Получено грязными</span><b>${rub(r.gross)}</b></div><div class="row"><span>Расходы на смене и налоги</span><b>${rub(r.deductions)}</b></div><div class="row"><span>Чистыми на руки</span><b class="positive">${rub(r.net)}</b></div>${r.estimatedTax ? `<small>Начислено налога: ${rub(r.estimatedTax)} · оплачено: ${rub(r.taxPaid)}</small>` : ''}</div>`).join('') || '<p class="muted">За выбранный период поступлений нет.</p>') +
    `<div class="flat-columns">` +
      section('По категориям', bars(s.rootCategory, category, id => state.categories.find(c => c.id === id)?.color) + `<details><summary>Подкатегории</summary>${bars(Object.fromEntries(state.categories.filter(c => c.parentId).map(c => [c.id, s.category[c.id] || 0])), category)}</details>`) +
      section('Важность покупок', bars(s.importance, id => IMPORTANCE[id])) +
    `</div>`;
}

function categoriesView() {
  const root = state.categories.find(c => c.id === openRootCat && c.kind === catKind);
  return `<div class="actions toolbar">${btn('navigate', '← Ещё', 'more', 'small ghost')}</div>` +
    `<div class="segmented">${btn('categoryKind', 'Расходы', 'expense', catKind === 'expense' ? 'primary' : 'ghost')}${btn('categoryKind', 'Доходы', 'income', catKind === 'income' ? 'primary' : 'ghost')}</div>` +
    (root ? section(esc(root.name), `<div class="actions">${btn('categoryBack', '← Все категории')}${btn('editCategory', 'Изменить категорию', root.id)}</div>`) : '') +
    section(root ? 'Подкатегории' : 'Основные категории',
      state.categories.filter(c => c.kind === catKind && (root ? c.parentId === root.id : !c.parentId)).map(c =>
        listButton(root ? 'editCategory' : 'openCategory', c.name, `${c.hidden ? 'Скрыта · ' : ''}${root ? 'Нажми для изменения' : state.categories.filter(x => x.parentId === c.id).length + ' подкатегорий'}`, c.id)
      ).join('') || '<p class="muted">Пока пусто</p>',
      btn('addCategory', '+ Добавить', root?.id || '', 'small primary')
    );
}

function quickView() {
  return `<div class="actions toolbar">${btn('navigate', '← Ещё', 'more', 'small ghost')}</div>` +
    section('Быстрые шаблоны операций',
      state.quickActions.map(q => `<div class="row wrap-row"><div class="row-main"><b>${esc(q.name)}</b><small>${q.type === 'expense' ? 'Расход' : 'Доход'} · ${esc(category(q.categoryId))} · ${esc(account(q.accountId))}${q.amount ? ' · ' + rub(q.amount) : ''}</small></div><div class="actions">${btn('useQuick', 'Записать', q.id, 'small primary')}${btn('editQuick', '✎', q.id, 'small ghost')}</div></div>`).join('') || '<p class="muted">Создай кнопки для частых трат: бензин, кофе, продукты, проезд.</p>',
      btn('newQuick', '+ Шаблон', '', 'small primary')
    );
}

function recurringView() {
  purchasesTab = 'recurring';
  view = 'purchases';
  return purchasesView();
}

function calendarRange() {
  const [y, m] = calAnchor.split('-').map(Number);
  if (calSpan === 'month') return { from: calAnchor.slice(0, 7) + '-01', to: new Date(Date.UTC(y, m, 0, 12)).toISOString().slice(0, 10) };
  const from = addDays(calAnchor, -((new Date(calAnchor + 'T12:00:00').getDay() + 6) % 7));
  return { from, to: addDays(from, 6) };
}

function calendarView() {
  const { from, to } = calendarRange();
  const m = calendarMoney(state, from, to, calMode);
  const lead = (new Date(from + 'T12:00:00').getDay() + 6) % 7;
  const smallNum = n => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n / 100 >= 1000 ? n / 100000 : n / 100) + (n >= 100000 ? 'к' : '');
  const dayBars = (d, max) => `<span class="day-bars" aria-hidden="true"><i class="day-income" style="height:${100 * (d.income + d.estimate) / max}%"></i>${d.estimate ? `<i class="day-estimate" style="bottom:${100 * d.income / max}%;height:${100 * d.estimate / max}%"></i>` : ''}<i class="day-expense" style="height:${100 * d.expense / max}%"></i></span>`;

  return `<div class="actions toolbar">${btn('navigate', '← Ещё', 'more', 'small ghost')}${btn('moneyToday', 'Сегодня', '', 'small soft')}${btn('newPurchase', '+ План покупки', '', 'small ghost')}</div>` +
    `<div class="segmented">${btn('moneySpan', 'Неделя', 'week', calSpan === 'week' ? 'primary' : 'ghost')}${btn('moneySpan', 'Месяц', 'month', calSpan === 'month' ? 'primary' : 'ghost')}</div>` +
    `<div class="period-control">${btn('moneyMove', '←', '-1')}<b>${date(from)} — ${date(to)}</b>${btn('moneyMove', '→', '1')}</div>` +
    `<div class="segmented">${btn('moneyMode', 'Поступления на счёт', 'received', calMode === 'received' ? 'primary' : 'ghost')}${btn('moneyMode', 'Заработано по дням', 'earned', calMode === 'earned' ? 'primary' : 'ghost')}</div>` +
    `<div class="calendar-legend"><span class="positive">● Доход</span><span class="negative">● Расход</span><span class="expected-text">● Оценка смен</span></div>` +
    `<div class="money-calendar ${calSpan === 'week' ? 'money-week' : ''}">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(n => `<span class="weekday">${n}</span>`).join('')}${'<span></span>'.repeat(lead)}${m.days.map(d => `<button type="button" class="money-day ${d.date === today() ? 'is-today' : ''}" data-action="moneyDay" data-id="${d.date}"><b>${Number(d.date.slice(-2))}</b>${dayBars(d, m.max)}${d.income || d.estimate ? '<small class="positive">+' + smallNum(d.income + d.estimate) + '</small>' : ''}${d.expense ? '<small class="negative">−' + smallNum(d.expense) + '</small>' : ''}${!d.income && !d.estimate && !d.expense ? '<small class="muted">' + (d.hasData ? '0' : '—') + '</small>' : ''}${d.payments.length ? `<small class="plan-mark">План ${d.payments.length}</small>` : ''}</button>`).join('')}</div>` +
    section('Итог выбранного периода',
      `<div class="compact-stats">` +
        `<div><span>${calMode === 'received' ? 'Получено' : 'Подтверждено'}</span><b class="positive">${rub(m.income)}</b></div>` +
        `<div><span>Потрачено</span><b class="negative">${rub(m.expense)}</b></div>` +
        `<div><span>Оценка смен</span><b class="expected-text">${rub(m.estimate)}</b></div>` +
        `<div><span>Чистая разница</span><b>${rub(m.income - m.expense)}</b></div>` +
      `</div>`
    );
}

function purchasesView() {
  const plans = state.plans.filter(pending).sort((a, b) => a.date.localeCompare(b.date));
  const dueNow = plans.filter(p => p.date <= today());
  const future = plans.filter(p => p.date > today());
  const recList = state.recurringPayments || [];
  const notifCfg = state.notifications || { enabled: true };

  return `<div class="actions toolbar">` +
      `${btn('navigate', '← Ещё', 'more', 'small ghost')}` +
      `${btn('notificationsModal', '🔔 Уведомления' + (notifCfg.enabled ? ' (вкл)' : ' (выкл)'), '', 'small soft')}` +
      `${btn('testNotification', '⚡ Тест пуша', '', 'small ghost')}` +
    `</div>` +
    `<div class="segmented">` +
      `${btn('setPurchasesTab', `К оплате (${plans.length})`, 'upcoming', purchasesTab === 'upcoming' ? 'primary' : 'ghost')}` +
      `${btn('setPurchasesTab', `Регулярные шаблоны (${recList.length})`, 'recurring', purchasesTab === 'recurring' ? 'primary' : 'ghost')}` +
    `</div>` +
    (purchasesTab === 'upcoming'
      ? `<div class="actions">${btn('newPurchase', '+ Разовый платёж / покупка', '', 'small primary')}${btn('newRecurring', '+ Регулярный (аренда / подписка)', '', 'small soft')}</div>` +
        section('На сегодня и просроченные', planRows(dueNow)) +
        section('Будущие платежи и покупки', planRows(future))
      : `<div class="actions">${btn('newRecurring', '+ Добавить регулярный платёж', '', 'small primary')}</div>` +
        section('Автоматическое расписание (аренда, связь, подписки)',
          `<p class="muted">Планы по этим шаблонам создаются автоматически на 120 дней вперёд и попадают во вкладку «К оплате» и в пуш-уведомления. Деньги со счёта списываются только когда ты нажмёшь «Купил».</p>` +
          (recList.map(r => `<div class="row wrap-row"><div class="row-main"><b>${esc(r.name)} ${!r.enabled ? '<span class="pill">Пауза</span>' : ''}</b><small>${{ week: 'Каждую неделю', fortnight: 'Раз в 2 недели', month: 'Каждый месяц' }[r.interval]} · с ${date(r.firstDate)} · ${esc(category(r.categoryId))}</small></div><b class="amount">${rub(r.amount)}</b><div class="actions">${btn('editRecurring', 'Изменить', r.id, 'small ghost')}</div></div>`).join('') || '<p class="muted empty-line">Добавь аренду, интернет, подписки или связь.</p>')
        )
    );
}

function forecastView() {
  const end = addDays(today(), 30), f = forecastMoney(state, end);
  const max = Math.max(1, ...f.rows.flatMap(r => [Math.abs(r.certain), Math.abs(r.scenario)]));
  return `<div class="actions toolbar">${btn('navigate', '← Ещё', 'more', 'small ghost')}</div>` +
    section('Прогноз остатка на 30 дней',
      `<p>Стартовый свободный остаток: <b>${rub(f.starting)}</b> (после вычета налогового резерва и резерва накоплений).</p>` +
      `<p class="note">${f.firstDeficit ? `⚠️ Без новых поступлений кассовый разрыв начнётся <b>${date(f.firstDeficit)}</b>.` : '✓ На все запланированные платежи в ближайшие 30 дней денег хватает.'}</p>` +
      `<div class="forecast-list">${f.rows.map(r => `<div class="forecast-row"><span><b>${date(r.date)}</b>${r.out ? `<small class="negative">Платежи −${rub(r.out)}</small>` : ''}${r.incoming ? `<small class="expected-text">Выплата +${rub(r.incoming)}</small>` : ''}</span><span><b class="${r.certain < 0 ? 'negative' : ''}">${rub(r.certain)}</b><i style="width:${100 * Math.abs(r.certain) / max}%"></i><small class="expected-text">С выплатой: ${rub(r.scenario)}</small></span></div>`).join('')}</div>`
    );
}

function monthlyView() {
  const r = monthlyMoney(state, monthCursor);
  return `<div class="actions toolbar">${btn('navigate', '← Ещё', 'more', 'small ghost')}</div>` +
    `<div class="period-control">${btn('monthMove', '←', '-1')}<b>${esc(monthCursor)}</b>${btn('monthMove', '→', '1')}</div>` +
    section('Итоги месяца',
      `<div class="compact-stats">` +
        `<div><span>Получено доходов</span><b class="positive">${rub(r.income)}</b></div>` +
        `<div><span>Потрачено</span><b class="negative">${rub(r.expense)}</b></div>` +
        `<div><span>Разница (доход − расход)</span><b class="${r.net < 0 ? 'negative' : 'positive'}">${rub(r.net)}</b></div>` +
        `<div><span>Отложено в накопления</span><b>${rub(r.savings)}</b></div>` +
        `<div><span>Погашено долгов</span><b>${rub(r.repaid)}</b></div>` +
        `<div><span>Остаток на всех счетах</span><b>${rub(r.remaining)}</b></div>` +
        `<div><span>Ждёт выплаты по расчёткам</span><b class="expected-text">${rub(r.unpaid)}</b></div>` +
        `<div><span>Смены без расчётки</span><b class="expected-text">${rub(r.expected)}</b></div>` +
      `</div>`
    );
}

function settingsView() {
  const curTheme = state.appearance?.theme || 'auto';
  const nf = state.notifications || { enabled: true, dayBefore: true, sameDay: true, overdueNextDay: true, hour: 10 };
  const dueAlerts = duePaymentNotifications(state);
  return `<div class="actions toolbar">${btn('navigate', '← Ещё', 'more', 'small ghost')}</div>` +
    section('🔔 Уведомления о скорых платежах',
      `<p class="muted">Напоминания о планах, рассрочках и долгах: за 1 день до срока, в день платежа (если не оплачено) и на следующий день при просрочке.</p>` +
      `<div class="compact-stats">` +
        `<div><span>Статус пушей</span><b class="${nf.enabled ? 'positive' : 'muted'}">${nf.enabled ? 'Включены' : 'Выключены'}</b><small>Время: ${String(nf.hour ?? 10).padStart(2, '0')}:00</small></div>` +
        `<div><span>Режимы</span><b>${[nf.dayBefore ? 'За 1 дн.' : '', nf.sameDay ? 'В день' : '', nf.overdueNextDay ? 'Просрочка' : ''].filter(Boolean).join(' · ') || 'Нет'}</b><small>Правила контроля</small></div>` +
        `<div><span>Горящих сейчас</span><b class="${dueAlerts.length ? 'expected-text' : 'positive'}">${dueAlerts.length} шт.</b><small>${dueAlerts.length ? 'Требуют внимания' : 'Всё чисто'}</small></div>` +
      `</div>` +
      `<div class="actions">` +
        `${btn('notificationsModal', '⚙️ Настроить уведомления', '', 'primary')}` +
        `${btn('testNotification', '🔔 Проверить уведомление сейчас', '', 'soft')}` +
      `</div>`
    ) +
    section('Тема и внешний вид',
      `<div class="theme-picker">${[['auto', 'Авто (система)'], ['light', 'Светлая'], ['dark', 'Тёмная (OLED)']].map(([id, n]) => btn('setTheme', n, id, curTheme === id ? 'primary' : 'ghost')).join('')}</div>` +
      `<p class="muted">Дизайн-система Android 2026 (Material 3 Expressive). Тёмная тема оптимизирована под AMOLED-экраны.</p>`
    ) +
    section('Резервные копии и APK-защита',
      `<p class="muted">Каждое изменение автоматически сохраняется в локальной базе и дублируется в защищённое хранилище <b>IndexedDB</b>.</p>` +
      `<div class="actions">` +
        `${btn('shareBackup', '📤 Отправить копию (Telegram / Файлы)', '', 'primary')}` +
        `${btn('backup', 'Скачать .json', '', 'soft')}` +
        `${btn('restore', 'Восстановить (текст / файл)', '', 'ghost')}` +
        `${btn('backupText', 'Копия текстом', '', 'ghost')}` +
      `</div>` +
      `<div class="actions section">` +
        `${btn('autoCopies', 'Автокопии (14 дн.)', '', 'soft')}` +
        `${btn('restoreIDB', 'Восстановить из IndexedDB', '', 'ghost')}` +
      `</div>`
    ) +
    section('Доставка: налог и расход бензина',
      `<p>Налог по умолчанию: <b>${state.courier.taxPercent ?? 0}%</b> (в резерве: <b>${rub(taxReserve(state))}</b>) · Авто: <b>${state.courier.fuelPer100 ?? 9.5} л/100 км</b> по <b>${decimal(state.courier.fuelPrice ?? 5850)} ₽/л</b></p>` +
      `<div class="actions">${btn('fuelSettings', '⛽ Расход и цена бензина', '', 'primary')}${btn('taxSettings', 'Настроить % налога', '', 'soft')}${btn('payTax', 'Оплата налога', '', 'ghost')}${btn('navigate', 'Категории →', 'categories', 'ghost')}</div>`
    ) +
    section('Обслуживание и демо-режим',
      `<div class="actions">${btn('refreshApp', '🔄 Обновить кэш приложения', '', 'soft')}${btn('demo', 'Загрузить демо-данные', '', 'ghost')}${btn('reset', 'Очистить все данные', '', 'danger small')}</div>` +
      `<p class="muted section">Финансист 3.0 · Чистый движок (core.js + app.js + styles.css) без внешних трекеров и серверов.</p>`
    );
}


// === MODALS & ACTIONS ===

function categoryControl(kind, name, selected) {
  const chosen = state.categories.find(c => c.id === selected && c.kind === kind);
  const roots = state.categories.filter(c => c.kind === kind && !c.parentId && (!c.hidden || c.id === chosen?.id || c.id === chosen?.parentId));
  const root = chosen?.parentId || chosen?.id || roots[0]?.id;
  const children = state.categories.filter(c => c.parentId === root && (!c.hidden || c.id === selected));
  return field('Основная категория', `<select data-category-root="${name}">${roots.map(c => option(c.id, c.name, root)).join('')}</select>`) +
    field(kind === 'expense' ? 'Подкатегория / уточнение' : 'Категория дохода', `<select name="${name}" data-category-child>${option(root, state.categories.find(c => c.id === root)?.name || 'Общая', selected === root ? root : selected)}${children.map(c => option(c.id, c.name, selected)).join('')}</select>`);
}

function bindCategoryControl() {
  const root = dialog.querySelector('[data-category-root]');
  const child = dialog.querySelector('[data-category-child]');
  if (!root || !child) return;
  const changeTax = () => {
    const tax = dialog.querySelector('[name=taxPercent]');
    if (tax) tax.value = child.value === state.incomeDefaults?.x5 ? (state.courier.taxPercent ?? '') : '';
  };
  root.onchange = () => {
    child.innerHTML = option(root.value, state.categories.find(c => c.id === root.value)?.name || 'Общая', root.value) +
      state.categories.filter(c => c.parentId === root.value && !c.hidden).map(c => option(c.id, c.name)).join('');
    changeTax();
  };
  child.onchange = changeTax;
}

function transactionModal(t, defaults = {}, resuming = false) {
  let draft = null;
  if (!resuming && !t && !Object.keys(defaults).length) {
    try { draft = JSON.parse(localStorage.getItem(KEY + '.draft')); } catch {}
    if (draft && draft.fields && state.accounts.some(a => a.id === draft.fields.accountId)) {
      const original = draft.editId ? state.transactions.find(x => x.id === draft.editId) : null;
      if (draft.editId && !original) draft = null;
      else return transactionModal(original, { ...draft.defaults, ...draft.fields, categoryId: draft.fields.incomeCategoryId || draft.fields.categoryId, _draft: draft }, true);
    }
  }
  draft = defaults._draft || null;
  if (!state.accounts.length) { toast('Сначала добавь счёт'); return accountModal(); }
  const d = {
    type: 'expense', date: today(), accountId: state.accounts[0].id,
    categoryId: state.categories.find(c => c.kind === 'expense')?.id,
    importance: 'unrated', ...defaults, ...t,
    ...(draft ? { ...draft.fields, categoryId: draft.fields.incomeCategoryId || draft.fields.categoryId } : {})
  };
  let items = structuredClone(draft?.items || t?.items || defaults.items || []);
  const draftFields = draft?.fields;
  const recentNotes = [...new Set(state.transactions.map(x => x.note).filter(Boolean))].slice(0, 25);

  const fields = `<div class="formgrid">` +
    `${field('Тип операции', `<select name="type">${Object.entries(TYPES).filter(([id]) => t?.type.startsWith('adjustment') ? id.startsWith('adjustment') : !id.startsWith('adjustment')).map(([id, n]) => option(id, n, d.type)).join('')}</select>`)}` +
    `${field('Дата', input('date', d.date, 'date', 'required'))}` +
    `${field('Счёт', `<select name="accountId">${accountOpts(d.accountId)}</select>`)}` +
    `${field('Сумма, ₽ (можно 250+180)', input('amount', draft ? draft.fields.amount : d.amount ? decimal(d.amount) : '', 'text', 'required inputmode="decimal" placeholder="Например: 450 или 300+150"'))}` +
    `<div class="field full" id="transferFields"></div>` +
    `<div class="field full" id="debtFields"></div>` +
    `<div class="full" id="expenseFields"></div>` +
    `<div class="full" id="incomeFields"></div>` +
    `${field('Название / комментарий', input('note', d.note || '', 'text', 'maxlength="250" list="txNotesList" placeholder="Продукты, Такси, Обед…"'), true)}` +
    `</div><datalist id="txNotesList">${recentNotes.map(n => `<option value="${esc(n)}">`).join('')}</datalist>` +
    `${t ? '<button type="button" class="danger small section" id="deleteTx">Удалить операцию</button>' : ''}`;

  modal(t ? 'Изменить операцию' : 'Записать операцию', fields, f => {
    const type = f.get('type');
    if (type === 'expense' && f.get('isTax') === 'on' && !f.get('deductFromCategoryId')) {
      throw Error('Выбери источник дохода для оплаты налога');
    }
    readItems();
    const totalCents = cents(f.get('amount'));
    let rows = [];
    if (type === 'expense' && items.length) {
      const parts = items.map(i => ({
        productId: i.productId || uid(),
        name: i.name?.trim() || category(i.categoryId),
        amount: cents(i.amount),
        quantity: 1,
        unit: 'шт',
        categoryId: i.categoryId,
        importance: i.importance || f.get('importance') || 'unrated'
      }));
      const splitSum = parts.reduce((n, p) => n + p.amount, 0);
      if (splitSum > totalCents) throw Error('Сумма выделенных категорий превышает общую сумму чека');
      rows = [...parts];
      if (splitSum < totalCents) {
        rows.unshift({
          productId: uid(),
          name: f.get('note').trim() || category(f.get('categoryId')),
          amount: totalCents - splitSum,
          quantity: 1,
          unit: 'шт',
          categoryId: f.get('categoryId'),
          importance: f.get('importance') || 'unrated'
        });
      }
    }

    let resolvedDebtId = f.get('debtId');
    let newDebtToCreate = null;
    if (['borrow', 'lend', 'repay_out', 'repay_in'].includes(type) && resolvedDebtId === '__new__') {
      const newName = (f.get('newDebtName') || '').trim();
      if (!newName) throw Error('Введи имя человека');
      const dir = ['borrow', 'repay_out'].includes(type) ? 'owe' : 'owed';
      const existing = state.debts.find(x => !isInstallmentDebt(x) && x.name.trim().toLowerCase() === newName.toLowerCase());
      if (existing) {
        resolvedDebtId = existing.id;
      } else {
        newDebtToCreate = {
          id: uid(),
          name: newName,
          direction: dir,
          opening: 0,
          due: f.get('newDebtDue') || '',
          note: (f.get('newDebtNote') || '').trim(),
          schedule: [],
          schedulePaidBase: 0
        };
        resolvedDebtId = newDebtToCreate.id;
      }
    }

    const rawNote = f.get('note').trim();
    const autoNote = (!rawNote && newDebtToCreate) ? (`${type === 'lend' ? 'Дал в долг' : 'Взял в долг'}: ${newDebtToCreate.name}`) : rawNote;

    const tx = {
      id: t?.id || uid(),
      type,
      date: f.get('date'),
      accountId: f.get('accountId'),
      amount: totalCents,
      note: autoNote,
      createdAt: t?.createdAt || Date.now(),
      ...(type === 'transfer' ? { toAccountId: f.get('toAccountId') } : {}),
      ...(['borrow', 'lend', 'repay_out', 'repay_in'].includes(type) ? { debtId: resolvedDebtId } : {}),
      ...(type === 'income' ? {
        categoryId: f.get('incomeCategoryId'),
        taxPercent: f.get('taxPercent') === '' ? null : Number(f.get('taxPercent')),
        ...(t?.type === 'income' ? { source: t.source, service: t.service, shiftId: t.shiftId, ...(t.statementId ? { statementId: t.statementId } : {}) } : {})
      } : {}),
      ...(type === 'expense' ? {
        categoryId: f.get('categoryId'),
        importance: f.get('importance'),
        items: rows,
        deductFromCategoryId: f.get('deductFromCategoryId') || null,
        taxForCategoryId: f.get('isTax') === 'on' ? f.get('deductFromCategoryId') || null : null
      } : {})
    };

    if (type === 'expense' && tx.date > today()) {
      if (t) throw Error('Существующий расход нельзя перенести в будущее — создай план');
      if (d.planId) throw Error('Для оплаты выбери сегодня или прошлую дату');
      mutate(s => planFromExpense(s, tx));
      localStorage.removeItem(KEY + '.draft');
      window.removeEventListener('pagehide', saveDraft);
      return;
    }

    if (d.planId) {
      const plan = state.plans.find(p => p.id === d.planId);
      if (!plan || plan.paidTransactionId || plan.status === 'cancelled') throw Error('План уже закрыт');
    }

    const checkState = newDebtToCreate ? { ...state, debts: [...state.debts, newDebtToCreate] } : state;
    validateTransaction(checkState, tx, t?.id);
    mutate(s => {
      if (newDebtToCreate) s.debts.push(newDebtToCreate);
      if (t) s.transactions[s.transactions.findIndex(x => x.id === t.id)] = tx;
      else s.transactions.push(tx);
      if (d.planId) s.plans.find(p => p.id === d.planId).paidTransactionId = tx.id;
      for (const p of s.plans) if (p.paidTransactionId === tx.id && tx.type !== 'expense') p.paidTransactionId = null;
    });
    localStorage.removeItem(KEY + '.draft');
    window.removeEventListener('pagehide', saveDraft);
  });

  items = items.map(i => ({ ...i, amount: draft ? i.amount : decimal(i.amount) }));
  let draftFailed = false;

  const readItems = () => {
    const el = dialog.querySelector('#itemList');
    if (el) {
      items = [...el.querySelectorAll('.item')].map((rowEl, i) => ({
        ...items[i],
        name: rowEl.querySelector('[data-item=name]')?.value || '',
        amount: rowEl.querySelector('[data-item=amount]').value,
        quantity: 1,
        unit: 'шт',
        categoryId: rowEl.querySelector('[data-item=categoryId]').value,
        importance: rowEl.querySelector('[data-item=importance]').value
      }));
    }
  };

  function drawItems() {
    const el = dialog.querySelector('#itemList');
    if (!el) return;
    el.innerHTML = items.map((i, idx) => `<div class="item split-item"><div class="split-grid">${field('Выделить в категорию', `<select data-item="categoryId" data-hierarchy="expense">${categoryOpts(i.categoryId)}</select>`)}${field('Сумма части, ₽', `<input data-item="amount" value="${esc(i.amount)}" inputmode="decimal" required placeholder="Например: 800">`)}${field('Важность', `<select data-item="importance">${importanceOpts(i.importance)}</select>`)}${field('Заметка · необязательно', `<input data-item="name" value="${esc(i.name || '')}" maxlength="80" placeholder="Бытовая химия…">`)}</div><div class="itemfooter"><span class="muted">Остаток чека останется в основной категории</span><button type="button" class="small danger" data-remove="${idx}">Убрать</button></div></div>`).join('');
    el.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => {
      readItems(); items.splice(Number(b.dataset.remove), 1); drawItems(); updateItemTotal(); saveDraft();
    });
    el.querySelectorAll('[data-item="amount"]').forEach(inp => inp.addEventListener('input', updateItemTotal));
  }

  function updateItemTotal() {
    readItems();
    const el = dialog.querySelector('#itemTotal');
    if (!el) return;
    if (!items.length) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    let splitSum = 0;
    try { for (const i of items) splitSum += cents(i.amount || '0'); } catch { el.textContent = 'Укажи сумму выделенной части'; return; }
    const main = dialog.querySelector('[name=amount]');
    let total = 0;
    try { total = cents(main.value || '0'); } catch {}
    if (!total && splitSum > 0) { main.value = decimal(splitSum); total = splitSum; }
    const rem = total - splitSum;
    el.innerHTML = rem >= 0
      ? `<b>Распределение чека:</b> выделено ${rub(splitSum)} · в основной категории останется <b>${rub(rem)}</b>`
      : `<span class="negative">Выделено (${rub(splitSum)}) больше суммы чека (${rub(total)})!</span> <button type="button" class="small soft" id="takeItemTotal">Сделать сумму чека ${rub(splitSum)}</button>`;
    const take = el.querySelector('#takeItemTotal');
    if (take) take.onclick = () => { main.value = decimal(splitSum); updateItemTotal(); saveDraft(); };
  }

  function saveDraft() {
    if (!dialog.open || dialog.querySelector('form') !== draftForm) return;
    readItems();
    try {
      const fObj = Object.fromEntries(new FormData(dialog.querySelector('form')));
      localStorage.setItem(KEY + '.draft', JSON.stringify({ editId: t?.id || null, fields: fObj, items, defaults: { planId: d.planId }, savedAt: Date.now() }));
    } catch {
      if (!draftFailed) { draftFailed = true; }
    }
  }

  function drawType() {
    readItems();
    const type = dialog.querySelector('[name=type]').value;
    dialog.querySelector('#transferFields').innerHTML = type === 'transfer' ? `<span>Куда перевести</span><select name="toAccountId">${accountOpts(d.toAccountId)}</select>` : '';
    if (['borrow', 'lend', 'repay_out', 'repay_in'].includes(type)) {
      const canNew = true;
      const people = state.debts.filter(x => !isInstallmentDebt(x));
      const installments = type === 'repay_out' ? state.debts.filter(x => isInstallmentDebt(x)) : [];
      const list = [...people, ...installments];
      const defaultNew = d.debtId === '__new__' || !list.length;
      const selectedDebt = defaultNew ? '__new__' : (d.debtId || list[0]?.id || '');
      const describeDebtOption = (x) => {
        if (isInstallmentDebt(x)) return `💳 ${x.name} (рассрочка · остаток ${rub(debtRemaining(state, x.id))})`;
        const signed = personSignedBalance(state, x.id);
        if (signed > 0) return `🤝 ${x.name} · мне должен ${rub(signed)}`;
        if (signed < 0) return `🤝 ${x.name} · я должен ${rub(Math.abs(signed))}`;
        return `🤝 ${x.name} · в расчёте (0 ₽)`;
      };
      const labelTitle = {
        lend: 'Кому даёшь в долг',
        borrow: 'У кого берёшь в долг (включая тех, кто должен тебе)',
        repay_in: 'Кто вернул тебе долг',
        repay_out: 'Кому возвращаешь долг или рассрочку'
      }[type];

      dialog.querySelector('#debtFields').innerHTML =
        `<div class="debt-field-header"><span>${labelTitle}</span><button type="button" class="small soft" id="btnToggleNewDebt">${selectedDebt === '__new__' && list.length ? 'Выбрать из списка' : '+ Новый человек'}</button></div>` +
        `<select name="debtId" id="txDebtSelect" required>` +
          `${list.map(x => option(x.id, describeDebtOption(x), selectedDebt)).join('')}` +
          `${option('__new__', '➕ Новый человек / создать прямо здесь…', selectedDebt)}` +
        `</select>` +
        `<div id="inlineNewDebtBox" class="inline-debt-box" ${selectedDebt === '__new__' ? '' : 'hidden'}>` +
          `<div class="formgrid">` +
            `${field('Имя человека', `<input name="newDebtName" type="text" maxlength="80" placeholder="Например: Максим, Алексей" value="${esc(d.newDebtName || '')}" ${selectedDebt === '__new__' ? 'required' : ''}>`, true)}` +
            `${field('Срок возврата · необязательно', `<input name="newDebtDue" type="date" value="${esc(d.newDebtDue || '')}">`)}` +
            `${field('Заметка · необязательно', `<input name="newDebtNote" type="text" maxlength="120" placeholder="До пятницы / на карту" value="${esc(d.newDebtNote || '')}">`)}` +
          `</div>` +
          `<small class="muted">Единый профиль человека: баланс сам пересчитывается в обе стороны.</small>` +
        `</div>`;

      const sel = dialog.querySelector('#txDebtSelect');
      const box = dialog.querySelector('#inlineNewDebtBox');
      const toggleBtn = dialog.querySelector('#btnToggleNewDebt');
      const syncNewBox = () => {
        if (!box) return;
        const isNew = sel.value === '__new__';
        box.hidden = !isNew;
        const nameInp = box.querySelector('[name="newDebtName"]');
        if (nameInp) { nameInp.required = isNew; if (isNew) setTimeout(() => nameInp.focus(), 30); }
        if (toggleBtn) toggleBtn.textContent = isNew && list.length ? 'Выбрать из списка' : '+ Новый человек';
      };
      if (sel) sel.onchange = syncNewBox;
      if (toggleBtn) toggleBtn.onclick = () => {
        sel.value = (sel.value === '__new__' && list.length) ? list[0].id : '__new__';
        syncNewBox();
      };
    } else {
      dialog.querySelector('#debtFields').innerHTML = '';
    }

    dialog.querySelector('#expenseFields').innerHTML = type === 'expense'
      ? `<div class="formgrid">${categoryControl('expense', 'categoryId', d.categoryId)}${field('Важность покупки', `<select name="importance">${importanceOpts(d.importance)}</select>`)}</div>` +
        `${field('Вычесть из рабочего дохода · необязательно', `<select name="deductFromCategoryId"><option value="">Обычный личный расход</option>${categoryOpts(d.deductFromCategoryId || d.taxForCategoryId, 'income')}</select>`)}` +
        `<label class="checks section"><input type="checkbox" name="isTax" ${d.taxForCategoryId ? 'checked' : ''}>Это оплата налога — списать из налогового резерва</label>` +
        `<div class="cardhead section"><h3>✂️ Разделить чек на несколько категорий</h3><button class="small soft" type="button" id="addItem">+ Выделить часть чека</button></div>` +
        `<div id="itemList" class="items"></div><div id="itemTotal" class="item-total" aria-live="polite" hidden></div>`
      : '';

    dialog.querySelector('#incomeFields').innerHTML = type === 'income'
      ? `<div class="formgrid">${categoryControl('income', 'incomeCategoryId', d.type === 'income' ? d.categoryId : state.incomeDefaults?.other)}${field('Налог с поступления, % · необязательно', input('taxPercent', d.taxPercent ?? (d.categoryId === state.incomeDefaults?.x5 ? state.courier.taxPercent ?? '' : ''), 'number', 'min="0" max="100" step="0.1"'))}</div>`
      : '';

    bindCategoryControl();
    if (type === 'expense') {
      drawItems();
      dialog.querySelector('#addItem').onclick = () => {
        readItems();
        items.push({ name: '', amount: '', quantity: 1, unit: 'шт', categoryId: dialog.querySelector('[name=categoryId]').value, importance: dialog.querySelector('[name=importance]').value });
        drawItems();
        updateItemTotal();
        saveDraft();
      };
      updateItemTotal();
    }
  }

  dialog.querySelector('[name=type]').onchange = drawType;
  drawType();
  if (draftFields) {
    for (const [name, value] of Object.entries(draftFields)) {
      const el = dialog.querySelector(`[name="${name}"]`);
      if (el) {
        if (el.type === 'checkbox') el.checked = value === 'on';
        else if (!['categoryId', 'incomeCategoryId'].includes(name)) el.value = value;
      }
    }
    const sel = dialog.querySelector('#txDebtSelect');
    if (sel && draftFields.debtId) { sel.value = draftFields.debtId; if (sel.onchange) sel.onchange(); }
  }
  dialog.querySelector('[name=amount]').addEventListener('input', updateItemTotal);
  const draftForm = dialog.querySelector('form');
  draftForm.addEventListener('input', saveDraft);
  draftForm.addEventListener('change', saveDraft);
  window.addEventListener('pagehide', saveDraft, { once: true });

  const draftNote = document.createElement('div');
  draftNote.className = 'draft-note';
  draftNote.innerHTML = `<small class="muted">${draft ? 'Черновик восстановлен. ' : ''}Незавершённый ввод сохраняется.</small><button type="button" class="small ghost">Очистить черновик</button>`;
  dialog.querySelector('.dialogfoot').before(draftNote);
  draftNote.querySelector('button').onclick = () => {
    localStorage.removeItem(KEY + '.draft');
    draftForm.removeEventListener('input', saveDraft);
    draftForm.removeEventListener('change', saveDraft);
    window.removeEventListener('pagehide', saveDraft);
    dialog.close();
  };

  if (t) {
    dialog.querySelector('#deleteTx').onclick = () => {
      try {
        mutate(s => {
          s.transactions = s.transactions.filter(x => x.id !== t.id);
          s.plans.forEach(p => { if (p.paidTransactionId === t.id) p.paidTransactionId = null; });
        });
        localStorage.removeItem(KEY + '.draft');
        window.removeEventListener('pagehide', saveDraft);
        dialog.close();
        toast('Операция удалена');
      } catch (e) {
        dialog.querySelector('#formError').textContent = e.message;
      }
    };
  }
}

function accountModal(a) {
  modal(a ? 'Изменить счёт' : 'Новый счёт',
    `<div class="formgrid">` +
      field('Название счёта', input('name', a?.name || '', 'text', 'required maxlength="80" placeholder="Например: Т-Банк, Наличные"'), true) +
      field('Тип счёта', `<select name="kind">${Object.entries({ card: 'Банковская карта', cash: 'Наличные', savings: 'Накопительный счёт' }).map(([id, n]) => option(id, n, a?.kind || 'card')).join('')}</select>`) +
      field(a ? 'Текущий остаток, ₽' : 'Начальный остаток, ₽', input('opening', decimal(a ? balance(state, a.id) : 0), 'text', 'required inputmode="decimal"')) +
    `</div>` +
    (a ? field('Как учесть изменение остатка', `<select name="correction"><option value="history">Записать корректировку в истории</option><option value="silent">Изменить начальный остаток без истории</option></select>`) + `<button type="button" class="danger small section" id="deleteEntity">Удалить счёт</button>` : ''),
    f => mutate(s => {
      const raw = String(f.get('opening')).trim();
      const target = raw.startsWith('-') ? -cents(raw.slice(1)) : cents(raw);
      const name = f.get('name').trim(), kind = f.get('kind');
      if (!name) throw Error('Введите название');
      if (a) {
        setAccountBalance(s, a.id, target, f.get('correction') === 'history');
        Object.assign(s.accounts.find(x => x.id === a.id), { name, kind });
      } else {
        s.accounts.push({ id: uid(), name, kind, opening: target });
      }
    })
  );
  if (a) {
    dialog.querySelector('#deleteEntity').onclick = () => {
      try {
        if (state.transactions.some(t => t.accountId === a.id || t.toAccountId === a.id) || state.goals.some(g => g.accountId === a.id) || state.quickActions.some(q => q.accountId === a.id)) {
          throw Error('Счёт используется в операциях, целях или шаблонах');
        }
        mutate(s => s.accounts = s.accounts.filter(x => x.id !== a.id));
        dialog.close();
      } catch (e) {
        dialog.querySelector('#formError').textContent = e.message;
      }
    };
  }
}

function categoryModal(c, parentId = null) {
  const kindVal = c?.kind || state.categories.find(p => p.id === parentId)?.kind || catKind;
  const replacement = state.categories.filter(x => x.kind === kindVal && x.id !== c?.id && x.parentId !== c?.id);
  modal(c ? 'Изменить категорию' : 'Новая категория',
    `<div class="formgrid">` +
      field('Название', input('name', c?.name || '', 'text', 'required maxlength="60"'), true) +
      field('Группа', `<select name="parentId">${option('', 'Основная категория', c?.parentId || parentId || '')}${state.categories.filter(p => p.kind === kindVal && !p.parentId && p.id !== c?.id).map(p => option(p.id, p.name, c?.parentId || parentId)).join('')}</select>`) +
      field('Цвет метки', input('color', c?.color || '#10b981', 'color')) +
    `</div>` +
    `<label class="checks section"><input name="hidden" type="checkbox" ${c?.hidden ? 'checked' : ''}>Скрыть из выбора новых операций</label>` +
    (kindVal === 'income' ? `<label class="checks section"><input name="working" type="checkbox" ${c?.working ? 'checked' : ''}>Считать рабочим доходом</label>` : '') +
    (c && replacement.length ? `<details class="section"><summary>Удалить категорию с переносом истории</summary>${field('Перенести операции в', `<select id="replacement">${replacement.map(x => option(x.id, category(x.id))).join('')}</select>`) }<button id="deleteCategoryBtn" class="danger small section" type="button">Удалить и перенести</button></details>` : ''),
    f => mutate(s => {
      const name = f.get('name').trim(), pId = f.get('parentId') || null;
      if (!name) throw Error('Введите название');
      if (s.categories.some(x => x.id !== c?.id && x.kind === kindVal && (x.parentId || null) === pId && x.name.toLowerCase() === name.toLowerCase())) {
        throw Error('Такая категория уже есть');
      }
      const data = { id: c?.id || uid(), name, parentId: pId, kind: kindVal, color: f.get('color'), hidden: f.get('hidden') === 'on', working: f.get('working') === 'on' };
      if (c) s.categories[s.categories.findIndex(x => x.id === c.id)] = data;
      else s.categories.push(data);
    })
  );
  const del = dialog.querySelector('#deleteCategoryBtn');
  if (del) {
    del.onclick = () => {
      try {
        mutate(s => removeCategory(s, c.id, dialog.querySelector('#replacement').value));
        if (openRootCat === c.id) openRootCat = null;
        dialog.close();
        toast('Категория удалена, записи перенесены');
      } catch (e) {
        dialog.querySelector('#formError').textContent = e.message;
      }
    };
  }
}

function debtModal(d, forceInstallment = false) {
  const paid = d ? repaymentTotal(state, d.id) : 0;
  let rows = structuredClone(d?.schedule || []), base = d?.schedulePaidBase || 0;
  const isInst = d ? isInstallmentDebt(d) : forceInstallment;
  const hasTx = d && state.transactions.some(t => t.debtId === d.id);

  modal(d ? (isInst ? 'Настройки рассрочки' : 'Профиль человека (долги)') : (isInst ? 'Новая рассрочка с графиком' : 'Новый человек (долги)'),
    `<div class="formgrid">` +
      field('Имя человека или название', input('name', d?.name || '', 'text', 'required maxlength="80"'), true) +
      field('Направление', `<select name="direction" ${hasTx ? 'disabled' : ''}>${option('owe', 'Я должен', d?.direction || 'owe')}${option('owed', 'Мне должны', d?.direction)}</select>`) +
      field('Долг до начала учёта, ₽', input('opening', decimal(d?.opening || 0), 'text', 'required inputmode="decimal"')) +
      field('Срок возврата', input('due', d?.due || '', 'date')) +
      field('Заметка', input('note', d?.note || '')) +
    `</div>` +
    `<label class="checks section" ${isInst ? '' : 'hidden'}><input type="checkbox" id="isInstallment" ${isInst || rows.length ? 'checked' : ''}>Рассрочка с графиком платежей</label>` +
    `<div id="scheduleControls">` +
      `<div class="formgrid section">${field('Платежей', input('count', (d ? installmentStatus(state, d).filter(p => p.remaining > 0).length : 0) || 6, 'number', 'min="1" max="120"'))}${field('Первый платёж', input('firstDate', rows[0]?.date || today(), 'date'))}${field('Интервал', `<select name="interval"><option value="week">Каждую неделю</option><option value="fortnight">Раз в 2 недели</option><option value="month">Каждый месяц</option></select>`)}</div>` +
      `<button type="button" id="generateSchedule" class="soft small section">Разбить остаток поровну</button>` +
      `<div id="scheduleList" class="section"></div><div id="scheduleTotal" class="muted"></div>` +
      `<button type="button" id="addScheduleRow" class="small ghost section">+ Платёж вручную</button>` +
    `</div>` +
    (d && !hasTx ? '<button type="button" class="danger small section" id="deleteDebt">Удалить долг</button>' : ''),
    f => {
      const use = dialog.querySelector('#isInstallment').checked;
      if (use) readRows();
      const data = { id: d?.id || uid(), name: f.get('name').trim(), direction: use ? 'owe' : (f.get('direction') || d?.direction || 'owed'), isInstallment: use, opening: cents(f.get('opening')), due: f.get('due'), note: f.get('note').trim(), schedule: use ? rows : [], schedulePaidBase: use ? base : 0 };
      if (!data.name) throw Error('Введите имя');
      if (use && !rows.length) throw Error('Сформируй график платежей');
      mutate(s => {
        if (d) s.debts[s.debts.findIndex(x => x.id === d.id)] = data;
        else s.debts.push(data);
      });
    }
  );

  const readRows = () => {
    const list = dialog.querySelector('#scheduleList');
    if (list) rows = [...list.querySelectorAll('[data-payment]')].map((el, i) => ({ id: rows[i]?.id || uid(), date: el.querySelector('[data-date]').value, amount: cents(el.querySelector('[data-amount]').value) }));
  };
  const updateScheduleSumText = () => {
    const list = dialog.querySelector('#scheduleList');
    let sum = 0;
    if (list) {
      for (const el of list.querySelectorAll('[data-amount]')) {
        try { sum += cents(el.value || '0'); } catch {}
      }
    }
    const totEl = dialog.querySelector('#scheduleTotal');
    if (totEl) totEl.innerHTML = `Всего по графику (${rows.length} пл.): <b>${rub(sum)}</b>`;
  };
  const draw = () => {
    const list = dialog.querySelector('#scheduleList');
    list.innerHTML = rows.map((p, i) =>
      `<div class="schedule-edit" data-payment="${i}">` +
        `<span class="schedule-num">${i + 1}</span>` +
        `<input type="date" data-date value="${p.date}" required aria-label="Дата платежа ${i + 1}">` +
        `<input type="text" data-amount value="${decimal(p.amount)}" inputmode="decimal" data-no-math-bar="true" placeholder="Сумма ₽" required aria-label="Сумма платежа ${i + 1}">` +
        `<button type="button" class="schedule-del-btn" data-remove-payment="${i}" aria-label="Удалить платёж ${i + 1}">✕</button>` +
      `</div>`
    ).join('');
    updateScheduleSumText();
    list.querySelectorAll('[data-amount]').forEach(inp => inp.addEventListener('input', updateScheduleSumText));
    list.querySelectorAll('[data-remove-payment]').forEach(b => b.onclick = () => { readRows(); rows.splice(Number(b.dataset.removePayment), 1); draw(); });
    enhanceMathInputs(list);
  };
  const toggle = () => {
    const enabled = dialog.querySelector('#isInstallment').checked;
    dialog.querySelector('#scheduleControls').hidden = !enabled;
  };
  dialog.querySelector('#isInstallment').onchange = toggle;
  dialog.querySelector('#generateSchedule').onclick = () => {
    try {
      const opening = cents(dialog.querySelector('[name=opening]').value);
      const added = d ? state.transactions.filter(t => t.debtId === d.id && ['borrow', 'lend'].includes(t.type)).reduce((n, t) => n + t.amount, 0) : 0;
      rows = buildSchedule(opening + added - paid, Number(dialog.querySelector('[name=count]').value), dialog.querySelector('[name=firstDate]').value, dialog.querySelector('[name=interval]').value);
      base = paid;
      draw();
    } catch (e) {
      dialog.querySelector('#formError').textContent = e.message;
    }
  };
  dialog.querySelector('#addScheduleRow').onclick = () => { readRows(); rows.push({ id: uid(), date: today(), amount: 0 }); draw(); };
  draw();
  toggle();
  if (dialog.querySelector('#deleteDebt')) {
    dialog.querySelector('#deleteDebt').onclick = () => { mutate(s => s.debts = s.debts.filter(x => x.id !== d.id)); dialog.close(); };
  }
}

function debtHistoryModal(debtId) {
  const d = state.debts.find(x => x.id === debtId);
  if (!d) return;
  const txs = [...state.transactions].filter(t => t.debtId === debtId).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const isInst = isInstallmentDebt(d);
  const signed = isInst ? -debtRemaining(state, debtId) : personSignedBalance(state, debtId);
  const rem = Math.abs(signed);
  const dir = signed >= 0 ? 'owed' : 'owe';
  const statusTitle = isInst ? 'Рассрочка' : (signed > 0 ? 'Мне должен' : signed < 0 ? 'Я должен' : 'В расчёте');

  modal(`${esc(d.name)} · ${statusTitle}`,
    `<div class="shift-total"><span>Текущий баланс</span><strong>${signed > 0 ? '+' : signed < 0 ? '−' : ''}${rub(rem)}</strong><small>${d.opening ? `Начальный остаток: ${rub(d.opening)} · ` : ''}${d.due ? 'Срок: ' + date(d.due) : 'Без срока'}${d.note ? ' · ' + esc(d.note) : ''}</small></div>` +
    `<div class="actions section">` +
      `${rem > 0 ? `<button type="button" class="primary small" data-dh-action="repayDebt">${dir === 'owe' ? 'Отдать долг' : 'Мне вернули'}</button>` : ''}` +
      `${!isInst ? `<button type="button" class="soft small" data-dh-action="lend">Дал в долг</button><button type="button" class="soft small" data-dh-action="borrow">Взял в долг</button>` : ''}` +
      `<button type="button" class="ghost small" data-dh-action="editDebt">Настройки</button>` +
    `</div>` +
    `<h3 class="section">История операций (${txs.length})</h3>` +
    `${txs.map(row).join('') || '<p class="muted">Операций пока не было.</p>'}`
  );
  dialog.querySelectorAll('[data-dh-action]').forEach(b => b.onclick = () => {
    const act = b.dataset.dhAction;
    dialog.close();
    if (act === 'editDebt') debtModal(d, isInst);
    else if (act === 'lend' || act === 'borrow') transactionModal(null, { type: act, debtId: d.id });
    else transactionModal(null, { type: dir === 'owe' ? 'repay_out' : 'repay_in', debtId: d.id, amount: rem });
  });
  dialog.querySelectorAll('[data-action="editTx"]').forEach(b => b.onclick = () => {
    const txId = b.dataset.id;
    dialog.close();
    transactionModal(state.transactions.find(t => t.id === txId));
  });
}

function goalModal(g) {
  if (!state.accounts.some(a => a.kind === 'savings')) {
    toast('Сначала создай накопительный счёт');
    return accountModal();
  }
  modal(g ? 'Изменить цель' : 'Новая цель накоплений',
    `<div class="formgrid">` +
      field('На что копим', input('name', g?.name || '', 'text', 'required maxlength="80"'), true) +
      field('Целевая сумма, ₽', input('target', g ? decimal(g.target) : '', 'text', 'required inputmode="decimal"')) +
      field('Накопительный счёт', `<select name="accountId">${accountOpts(g?.accountId, 'savings')}</select>`) +
      field('Желаемый срок', input('due', g?.due || '', 'date'), true) +
    `</div>` +
    (g ? '<button type="button" class="danger small section" id="deleteEntity">Удалить цель</button>' : ''),
    f => mutate(s => {
      const data = { id: g?.id || uid(), name: f.get('name').trim(), target: cents(f.get('target')), accountId: f.get('accountId'), due: f.get('due') };
      if (!data.name) throw Error('Введите название');
      if (g) s.goals[s.goals.findIndex(x => x.id === g.id)] = data;
      else s.goals.push(data);
    })
  );
  if (g) dialog.querySelector('#deleteEntity').onclick = () => { mutate(s => s.goals = s.goals.filter(x => x.id !== g.id)); dialog.close(); };
}

function planModal(p, chosenDate = null) {
  if (p && !pending(p)) throw Error('Этот план уже закрыт');
  modal(p ? 'Запланированная покупка' : 'Новая запланированная покупка',
    `<div class="formgrid">` +
      field('Название', input('name', p?.name || '', 'text', 'required maxlength="80"'), true) +
      field('Сумма, ₽', input('amount', p ? decimal(p.amount) : '', 'text', 'inputmode="decimal" required')) +
      field('Дата', input('date', p?.date || chosenDate || today(), 'date', 'required')) +
      field('Категория', `<select name="categoryId">${categoryOpts(p?.categoryId)}</select>`) +
      field('Важность', `<select name="importance">${importanceOpts(p?.importance || 'unrated')}</select>`) +
      field('Счёт списания', `<select name="accountId">${option('', 'Выбрать при оплате', p?.accountId || '')}${accountOpts(p?.accountId)}</select>`, true) +
    `</div>` +
    (p ? '<button type="button" class="danger small section" id="deleteEntity">Удалить план</button>' : ''),
    f => mutate(s => {
      const entry = { ...p, id: p?.id || uid(), name: f.get('name').trim(), amount: cents(f.get('amount')), date: f.get('date'), categoryId: f.get('categoryId'), importance: f.get('importance'), accountId: f.get('accountId') || null, paidTransactionId: null, status: 'pending' };
      if (p) s.plans[s.plans.findIndex(x => x.id === p.id)] = entry;
      else s.plans.push(entry);
    })
  );
  if (p && dialog.querySelector('#deleteEntity')) {
    dialog.querySelector('#deleteEntity').onclick = () => {
      mutate(s => {
        if (p.recurringId) {
          const r = s.recurringPayments.find(x => x.id === p.recurringId);
          if (r && !r.skippedDates.includes(p.date)) r.skippedDates.push(p.date);
        }
        s.plans = s.plans.filter(x => x.id !== p.id);
      });
      dialog.close();
    };
  }
}

function quickModal(q) {
  if (!state.accounts.length) return accountModal();
  modal(q ? 'Изменить быстрый шаблон' : 'Новый быстрый шаблон',
    `<div class="formgrid">` +
      field('Название кнопки', input('name', q?.name || '', 'text', 'required maxlength="40" placeholder="Например: Кофе, Бензин"')) +
      field('Тип', `<select id="quickType" name="type">${option('expense', 'Расход', q?.type || 'expense')}${option('income', 'Доход', q?.type)}</select>`) +
      field('Счёт', `<select name="accountId">${accountOpts(q?.accountId)}</select>`) +
      field('Категория', `<select name="categoryId" id="quickCategory">${categoryOpts(q?.categoryId, q?.type || 'expense')}</select>`) +
      field('Сумма по умолчанию · необязательно', input('amount', q?.amount ? decimal(q.amount) : '', 'text', 'inputmode="decimal"')) +
      field('Важность', `<select name="importance">${importanceOpts(q?.importance || 'unrated')}</select>`) +
    `</div>` +
    (q ? '<button type="button" id="deleteQuick" class="danger small section">Удалить шаблон</button>' : ''),
    f => mutate(s => {
      const data = { id: q?.id || uid(), name: f.get('name').trim(), type: f.get('type'), accountId: f.get('accountId'), categoryId: f.get('categoryId'), amount: f.get('amount').trim() ? cents(f.get('amount')) : null, importance: f.get('importance') };
      if (q) s.quickActions[s.quickActions.findIndex(x => x.id === q.id)] = data;
      else s.quickActions.push(data);
    })
  );
  dialog.querySelector('#quickType').onchange = e => { dialog.querySelector('#quickCategory').innerHTML = categoryOpts(null, e.target.value); };
  const del = dialog.querySelector('#deleteQuick');
  if (del) del.onclick = () => { mutate(s => s.quickActions = s.quickActions.filter(x => x.id !== q.id)); dialog.close(); };
}

function useQuickModal(id) {
  const q = state.quickActions.find(x => x.id === id);
  if (!q) return;
  modal(esc(q.name),
    `${field('Сумма, ₽', input('amount', q.amount ? decimal(q.amount) : '', 'text', 'required inputmode="decimal"'))}` +
    `<p class="muted">${esc(account(q.accountId))} · ${esc(category(q.categoryId))}</p>` +
    `<button type="button" class="ghost small section" id="quickFull">Открыть полную форму</button>`,
    f => mutate(s => {
      const amount = cents(f.get('amount'));
      s.transactions.push({
        id: uid(), type: q.type, amount, date: today(), accountId: q.accountId, categoryId: q.categoryId, note: q.name, createdAt: Date.now(),
        ...(q.type === 'expense' ? { importance: q.importance, items: [] } : { taxPercent: q.categoryId === s.incomeDefaults?.x5 ? s.courier.taxPercent : 0 })
      });
    })
  );
  dialog.querySelector('#quickFull').onclick = () => {
    const val = dialog.querySelector('[name=amount]').value;
    const amount = val.trim() ? cents(val) : q.amount;
    dialog.close();
    transactionModal(null, { ...q, id: undefined, amount, note: q.name });
  };
}

function recurringModal(r) {
  modal(r ? 'Регулярный платёж' : 'Новый регулярный платёж',
    `<div class="formgrid">` +
      field('Название', input('name', r?.name || '', 'text', 'required maxlength="80"')) +
      field('Сумма, ₽', input('amount', r ? decimal(r.amount) : '', 'text', 'required inputmode="decimal"')) +
      field('Первый платёж', input('firstDate', r?.firstDate || today(), 'date', 'required')) +
      field('Периодичность', `<select name="interval">${option('week', 'Каждую неделю', r?.interval || 'month')}${option('fortnight', 'Раз в 2 недели', r?.interval)}${option('month', 'Каждый месяц', r?.interval || 'month')}</select>`) +
      field('Конечная дата · необязательно', input('endDate', r?.endDate || '', 'date')) +
      field('Категория', `<select name="categoryId">${categoryOpts(r?.categoryId)}</select>`) +
    `</div>` +
    `<label class="checks section"><input type="checkbox" name="enabled" ${r?.enabled === false ? '' : 'checked'}>Автоматически создавать будущие планы</label>`,
    f => mutate(s => {
      const entry = { id: r?.id || uid(), name: f.get('name').trim(), amount: cents(f.get('amount')), firstDate: f.get('firstDate'), endDate: f.get('endDate'), interval: f.get('interval'), categoryId: f.get('categoryId'), enabled: f.get('enabled') === 'on', skippedDates: r?.skippedDates || [] };
      if (r) {
        s.recurringPayments[s.recurringPayments.findIndex(x => x.id === r.id)] = entry;
        s.plans = s.plans.filter(p => p.recurringId !== r.id || p.date <= today() || p.paidTransactionId);
      } else {
        s.recurringPayments.push(entry);
      }
      syncRecurring(s);
    })
  );
}

// Delivery Shift Actions & Modals
function startDeliveryShift() {
  if (state.courierShifts.some(x => x.startedAt && !x.endedAt)) throw Error('Смена уже активна');
  const taxInp = app.querySelector('#startShiftTaxInput');
  const rawTax = taxInp ? taxInp.value.trim() : '';
  const taxPercent = rawTax === '' ? (state.courier.taxPercent ?? 0) : Number(rawTax);
  if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) throw Error('Укажи налог от 0 до 100%');

  const timeInp = app.querySelector('#startShiftTimeInput');
  let startedAt = Date.now();
  if (timeInp && /^\d{2}:\d{2}$/.test(timeInp.value)) {
    const [hh, mm] = timeInp.value.split(':').map(Number);
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    if (d.getTime() <= Date.now() + 60000) startedAt = d.getTime();
  }

  const odoInp = app.querySelector('#startShiftOdoInput');
  const rawOdo = odoInp ? odoInp.value.trim().replace(',', '.') : '';
  const odoStart = rawOdo && Number(rawOdo) >= 0 ? Number(rawOdo) : (lastKnownOdometer(state) || null);

  mutate(s => {
    s.courier.taxPercent = taxPercent;
    s.courierShifts.push({
      id: uid(),
      date: today(),
      service: 'Доставка',
      startedAt,
      odoStart,
      odoEnd: null,
      fuelPer100: s.courier.fuelPer100 ?? 9.5,
      fuelPrice: s.courier.fuelPrice ?? 5850,
      lunchRemainingMs: 3600000,
      lunchStartedAt: null,
      entries: [],
      earned: 0,
      hours: 0,
      orders: 0,
      taxPercent
    });
  });
  quickOrders = 1;
  quickPlusMode = false;
  resetDrumToAverage(1);
  toast(`Смена запущена с ${clock(startedAt)} (налог ${taxPercent}%)`);
}

function toggleLunchTimer(shiftId) {
  const x = state.courierShifts.find(sh => sh.id === shiftId);
  if (!x) return;
  const now = Date.now();
  const lunch = shiftLunchState(x, now);
  if (lunch.active) {
    mutate(s => {
      const sh = s.courierShifts.find(item => item.id === shiftId);
      sh.lunchRemainingMs = lunch.remainingMs;
      sh.lunchStartedAt = null;
      sh.lunchWarned5m = false;
      sh.lunchWarnedEnd = false;
    });
    toast(`Снялся с обеда · в запасе осталось ${formatLunchClock(lunch.remainingMs)}`);
  } else {
    if (lunch.remainingMs <= 0) {
      toast('Часовой лимит обеда на этой смене уже исчерпан');
      return;
    }
    mutate(s => {
      const sh = s.courierShifts.find(item => item.id === shiftId);
      sh.lunchRemainingMs = lunch.remainingMs;
      sh.lunchStartedAt = now;
      sh.lunchWarned5m = false;
      sh.lunchWarnedEnd = false;
    });
    toast(`Обед запущен · осталось ${formatLunchClock(lunch.remainingMs)}`);
  }
}

function fuelSettingsModal() {
  const curPer100 = state.courier.fuelPer100 ?? 9.5;
  const curPrice = decimal(state.courier.fuelPrice ?? 5850);
  modal('⛽ Настройки расхода и цены бензина',
    `<p class="muted">Используются для автоматического подсчёта расходов на топливо по пробегу за смену:</p>` +
    `<div class="formgrid section">` +
      field('Расход авто, л на 100 км', input('fuelPer100', curPer100, 'text', 'inputmode="decimal" data-no-math="true" required placeholder="Например: 9.5"')) +
      field('Цена 1 литра бензина, ₽', input('fuelPrice', curPrice, 'text', 'inputmode="decimal" data-no-math="true" required placeholder="Например: 58.50"')) +
    `</div>`,
    f => mutate(s => {
      const per100 = Number(String(f.get('fuelPer100') || '0').replace(',', '.'));
      const priceCents = cents(f.get('fuelPrice'));
      if (!Number.isFinite(per100) || per100 < 0 || per100 > 60) throw Error('Укажи расход от 0 до 60 л/100 км');
      s.courier.fuelPer100 = per100;
      s.courier.fuelPrice = priceCents;
      for (const sh of s.courierShifts) {
        if (sh.startedAt && !sh.endedAt) {
          sh.fuelPer100 = per100;
          sh.fuelPrice = priceCents;
        }
      }
    })
  );
}

function shiftOdoModal(shiftId) {
  const x = state.courierShifts.find(sh => sh.id === shiftId);
  if (!x) return;
  const fStats = shiftFuelStats(state, x);
  modal('⛽ Пробег смены',
    `<div class="formgrid">` +
      field('Пробег на начало смены, км', input('odoStart', x.odoStart ?? '', 'text', 'inputmode="decimal" data-no-math="true" placeholder="Например: 154200"')) +
      field('Пробег на конец (или сейчас), км', input('odoEnd', x.odoEnd ?? '', 'text', 'inputmode="decimal" data-no-math="true" placeholder="Например: 154295"')) +
      field('Расход, л/100 км', input('fuelPer100', x.fuelPer100 ?? state.courier.fuelPer100 ?? 9.5, 'text', 'inputmode="decimal" data-no-math="true" required')) +
      field('Цена бензина, ₽/л', input('fuelPrice', decimal(x.fuelPrice ?? state.courier.fuelPrice ?? 5850), 'text', 'inputmode="decimal" data-no-math="true" required')) +
    `</div>` +
    `<div class="note section" id="odoLivePreview">` +
      (fStats.km > 0 ? `Пройдено: <b>${fStats.km} км</b> · Израсходовано: <b>${fStats.liters} л</b> · Стоимость бензина: <b>−${rub(fStats.cost)}</b>` : 'Укажи пробег на старт и конец, чтобы рассчитать бензин.') +
    `</div>`,
    f => mutate(s => {
      const sh = s.courierShifts.find(item => item.id === shiftId);
      const rawStart = String(f.get('odoStart') || '').trim().replace(',', '.');
      const rawEnd = String(f.get('odoEnd') || '').trim().replace(',', '.');
      const per100 = Number(String(f.get('fuelPer100') || '0').replace(',', '.'));
      const priceCents = cents(f.get('fuelPrice'));
      sh.odoStart = rawStart !== '' ? Number(rawStart) : null;
      sh.odoEnd = rawEnd !== '' ? Number(rawEnd) : null;
      if (sh.odoStart !== null && sh.odoEnd !== null && sh.odoEnd < sh.odoStart) {
        throw Error('Конечный пробег не может быть меньше начального');
      }
      sh.fuelPer100 = per100;
      sh.fuelPrice = priceCents;
      s.courier.fuelPer100 = per100;
      s.courier.fuelPrice = priceCents;
    })
  );
}

function quickAddDelivery(shiftId, forceNoAmount = false) {
  const x = state.courierShifts.find(sh => sh.id === shiftId);
  if (!x) return;
  const amountInput = app.querySelector(`[data-quick-amount="${shiftId}"]`);
  const rawAmount = forceNoAmount ? '' : (amountInput?.value || '').trim();
  const amount = rawAmount ? cents(rawAmount) : null;
  let orders = quickOrders;
  if (quickPlusMode) {
    const customInp = app.querySelector(`#customQuickOrders_${shiftId}`);
    orders = Math.max(1, Math.min(1000, Number(customInp?.value) || 3));
  }
  mutate(st => {
    const shift = st.courierShifts.find(sh => sh.id === shiftId);
    shift.entries.push({ id: uid(), orders, packages: 0, takenAt: localDatetime(Date.now()), amount });
    syncShift(shift);
  });
  quickOrders = 1;
  quickPlusMode = false;
  resetDrumToAverage(1);
  toast(`Поездка (#${(x.entries?.length || 0) + 1}, выдач: ${orders})${amount ? ' на ' + rub(amount) : ' без суммы'} записана`);
}

function quickTip(shiftId, rubles) {
  const targetAcc = state.accounts.find(a => a.kind === 'card') || state.accounts.find(a => a.kind !== 'savings');
  if (!targetAcc) { toast('Сначала добавь карту или наличные'); return accountModal(); }
  const amount = Number(rubles) * 100;
  mutate(st => {
    const x = st.courierShifts.find(sh => sh.id === shiftId);
    st.transactions.push({ id: uid(), type: 'income', amount, date: today(), accountId: targetAcc.id, categoryId: st.incomeDefaults?.tips, source: 'courierTip', service: x.service, shiftId, taxPercent: x.taxPercent && st.courier.taxTips ? x.taxPercent : 0, note: 'Чаевые', createdAt: Date.now() });
  });
  toast(`Чаевые +${rub(amount)} зачислены на «${targetAcc.name}»`);
}

function shiftExpenseModal(shiftId) {
  const x = state.courierShifts.find(sh => sh.id === shiftId);
  if (!state.accounts.length) { toast('Сначала добавь счёт'); return accountModal(); }
  const defaultAcc = state.accounts.find(a => a.kind !== 'savings')?.id || state.accounts[0].id;
  const defaultCat = state.categories.find(c => c.kind === 'expense' && ['transport', 'food'].includes(c.id))?.id || state.categories.find(c => c.kind === 'expense')?.id;
  modal('Расход на смене',
    `<div class="formgrid">` +
      field('Сумма, ₽', input('amount', '', 'text', 'inputmode="decimal" required placeholder="Например: 250"')) +
      field('Что оплатил', input('note', '', 'text', 'placeholder="Перекус, вода, проезд, бензин…" maxlength="120"')) +
      field('Счёт списания', `<select name="accountId">${accountOpts(defaultAcc)}</select>`) +
      field('Категория расхода', `<select name="categoryId">${categoryOpts(defaultCat, 'expense')}</select>`) +
    `</div>` +
    `<div class="quick-presets section"><span class="muted">Быстро:</span>${[['Перекус', 'food', 250], ['Вода / кофе', 'food', 120], ['Проезд', 'transport', 100], ['Бензин', 'transport', 1000]].map(([label, cat, amt]) => `<button type="button" class="small soft" data-shift-exp-preset="${label}|${cat}|${amt}">${label} (${amt} ₽)</button>`).join('')}</div>` +
    `<p class="muted">Спишется со счёта и вычтется из чистого дохода смены.</p>`,
    f => mutate(st => {
      const amount = cents(f.get('amount'));
      const note = (f.get('note') || '').trim() || 'Расход на смене';
      st.transactions.push({ id: uid(), type: 'expense', date: x?.date || today(), accountId: f.get('accountId'), amount, categoryId: f.get('categoryId'), importance: 'needed', deductFromCategoryId: st.incomeDefaults?.x5, shiftId: x?.id, note, items: [], createdAt: Date.now() });
    })
  );
  dialog.querySelectorAll('[data-shift-exp-preset]').forEach(b => b.onclick = () => {
    const [label, cat, amt] = b.dataset.shiftExpPreset.split('|');
    dialog.querySelector('[name="note"]').value = label;
    dialog.querySelector('[name="amount"]').value = amt;
    const catEl = dialog.querySelector('[name="categoryId"]');
    if (catEl && state.categories.some(c => c.id === cat)) catEl.value = cat;
  });
}

function editShiftTaxModal(shiftId) {
  const x = state.courierShifts.find(sh => sh.id === shiftId);
  if (!x) return;
  modal('Налог текущей смены', field('Процент налога, %', input('taxPercent', x.taxPercent ?? 0, 'number', 'min="0" max="100" step="0.1" required')), f => mutate(s => {
    const val = Number(f.get('taxPercent'));
    const sh = s.courierShifts.find(item => item.id === shiftId);
    sh.taxPercent = val;
    s.courier.taxPercent = val;
  }));
}

function deliveryModal(shiftId, entryId) {
  const x = state.courierShifts.find(sh => sh.id === shiftId), e = x.entries.find(item => item.id === entryId);
  const curOrders = e?.orders || 1;
  const is3Plus = curOrders >= 3;
  modal(e ? 'Изменить поездку' : 'Поездка с выбором времени',
    `<div class="orders-3btn-group section"><span class="label">Выдач:</span>` +
      `<button type="button" data-modal-count="1" class="${curOrders === 1 ? 'primary' : 'ghost'}">1</button>` +
      `<button type="button" data-modal-count="2" class="${curOrders === 2 ? 'primary' : 'ghost'}">2</button>` +
      `<button type="button" data-modal-count="3+" class="${is3Plus ? 'primary' : 'ghost'}">3+</button>` +
    `</div>` +
    `<div class="formgrid section">` +
      `<label class="field" id="customOrderCount" ${is3Plus ? '' : 'hidden'}><span>Точное число выдач</span>${input('orders', curOrders, 'number', 'required min="1" max="1000"')}</label>` +
      `${field('Время взятия', input('takenAt', e?.takenAt || (!e ? localDatetime(Date.now()) : ''), 'datetime-local', !e ? 'required' : ''))}` +
      `${field('Сумма за поездку, ₽', input('amount', e?.amount ? decimal(e.amount) : '', 'text', 'inputmode="decimal"'), true)}` +
    `</div>` +
    `${e ? '<button type="button" class="danger small section" id="undoDelivery">Удалить поездку</button>' : ''}`,
    f => mutate(s => {
      const shift = s.courierShifts.find(sh => sh.id === shiftId);
      const data = { id: e?.id || uid(), orders: Number(f.get('orders')), packages: e?.packages || 0, takenAt: f.get('takenAt') || null, amount: f.get('amount').trim() ? cents(f.get('amount')) : null };
      if (e) shift.entries[shift.entries.findIndex(item => item.id === entryId)] = data;
      else shift.entries.push(data);
      syncShift(shift);
    })
  );
  dialog.querySelectorAll('[data-modal-count]').forEach(b => b.onclick = () => {
    const v = b.dataset.modalCount;
    dialog.querySelectorAll('[data-modal-count]').forEach(btnEl => btnEl.className = btnEl === b ? 'primary' : 'ghost');
    const wrap = dialog.querySelector('#customOrderCount');
    const inp = dialog.querySelector('[name=orders]');
    if (v === '3+') {
      wrap.hidden = false;
      if (Number(inp.value) < 3) inp.value = 3;
      inp.focus();
    } else {
      wrap.hidden = true;
      inp.value = v;
      dialog.querySelector('[name=amount]').focus();
    }
  });
  const undo = dialog.querySelector('#undoDelivery');
  if (undo) undo.onclick = () => {
    mutate(s => { const shift = s.courierShifts.find(sh => sh.id === shiftId); shift.entries = shift.entries.filter(item => item.id !== entryId); syncShift(shift); });
    dialog.close();
    toast('Поездка удалена');
  };
}

function tipModal(id) {
  if (!state.accounts.length) return accountModal();
  modal('Чаевые на смене',
    `<div class="formgrid">${field('Сумма, ₽', input('amount', '', 'text', 'required inputmode="decimal"'))}${field('Куда получил', `<select name="accountId">${state.accounts.filter(a => a.kind !== 'savings').map(a => option(a.id, a.name + ' · ' + (a.kind === 'cash' ? 'наличные' : 'карта'))).join('')}</select>`)}</div>`,
    f => mutate(s => {
      const x = s.courierShifts.find(sh => sh.id === id);
      s.transactions.push({ id: uid(), type: 'income', amount: cents(f.get('amount')), date: today(), accountId: f.get('accountId'), categoryId: s.incomeDefaults?.tips, source: 'courierTip', service: x.service, shiftId: id, taxPercent: x.taxPercent && s.courier.taxTips ? x.taxPercent : 0, note: 'Чаевые', createdAt: Date.now() });
    })
  );
}

function shiftDetailsModal(id, finish = false) {
  const x = state.courierShifts.find(sh => sh.id === id), t = shiftTotals(state, x), exp = shiftExpensesTotal(x);
  const cleanTotal = t.net - exp - (t.fuelCost || 0);
  modal(finish ? 'Завершить смену' : 'Итог смены · ' + date(x.date),
    `<div class="shift-total"><span>Чистыми за смену (после налога, бензина и расходов)</span><strong id="finishCleanTotal">${rub(cleanTotal)}</strong></div>` +
    `<div class="row"><span>Поездки (${t.trips ?? 0} шт. / ${t.orders} выдач)</span><b>${rub(t.earned)}</b></div>` +
    `<div class="row"><span>Чаевые</span><b>${rub(t.tips)}</b></div>` +
    `<div class="row"><span>Налог смены (${x.taxPercent ?? 0}%)</span><b>−${rub(t.tax)}</b></div>` +
    `<div class="row" id="finishFuelRow"><span>Бензин (${t.fuelKm || 0} км · ${t.fuelLiters || 0} л)</span><b>−${rub(t.fuelCost || 0)}</b></div>` +
    `${exp ? `<div class="row"><span>Прочие расходы на смене</span><b>−${rub(exp)}</b></div>` : ''}` +
    `<div class="formgrid section">` +
      `<label class="field"><span>Пробег на начало, км</span><input id="shiftOdoStart" type="text" inputmode="decimal" data-no-math="true" value="${esc(x.odoStart ?? '')}" placeholder="Например: 154200"></label>` +
      `<label class="field"><span>Пробег на конец смены, км</span><input id="shiftOdoEnd" type="text" inputmode="decimal" data-no-math="true" value="${esc(x.odoEnd ?? '')}" placeholder="Например: 154295"></label>` +
      `<label class="field"><span>Начало смены</span><input id="shiftStart" type="datetime-local" value="${localDatetime(x.startedAt)}" required></label>` +
      `${!finish ? `<label class="field"><span>Завершение</span><input id="shiftEnd" type="datetime-local" value="${localDatetime(x.endedAt)}" required></label>` : ''}` +
    `</div>`,
    () => mutate(s => {
      const shift = s.courierShifts.find(sh => sh.id === id);
      const rawStart = dialog.querySelector('#shiftOdoStart').value.trim().replace(',', '.');
      const rawEnd = dialog.querySelector('#shiftOdoEnd').value.trim().replace(',', '.');
      shift.odoStart = rawStart !== '' ? Number(rawStart) : null;
      shift.odoEnd = rawEnd !== '' ? Number(rawEnd) : null;
      if (shift.odoStart !== null && shift.odoEnd !== null && shift.odoEnd < shift.odoStart) {
        throw Error('Пробег на конец смены не может быть меньше начального');
      }
      shift.fuelPer100 ??= s.courier.fuelPer100 ?? 9.5;
      shift.fuelPrice ??= s.courier.fuelPrice ?? 5850;
      if ( shift.lunchStartedAt ) {
        const lState = shiftLunchState(shift);
        shift.lunchRemainingMs = lState.remainingMs;
        shift.lunchStartedAt = null;
      }
      shift.startedAt = new Date(dialog.querySelector('#shiftStart').value).getTime();
      shift.date = localDatetime(shift.startedAt).slice(0, 10);
      shift.endedAt = finish ? Date.now() : new Date(dialog.querySelector('#shiftEnd').value).getTime();
      syncShift(shift);
    })
  );
  const recalcFinishPreview = () => {
    const sVal = Number(dialog.querySelector('#shiftOdoStart').value.trim().replace(',', '.')) || 0;
    const eVal = Number(dialog.querySelector('#shiftOdoEnd').value.trim().replace(',', '.')) || 0;
    const tempShift = { ...x, odoStart: sVal, odoEnd: eVal };
    const f = shiftFuelStats(state, tempShift);
    const fuelRow = dialog.querySelector('#finishFuelRow');
    const cleanEl = dialog.querySelector('#finishCleanTotal');
    if (fuelRow) fuelRow.innerHTML = `<span>Бензин (${f.km} км · ${f.liters} л)</span><b>−${rub(f.cost)}</b>`;
    if (cleanEl) cleanEl.textContent = rub(t.net - exp - f.cost);
  };
  dialog.querySelector('#shiftOdoStart').addEventListener('input', recalcFinishPreview);
  dialog.querySelector('#shiftOdoEnd').addEventListener('input', recalcFinishPreview);
}

function shiftManualModal(x) {
  modal(x ? 'Изменить смену' : 'Смена за прошлую дату',
    `<div class="formgrid">` +
      field('Дата смены', input('date', x?.date || today(), 'date', `required max="${today()}"`)) +
      field('Налог смены, %', input('taxPercent', x?.taxPercent ?? state.courier.taxPercent ?? 4, 'number', 'min="0" max="100" step="0.1"')) +
      field('Часы на смене', input('hours', x?.hours || '', 'number', 'min="0" max="24" step="0.25"')) +
      field('Выдач заказов', input('orders', x?.orders || '', 'number', 'min="0" step="1"')) +
      field('Заработано за смену, ₽', input('earned', x?.earned !== null && x?.earned !== undefined ? decimal(x.earned) : '', 'text', 'inputmode="decimal"'), true) +
      field('Заметка', input('note', x?.note || ''), true) +
    `</div>`,
    f => mutate(s => {
      const entry = { id: x?.id || uid(), date: f.get('date'), service: 'Доставка', taxPercent: Number(f.get('taxPercent') || 0), hours: Number(f.get('hours') || 0), orders: Number(f.get('orders') || 0), earned: f.get('earned').trim() ? cents(f.get('earned')) : null, note: f.get('note').trim() };
      if (x) s.courierShifts[s.courierShifts.findIndex(a => a.id === x.id)] = entry;
      else s.courierShifts.push(entry);
    })
  );
}

function autoStatementModal(editStmt = null) {
  const unconfirmed = state.courierShifts.filter(x => !state.courierStatements.some(r => r.from <= x.date && r.to >= x.date)).sort((a, b) => a.date.localeCompare(b.date));
  const from = editStmt?.from || (unconfirmed.length ? unconfirmed[0].date : addDays(today(), -7));
  const to = editStmt?.to || (unconfirmed.length ? unconfirmed.at(-1).date : today());
  const calcForRange = (fDate, tDate) => state.courierShifts.filter(x => x.date >= fDate && x.date <= tDate).reduce((n, x) => n + shiftTotals(state, x).earned, 0);
  const initialTotal = editStmt ? editStmt.amount : calcForRange(from, to);

  modal(editStmt ? 'Изменить расчётку' : 'Сверить и внести расчётку',
    `<div class="formgrid">` +
      field('Период с', input('from', from, 'date', 'required id="stmtFrom"')) +
      field('По', input('to', to, 'date', `required max="${today()}" id="stmtTo"`)) +
      field('Сумма по расчётке, ₽', input('amount', initialTotal ? decimal(initialTotal) : '', 'text', 'required inputmode="decimal" id="stmtAmount"'), true) +
      field('Заметка', input('note', editStmt?.note || (unconfirmed.length ? `Смен: ${unconfirmed.length}` : '')), true) +
    `</div>` +
    `<div class="note" id="stmtDiffBox">По твоим сменам за этот период: <b>${rub(calcForRange(from, to))}</b></div>`,
    f => mutate(st => {
      const fDate = f.get('from'), tDate = f.get('to'), amt = cents(f.get('amount'));
      const est = calcForRange(fDate, tDate), diff = amt - est;
      const diffNote = !editStmt && est > 0 && diff !== 0 ? ` (${diff > 0 ? '+' : ''}${rub(diff)} к сменам)` : '';
      const entry = { id: editStmt?.id || uid(), from: fDate, to: tDate, service: 'Доставка', amount: amt, note: (f.get('note').trim() + diffNote).trim(), created: editStmt?.created || today() };
      if (editStmt) st.courierStatements[st.courierStatements.findIndex(x => x.id === editStmt.id)] = entry;
      else st.courierStatements.push(entry);
    })
  );
  const updateDiff = () => {
    const fDate = dialog.querySelector('#stmtFrom').value;
    const tDate = dialog.querySelector('#stmtTo').value;
    const est = calcForRange(fDate, tDate);
    let entered = 0;
    try { entered = cents(dialog.querySelector('#stmtAmount').value || '0'); } catch {}
    const diff = entered - est;
    const box = dialog.querySelector('#stmtDiffBox');
    if (box) {
      box.innerHTML = `По твоим записям смен: <b>${rub(est)}</b>` + (entered > 0 && est > 0 ? ` · Разница: <b class="${diff >= 0 ? 'positive' : 'negative'}">${diff >= 0 ? '+' : ''}${rub(diff)} ${diff > 0 ? '(бонус / доплата)' : diff < 0 ? '(меньше оценки)' : '(совпадает 1 в 1)'}</b>` : '');
    }
  };
  dialog.querySelector('#stmtFrom').onchange = updateDiff;
  dialog.querySelector('#stmtTo').onchange = updateDiff;
  dialog.querySelector('#stmtAmount').addEventListener('input', updateDiff);
  updateDiff();
}

function payoutModal(statementId = null) {
  if (!state.accounts.length) return accountModal();
  const pendingList = state.courierStatements.filter(r => statementRemaining(state, r.id) > 0);
  const selected = statementId || pendingList[0]?.id || '';
  modal('Выплата доставки на счёт',
    `<div class="formgrid">` +
      field('По какой расчётке', `<select name="statementId" id="payoutStatement"><option value="">Без расчётки</option>${pendingList.map(r => option(r.id, `${date(r.from)}–${date(r.to)} · остаток ${rub(statementRemaining(state, r.id))}`, selected)).join('')}</select>`, true) +
      field('Пришло на счёт, ₽', input('amount', selected ? decimal(statementRemaining(state, selected)) : '', 'text', 'inputmode="decimal" required')) +
      field('Дата выплаты', input('date', today(), 'date', `required max="${today()}"`)) +
      field('На какой счёт', `<select name="accountId">${accountOpts()}</select>`, true) +
    `</div>` +
    `<p class="muted">Налог (${state.courier.taxPercent ?? 0}%) автоматически отложится в резерв.</p>`,
    f => mutate(s => {
      const id = f.get('statementId');
      s.transactions.push({ id: uid(), type: 'income', amount: cents(f.get('amount')), date: f.get('date'), accountId: f.get('accountId'), source: 'courier', service: 'Доставка', categoryId: serviceCategory(s, 'Доставка'), taxPercent: s.courier.taxPercent ?? 0, ...(id ? { statementId: id } : {}), note: 'Выплата доставки', createdAt: Date.now() });
    })
  );
  dialog.querySelector('#payoutStatement').onchange = e => {
    dialog.querySelector('[name=amount]').value = e.target.value ? decimal(statementRemaining(state, e.target.value)) : '';
  };
}

function taxSettingsModal() {
  modal('Налог доставки по умолчанию',
    `${field('Процент налога, %', input('taxPercent', state.courier.taxPercent ?? 4, 'number', 'min="0" max="100" step="0.1"'))}` +
    `<label class="checks section"><input type="checkbox" name="taxTips" ${state.courier.taxTips ? 'checked' : ''}>Облагать чаевые налогом</label>`,
    f => mutate(s => {
      s.courier.taxPercent = f.get('taxPercent') === '' ? 0 : Number(f.get('taxPercent'));
      s.courier.taxTips = f.get('taxTips') === 'on';
    })
  );
}

function dayModal(d) {
  const m = calendarMoney(state, d, d, calMode), day = m.days[0];
  modal('День · ' + date(d),
    `<div class="compact-stats">` +
      `<div><span>Доход</span><b class="positive">${rub(day.income)}</b></div>` +
      `<div><span>Расход</span><b class="negative">${rub(day.expense)}</b></div>` +
      `<div><span>Оценка смен</span><b>${rub(day.estimate)}</b></div>` +
      `<div><span>Итог дня</span><b>${rub(day.income - day.expense)}</b></div>` +
    `</div>` +
    `<h3>Операции за день</h3>` +
    `${day.transactions.map(id => row(state.transactions.find(t => t.id === id))).join('') || '<p class="muted">Нет операций.</p>'}` +
    `<h3>Запланировано</h3>` +
    `${planRows(day.plans.map(id => state.plans.find(p => p.id === id)))}` +
    `<div class="actions section">${btn('newPurchase', '+ План на этот день', d, 'small soft')}</div>`
  );
  dialog.querySelectorAll('[data-action]').forEach(b => b.onclick = () => {
    const act = b.dataset.action, id = b.dataset.id;
    dialog.close();
    action(act, id);
  });
}

function filterModal() {
  modal('Фильтры операций',
    `<div class="formgrid">` +
      field('С', input('from', filters.from, 'date')) +
      field('По', input('to', filters.to, 'date')) +
      field('Категория', `<select name="category">${option('', 'Все категории', filters.category)}${categoryOpts(filters.category, null)}</select>`) +
      field('Важность', `<select name="importance">${option('', 'Любая', filters.importance)}${importanceOpts(filters.importance)}</select>`) +
      field('Поиск', input('search', filters.search, 'search', 'placeholder="Название или заметка"'), true) +
    `</div>` +
    `<button type="button" id="clearFilters" class="ghost small section">Сбросить фильтры</button>`,
    f => {
      const next = { ...filters, from: f.get('from'), to: f.get('to'), category: f.get('category'), importance: f.get('importance'), search: f.get('search') };
      if (next.from && next.to && next.from > next.to) throw Error('Проверь период');
      filters = next;
      render();
setTimeout(() => { checkStartupPaymentAlerts(); syncNativeNotifications(false); }, 600);
    }
  );
  dialog.querySelector('#clearFilters').onclick = () => {
    filters = { from: '', to: '', category: '', importance: '', search: '', typeGroup: '' };
    dialog.close();
    render();
setTimeout(() => { checkStartupPaymentAlerts(); syncNativeNotifications(false); }, 600);
  };
  dialog.querySelector('[type=submit]').textContent = 'Применить';
}

function copiesModal() {
  let copies = [];
  try { copies = JSON.parse(localStorage.getItem(KEY + '.copies') || '[]'); } catch {}
  modal('Автоматические копии (14 дн.)',
    `<p class="muted">Сохраняются автоматически при изменениях.</p>` +
    (copies.map((c, i) => `<div class="row"><span class="row-main">${esc(new Date(c.stamp).toLocaleString('ru-RU'))}${c.daily ? ' · дневная' : ''}</span><button type="button" class="small ghost" data-copy-download="${i}">Скачать</button><button type="button" class="small soft" data-copy-restore="${i}">Восстановить</button></div>`).join('') || '<p class="muted">Пока нет сохранённых копий.</p>')
  );
  dialog.querySelectorAll('[data-copy-download]').forEach(b => b.onclick = () => download('financier-auto-' + copies[b.dataset.copyDownload].day + '.json', copies[b.dataset.copyDownload].data));
  dialog.querySelectorAll('[data-copy-restore]').forEach(b => b.onclick = () => {
    const data = validateState(JSON.parse(copies[b.dataset.copyRestore].data));
    dialog.close();
    confirmModal('Восстановить эту версию?', 'Текущая база сохранится в автокопиях.', () => { storageError = ''; persist(data); render(); });
  });
}

function restoreModal() {
  modal('Восстановить базу (из текста или файла)',
    `<p class="muted">Вставь скопированный текст из «Копия текстом» (из старой версии или Telegram) ИЛИ выбери файл <code>.json</code>:</p>` +
    `<div class="actions section">` +
      `<button type="button" class="soft small" id="pasteClipboardRestoreBtn">📋 Вставить из буфера обмена</button>` +
    `</div>` +
    `<label class="field section"><span>Текст резервной копии JSON</span><textarea id="restoreJsonText" rows="6" placeholder='Вставь сюда скопированный JSON: {"version":1, ...}'></textarea></label>` +
    `<label class="file-picker-card section" for="restoreFileInput"><span class="file-picker-icon">📂</span><span class="file-picker-text"><b id="restoreFileName">Выбрать файл .json с телефона</b><small>Нажми сюда, чтобы выбрать сохранённую копию из проводника</small></span><input type="file" id="restoreFileInput" name="file" accept="application/json,.json,.txt" hidden></label>` +
    `<div class="note section" id="restoreStatus">Ждёт вставки текста или выбора файла…</div>`,
    () => {
      if (!restoreModal.pending) {
        const rawText = dialog.querySelector('#restoreJsonText')?.value?.trim();
        if (rawText) {
          restoreModal.pending = validateState(JSON.parse(rawText));
        } else {
          throw Error('Вставь текст JSON или выбери файл резервной копии');
        }
      }
      const next = restoreModal.pending;
      validateState(next);
      storageError = '';
      persist(next);
      render();
setTimeout(() => { checkStartupPaymentAlerts(); syncNativeNotifications(false); }, 600);
    }
  );
  restoreModal.pending = null;
  const statusEl = dialog.querySelector('#restoreStatus');
  const errEl = dialog.querySelector('#formError');
  const textEl = dialog.querySelector('#restoreJsonText');

  const checkRawJson = (raw) => {
    errEl.textContent = '';
    if (!raw || !raw.trim()) {
      restoreModal.pending = null;
      statusEl.textContent = 'Ждёт вставки текста или выбора файла…';
      return;
    }
    try {
      const data = validateState(JSON.parse(raw.trim()));
      restoreModal.pending = data;
      statusEl.innerHTML = `✅ <b>Копия проверена:</b> счетов — <b>${data.accounts.length}</b>, операций — <b>${data.transactions.length}</b>, смен — <b>${(data.courierShifts || []).length}</b>. Нажми «Сохранить» внизу!`;
    } catch (err) {
      restoreModal.pending = null;
      errEl.textContent = 'Ошибка формата JSON: ' + err.message;
    }
  };

  textEl.addEventListener('input', () => checkRawJson(textEl.value));

  dialog.querySelector('#pasteClipboardRestoreBtn').onclick = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) {
        textEl.value = clip;
        checkRawJson(clip);
        toast('Текст вставлен из буфера');
      } else {
        toast('Буфер обмена пуст — зажми палец в поле и нажми «Вставить»');
        textEl.focus();
      }
    } catch {
      toast('Зажми палец в текстовом поле ниже и нажми «Вставить»');
      textEl.focus();
    }
  };

  dialog.querySelector('[name=file]').onchange = async e => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      const fnEl = dialog.querySelector('#restoreFileName');
      if (fnEl) fnEl.textContent = 'Выбран файл: ' + file.name;
      const text = await file.text();
      textEl.value = text;
      checkRawJson(text);
    } catch (err) {
      errEl.textContent = err.message;
    }
  };
}

function thumbSheetModal() {
  const activeShifts = state.courierShifts.filter(x => x.startedAt && !x.endedAt);
  const quickBtns = state.quickActions.map(q => `<button type="button" class="small soft" data-thumb-quick="${esc(q.id)}">${esc(q.name)}${q.amount ? ' · ' + rub(q.amount) : ''}</button>`).join('');
  modal('Быстрые действия',
    `<div class="thumb-sheet-grid">` +
      `<button type="button" class="thumb-card-btn thumb-tone-exp" data-thumb-tx="expense"><span class="thumb-card-ico">💸</span><span class="thumb-card-txt"><b>Расход</b><small>Покупка или сплит</small></span></button>` +
      `<button type="button" class="thumb-card-btn thumb-tone-inc" data-thumb-tx="income"><span class="thumb-card-ico">💰</span><span class="thumb-card-txt"><b>Доход</b><small>Поступление</small></span></button>` +
      `<button type="button" class="thumb-card-btn thumb-tone-debt" data-thumb-tx="lend"><span class="thumb-card-ico">🤝</span><span class="thumb-card-txt"><b>Дал / занял</b><small>Новому / знакомому</small></span></button>` +
      `<button type="button" class="thumb-card-btn thumb-tone-inc" data-thumb-tx="repay_in"><span class="thumb-card-ico">↩️</span><span class="thumb-card-txt"><b>Вернули долг</b><small>Оформить возврат</small></span></button>` +
      `<button type="button" class="thumb-card-btn thumb-tone-trf" data-thumb-tx="transfer"><span class="thumb-card-ico">⇄</span><span class="thumb-card-txt"><b>Перевод</b><small>Между счетами</small></span></button>` +
    `</div>` +
    `<div class="thumb-sheet-section"><div class="thumb-section-header">🛵 Доставка в 1 касание</div><div class="actions">` +
      (activeShifts.length ? activeShifts.map(x =>
        `<button type="button" class="primary small" data-thumb-courier="instantTrip1|${esc(x.id)}">⚡ +1 выдача</button>` +
        `<button type="button" class="soft small" data-thumb-courier="instantTrip2|${esc(x.id)}">+2 выдачи</button>` +
        `<button type="button" class="ghost small" data-thumb-courier="shiftExpense|${esc(x.id)}">− Расход смены</button>` +
        `<button type="button" class="ghost small" data-thumb-courier="tip|${esc(x.id)}">+ Чай</button>`
      ).join('') : `<button type="button" class="primary small" data-thumb-courier="startDeliveryShift|">▶ Начать смену доставки</button><button type="button" class="ghost small" data-thumb-nav="courier">Пульт доставки →</button>`) +
    `</div></div>` +
    (quickBtns ? `<div class="thumb-sheet-section"><div class="thumb-section-header">⚡ Быстрые шаблоны</div><div class="quick-buttons">${quickBtns}</div></div>` : ''),
    null,
    'bottom-sheet'
  );
  dialog.querySelectorAll('[data-thumb-tx]').forEach(b => b.onclick = () => {
    const tp = b.dataset.thumbTx;
    dialog.close();
    transactionModal(null, { type: tp, ...(tp === 'lend' ? { debtId: '__new__' } : {}) });
  });
  dialog.querySelectorAll('[data-thumb-courier]').forEach(b => b.onclick = () => {
    const [act, id] = b.dataset.thumbCourier.split('|');
    dialog.close();
    if (act === 'startDeliveryShift') view = 'courier';
    action(act, id);
  });
  dialog.querySelectorAll('[data-thumb-nav]').forEach(b => b.onclick = () => {
    dialog.close();
    view = b.dataset.thumbNav;
    render();
setTimeout(() => { checkStartupPaymentAlerts(); syncNativeNotifications(false); }, 600);
    window.scrollTo(0, 0);
  });
  dialog.querySelectorAll('[data-thumb-quick]').forEach(b => b.onclick = () => {
    const id = b.dataset.thumbQuick;
    dialog.close();
    useQuickModal(id);
  });
}


function notificationsModal() {
  const nf = state.notifications || { enabled: true, dayBefore: true, sameDay: true, overdueNextDay: true, hour: 10 };
  const dueList = duePaymentNotifications(state);
  modal('🔔 Уведомления о платежах',
    `<p class="muted">Выбери, когда приложение должно присылать уведомления по запланированным покупкам, регулярным платежам и рассрочкам:</p>` +
    `<label class="checks section"><input type="checkbox" name="enabled" ${nf.enabled !== false ? 'checked' : ''}><b>Включить уведомления о платежах</b></label>` +
    `<div class="notif-rules-box section">` +
      `<label class="checks"><input type="checkbox" name="dayBefore" ${nf.dayBefore !== false ? 'checked' : ''}>🔔 За 1 день до платежа (напомнить заранее)</label>` +
      `<label class="checks"><input type="checkbox" name="sameDay" ${nf.sameDay !== false ? 'checked' : ''}>🟠 В день платежа (если ещё не оплачено)</label>` +
      `<label class="checks"><input type="checkbox" name="overdueNextDay" ${nf.overdueNextDay !== false ? 'checked' : ''}>🔴 На следующий день и далее (если есть просрочка)</label>` +
    `</div>` +
    `<div class="formgrid section">` +
      field('Время утреннего уведомления', `<select name="hour">${[8, 9, 10, 11, 12, 15, 18, 20, 21].map(h => option(String(h), `${String(h).padStart(2, '0')}:00`, String(nf.hour ?? 10))).join('')}</select>`, true) +
    `</div>` +
    `<div class="actions section">` +
      `<button type="button" class="soft small" id="modalTestNotifBtn">🔔 Проверить уведомление сейчас</button>` +
    `</div>` +
    `<div class="note section">` +
      `<b>Статус на сегодня (${date(today())}):</b> ` +
      (dueList.length
        ? `<div class="notif-preview-list">${dueList.map(item => `<div class="notif-preview-item"><b>${esc(item.title)}</b><small>${esc(item.body)}</small></div>`).join('')}</div>`
        : `На сегодня, завтра и по просрочкам неоплаченных платежей нет — тестовая кнопка пришлёт проверочное уведомление.`) +
    `</div>`,
    f => {
      mutate(s => {
        s.notifications = {
          ...(s.notifications || {}),
          enabled: f.get('enabled') === 'on',
          dayBefore: f.get('dayBefore') === 'on',
          sameDay: f.get('sameDay') === 'on',
          overdueNextDay: f.get('overdueNextDay') === 'on',
          hour: Number(f.get('hour') || 10)
        };
      });
      syncNativeNotifications(true);
    }
  );
  dialog.querySelector('#modalTestNotifBtn').onclick = () => triggerTestNotification();
}

async function sendImmediateNotification(title, body, idNum = 9001) {
  let sentNative = false;
  try {
    const ln = window.Capacitor?.Plugins?.LocalNotifications;
    if (ln) {
      const perm = await ln.requestPermissions();
      if (perm?.display === 'granted') {
        await ln.schedule({
          notifications: [{
            id: idNum,
            title,
            body,
            schedule: { at: new Date(Date.now() + 800) }
          }]
        });
        sentNative = true;
      }
    }
  } catch {}

  if (!sentNative && 'Notification' in window) {
    try {
      let perm = Notification.permission;
      if (perm === 'default') perm = await Notification.requestPermission();
      if (perm === 'granted') {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg && reg.showNotification) {
          await reg.showNotification(title, { body, icon: './icon-192.png', badge: './icon-192.png', tag: 'financier-' + idNum });
          sentNative = true;
        } else {
          new Notification(title, { body, icon: './icon-192.png' });
          sentNative = true;
        }
      }
    } catch {}
  }
  return sentNative;
}

async function triggerTestNotification() {
  const dueList = duePaymentNotifications(state);
  const sample = dueList[0] || {
    title: '🔔 Проверка уведомлений Финансист 3.2',
    body: 'Уведомления работают! Приложение напомнит за 1 день до платежа, в день оплаты и при просрочке.'
  };
  const ok = await sendImmediateNotification(sample.title, sample.body, Math.floor(Date.now() % 100000));
  if (dueList.length > 1) {
    for (let i = 1; i < Math.min(dueList.length, 3); i++) {
      await sendImmediateNotification(dueList[i].title, dueList[i].body, Math.floor(Date.now() % 100000) + i);
    }
  }
  toast(ok ? 'Уведомление отправлено в шторку!' : ('🔔 ' + sample.title + ' — ' + sample.body));
}

async function syncNativeNotifications(requestPerm = false) {
  const nf = state.notifications || { enabled: true, dayBefore: true, sameDay: true, overdueNextDay: true, hour: 10 };
  try {
    const ln = window.Capacitor?.Plugins?.LocalNotifications;
    if (ln) {
      if (requestPerm) await ln.requestPermissions();
      const pendingList = await ln.getPending();
      if (pendingList?.notifications?.length) {
        await ln.cancel({ notifications: pendingList.notifications.map(n => ({ id: n.id })) });
      }
      if (!nf.enabled) return;
      const horizon = addDays(today(), 35);
      const upcoming = upcomingPayments(state, horizon);
      const toSchedule = [];
      let nextId = 1000;
      const hour = Number(nf.hour ?? 10);
      const nowMs = Date.now();

      for (const p of upcoming) {
        const makeDate = (dStr) => {
          const [y, m, d] = dStr.split('-').map(Number);
          return new Date(y, m - 1, d, hour, 0, 0);
        };
        if (nf.dayBefore) {
          const dt = makeDate(addDays(p.date, -1));
          if (dt.getTime() > nowMs) {
            toSchedule.push({
              id: nextId++,
              title: '🔔 Завтра платёж: ' + p.name,
              body: `Завтра нужно оплатить ${rub(p.amount)} (${p.name}).`,
              schedule: { at: dt }
            });
          }
        }
        if (nf.sameDay) {
          const dt = makeDate(p.date);
          if (dt.getTime() > nowMs) {
            toSchedule.push({
              id: nextId++,
              title: '🟠 Сегодня день платежа: ' + p.name,
              body: `Сегодня по графику оплата ${rub(p.amount)}. Не забудь отметить в Финансисте!`,
              schedule: { at: dt }
            });
          }
        }
        if (nf.overdueNextDay) {
          const dt = makeDate(addDays(p.date, 1));
          if (dt.getTime() > nowMs) {
            toSchedule.push({
              id: nextId++,
              title: '🔴 Просрочен платёж: ' + p.name,
              body: `Вчера был срок оплаты ${rub(p.amount)} (${p.name}). Проверь статус платежа!`,
              schedule: { at: dt }
            });
          }
        }
      }
      if (toSchedule.length) {
        await ln.schedule({ notifications: toSchedule.slice(0, 60) });
      }
    }
  } catch {}
}

function checkStartupPaymentAlerts() {
  const nf = state.notifications;
  if (!nf || nf.enabled === false) return;
  const curDay = today();
  if (nf.lastNotifiedDay === curDay) return;
  const dueList = duePaymentNotifications(state, curDay);
  if (!dueList.length) return;
  state.notifications.lastNotifiedDay = curDay;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  sendImmediateNotification(dueList[0].title, dueList[0].body, 8801);
}

function demoState() {
  const s = initialState(), day = today();
  s.accounts = [
    { id: 'a-card', name: 'Основная карта', kind: 'card', opening: 8600000 },
    { id: 'a-cash', name: 'Наличные', kind: 'cash', opening: 750000 },
    { id: 'a-save', name: 'Подушка безопасности', kind: 'savings', opening: 4200000 }
  ];
  const daysAgo = n => addDays(day, -n);
  const tx = (id, n, amount, categoryId, importance, note) => ({
    id, type: 'expense', date: daysAgo(n), accountId: 'a-card', amount, categoryId, importance, note, createdAt: Date.now() - n * 100000, items: []
  });
  s.transactions = [
    tx('t1', 3, 385000, 'food', 'essential', 'Закупка продуктов'),
    tx('t2', 2, 145000, 'joy', 'wanted', 'Кофе и бургер с друзьями'),
    tx('t3', 1, 48000, 'transport', 'needed', 'Проезд и заправка'),
    tx('t4', 0, 269000, 'home', 'needed', 'Бытовая химия для дома')
  ];
  s.goals = [{ id: 'g1', name: 'Подушка без кредитов', accountId: 'a-save', target: 12000000, due: '' }];
  s.debts = [{ id: 'd1', name: 'Алексей', direction: 'owed', opening: 500000, due: '', note: 'Вернёт в конце недели', schedule: [], schedulePaidBase: 0 }];
  s.budget = { income: 11000000, savings: 1500000, nextIncome: day.slice(0, 7) + '-25', incomeMode: 'courier', caps: { food: 2200000, joy: 1000000, transport: 600000, home: 1200000 } };
  s.plans = [{ id: 'pl1', name: 'Аренда жилья', amount: 2800000, date: day, categoryId: 'home', paidTransactionId: null, status: 'pending' }];
  return validateState(s);
}

// === ROUTER & RENDER ===

const viewTitles = {
  home: 'Обзор', transactions: 'Операции', courier: 'Доставка', accounts: 'Счета и долги', more: 'Ещё',
  budget: 'Бюджет и лимиты', reports: 'Отчёты и разбор', settings: 'Настройки', categories: 'Категории',
  quick: 'Быстрые операции', recurring: 'Регулярные платежи', earnings: 'Календарь денег',
  purchases: 'Платежи и регулярные', forecast: 'Прогноз на 30 дней', monthly: 'Итог месяца'
};

function render() {
  applyTheme();
  const viewFn = {
    home: homeView, transactions: transactionsView, courier: courierView, accounts: accountsView,
    more: moreView, budget: budgetView, reports: reportsView, settings: settingsView,
    categories: categoriesView, quick: quickView, recurring: recurringView, earnings: calendarView,
    purchases: purchasesView, forecast: forecastView, monthly: monthlyView
  }[view] || homeView;

  const content = viewFn();
  const nav = Object.entries(views).map(([id, label]) => {
    const isActive = id === view || (id === 'more' && subViews.includes(view));
    return `<button type="button" data-view="${id}" class="${isActive ? 'active' : ''}"><span class="nav-pill">${icon(id)}</span><span class="nav-label">${label}</span></button>`;
  }).join('');
  const activeShifts = state.courierShifts.filter(x => x.startedAt && !x.endedAt);

  const dueAlertsCount = duePaymentNotifications(state).length;
  const topRightHtml = view === 'home' && dueAlertsCount
    ? `<div class="actions"><button type="button" class="soft small" data-action="navigate" data-id="purchases">🔔 Платежи (${dueAlertsCount})</button></div>`
    : '';

  app.innerHTML = `<div class="shell">` +
    `<aside class="sidebar"><div class="brand"><span class="brandmark">₽</span>Финансист</div><nav class="nav">${nav}</nav><div class="sidebar-note"><span class="statusdot"></span>Локальная база + IndexedDB<br><span class="version">Финансист 3.2 · Android 2026</span></div></aside>` +
    `<main class="main">` +
      `<div class="mobile-brand"><span class="actions"><span class="brandmark">₽</span>Финансист</span><span class="pill ${activeShifts.length ? 'essential' : ''}">${activeShifts.length ? '🟢 В смене' : '3.2'}</span></div>` +
      `<div class="topline"><div><h1>${viewTitles[view] || 'Обзор'}</h1></div>${topRightHtml}</div>` +
      `${storageError ? `<div class="note negative">${esc(storageError)}</div>` : ''}` +
      `${content}` +
      `<div class="footerhint">${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} · RUB · автономный режим</div>` +
    `</main>` +
    `<div class="thumb-dock" role="region" aria-label="Быстрые операции под палец"><button type="button" class="thumb-fab-single primary" data-action="thumbSheet" aria-label="Быстрые действия"><span class="thumb-fab-icon">⚡</span><span>Быстро</span></button></div>` +
    `<nav class="bottomnav">${nav}</nav>` +
  `</div>`;

  bindEvents();
  enhanceMathInputs(app);
}

function bindEvents() {
  app.querySelectorAll('[data-view]').forEach(b => b.onclick = () => {
    view = b.dataset.view;
    render();
setTimeout(() => { checkStartupPaymentAlerts(); syncNativeNotifications(false); }, 600);
    window.scrollTo(0, 0);
  });
  app.querySelectorAll('[data-action]').forEach(b => b.onclick = () => {
    try { action(b.dataset.action, b.dataset.id); } catch (e) { toast(e.message); }
  });

  const liveSearch = app.querySelector('#liveTxSearch');
  if (liveSearch) {
    liveSearch.oninput = e => {
      filters.search = e.target.value;
      const pos = e.target.selectionStart;
      render();
setTimeout(() => { checkStartupPaymentAlerts(); syncNativeNotifications(false); }, 600);
      const nextInput = app.querySelector('#liveTxSearch');
      if (nextInput) { nextInput.focus(); nextInput.setSelectionRange(pos, pos); }
    };
  }
  app.querySelectorAll('[data-tx-group]').forEach(b => b.onclick = () => {
    filters.typeGroup = b.dataset.txGroup;
    render();
setTimeout(() => { checkStartupPaymentAlerts(); syncNativeNotifications(false); }, 600);
  });

  app.querySelectorAll('[data-start-tax-preset]').forEach(b => b.onclick = () => {
    const inp = app.querySelector('#startShiftTaxInput');
    if (inp) inp.value = b.dataset.startTaxPreset;
    app.querySelectorAll('[data-start-tax-preset]').forEach(btnEl => btnEl.className = 'small ' + (btnEl === b ? 'primary' : 'ghost'));
  });

  const syncDrumDom = (shiftId, updateInput = true) => {
    const rubValEl = app.querySelector(`[data-drum-rub-val="${shiftId}"]`);
    const kopValEl = app.querySelector(`[data-drum-kop-val="${shiftId}"]`);
    const rubSlider = app.querySelector(`[data-drum-rub-slider="${shiftId}"]`);
    const kopSlider = app.querySelector(`[data-drum-kop-slider="${shiftId}"]`);
    if (rubValEl) {
      rubValEl.textContent = String(drumRubles);
      const wheel = rubValEl.parentElement;
      const neighbors = wheel.querySelectorAll('.drum-step-Neighbor');
      if (neighbors[0]) neighbors[0].textContent = String(Math.max(0, drumRubles - 1));
      if (neighbors[1]) neighbors[1].textContent = String(drumRubles + 1);
    }
    if (kopValEl) {
      kopValEl.textContent = String(drumKopeks).padStart(2, '0');
      const wheel = kopValEl.parentElement;
      const neighbors = wheel.querySelectorAll('.drum-step-Neighbor');
      if (neighbors[0]) neighbors[0].textContent = String((drumKopeks + 99) % 100).padStart(2, '0');
      if (neighbors[1]) neighbors[1].textContent = String((drumKopeks + 1) % 100).padStart(2, '0');
    }
    if (rubSlider) {
      if (drumRubles < Number(rubSlider.min)) rubSlider.min = String(Math.max(0, drumRubles - 30));
      if (drumRubles > Number(rubSlider.max)) rubSlider.max = String(drumRubles + 60);
      rubSlider.value = String(drumRubles);
    }
    if (kopSlider) kopSlider.value = String(drumKopeks);
    if (updateInput) {
      const inp = app.querySelector(`[data-quick-amount="${shiftId}"]`);
      if (inp) inp.value = formatDrumString(drumRubles, drumKopeks);
    }
  };

  app.querySelectorAll('[data-quick-order]').forEach(b => b.onclick = () => {
    const val = b.dataset.quickOrder;
    const shiftId = b.dataset.shift;
    const customInp = app.querySelector(`#customQuickOrders_${shiftId}`);
    if (val === '4+' || val === '3+') {
      quickPlusMode = true;
      quickOrders = Number(customInp?.value) || 4;
      if (customInp) { customInp.hidden = false; customInp.focus(); customInp.select(); }
    } else {
      quickPlusMode = false;
      quickOrders = Number(val);
      if (customInp) customInp.hidden = true;
    }
    resetDrumToAverage(quickOrders);
    render();
  });

  app.querySelectorAll('.custom-orders-inp').forEach(inp => {
    inp.oninput = () => {
      const v = Math.max(1, Number(inp.value) || 4);
      quickOrders = v;
      resetDrumToAverage(v);
      const shiftId = inp.id.replace('customQuickOrders_', '');
      syncDrumDom(shiftId, true);
    };
  });

  app.querySelectorAll('[data-drum-step]').forEach(b => b.onclick = () => {
    const [kind, deltaStr] = b.dataset.drumStep.split('|');
    const delta = Number(deltaStr);
    const shiftId = b.dataset.shift;
    drumTouched = true;
    if (kind === 'rub') {
      drumRubles = Math.max(0, drumRubles + delta);
    } else {
      let nextK = drumKopeks + delta;
      while (nextK < 0) {
        if (drumRubles > 0) { drumRubles--; nextK += 100; } else { nextK = 0; break; }
      }
      while (nextK >= 100) {
        drumRubles++; nextK -= 100;
      }
      drumKopeks = nextK;
    }
    syncDrumDom(shiftId, true);
  });

  app.querySelectorAll('[data-drum-rub-slider]').forEach(sl => {
    sl.oninput = () => {
      drumTouched = true;
      drumRubles = Math.max(0, Number(sl.value) || 0);
      syncDrumDom(sl.dataset.drumRubSlider, true);
    };
  });

  app.querySelectorAll('[data-drum-kop-slider]').forEach(sl => {
    sl.oninput = () => {
      drumTouched = true;
      drumKopeks = Math.max(0, Math.min(99, Number(sl.value) || 0));
      syncDrumDom(sl.dataset.drumKopSlider, true);
    };
  });

  app.querySelectorAll('.alarm-drum-wheel').forEach(wheel => {
    let startY = null;
    const kind = wheel.dataset.wheelKind;
    const shiftId = wheel.dataset.shift;
    const stepBy = (d) => {
      drumTouched = true;
      if (kind === 'rub') drumRubles = Math.max(0, drumRubles + d);
      else drumKopeks = (drumKopeks + d + 100) % 100;
      syncDrumDom(shiftId, true);
    };
    wheel.addEventListener('wheel', e => {
      e.preventDefault();
      stepBy(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    wheel.addEventListener('touchstart', e => {
      if (e.touches.length === 1) startY = e.touches[0].clientY;
    }, { passive: true });
    wheel.addEventListener('touchmove', e => {
      if (startY === null || e.touches.length !== 1) return;
      const dy = startY - e.touches[0].clientY;
      if (Math.abs(dy) >= 14) {
        const steps = Math.trunc(dy / 14);
        stepBy(steps);
        startY = e.touches[0].clientY;
      }
    }, { passive: true });
    wheel.addEventListener('touchend', () => { startY = null; });
  });

  app.querySelectorAll('[data-quick-amount]').forEach(inp => {
    inp.addEventListener('input', () => {
      drumTouched = true;
      const clean = String(inp.value || '').replace(',', '.');
      const [rPart, kPart] = clean.split('.');
      if (/^\d+$/.test(rPart || '')) drumRubles = Number(rPart);
      if (kPart !== undefined && /^\d{1,2}$/.test(kPart)) drumKopeks = Number(kPart.padEnd(2, '0'));
      else if (kPart === undefined) drumKopeks = 0;
      syncDrumDom(inp.dataset.quickAmount, false);
    });
  });

  app.querySelectorAll('[data-quick-amount]').forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); quickAddDelivery(inp.dataset.quickAmount); }
    });
  });

  const bForm = app.querySelector('#budgetForm');
  if (bForm) {
    const m = monthBudget(state);
    bForm.onsubmit = e => {
      e.preventDefault();
      try {
        const data = new FormData(bForm);
        mutate(s => {
          const caps = {};
          for (const c of s.categories.filter(x => x.kind === 'expense')) {
            const raw = data.get('cap_' + c.id);
            if (!raw) continue;
            const amount = cents(raw);
            if (s.budget.caps[c.id] !== undefined || !m.complete || c.parentId || amount !== (m.suggested[c.id] ?? 0)) {
              caps[c.id] = amount;
            }
          }
          s.budget = { ...s.budget, income: cents(data.get('income')), savings: cents(data.get('savings')), nextIncome: data.get('nextIncome'), incomeMode: data.get('incomeMode'), caps };
        });
        toast('Бюджет сохранён');
      } catch (err) {
        app.querySelector('#budgetError').textContent = err.message;
      }
    };
  }
}

function action(name, id) {
  switch (name) {
    case 'navigate': view = id; render(); window.scrollTo(0, 0); return;
    case 'thumbSheet': return thumbSheetModal();
    case 'lendQuick': return transactionModal(null, { type: 'lend', debtId: '__new__' });
    case 'addTx': return transactionModal();
    case 'editTx': return transactionModal(state.transactions.find(t => t.id === id));
    case 'repeatTx': {
      const orig = state.transactions.find(t => t.id === id);
      if (orig) transactionModal(null, { ...structuredClone(orig), id: undefined, date: today(), createdAt: undefined });
      return;
    }
    case 'openFilters': return filterModal();
    case 'resetFilters': filters = { from: '', to: '', category: '', importance: '', search: '', typeGroup: '' }; render(); return;
    case 'addAccount':
    case 'editAccount': return accountModal(state.accounts.find(a => a.id === id));
    case 'addCategory': return categoryModal(null, id || null);
    case 'editCategory': return categoryModal(state.categories.find(c => c.id === id));
    case 'categoryKind': catKind = id; openRootCat = null; render(); return;
    case 'openCategory': openRootCat = id; render(); return;
    case 'categoryBack': openRootCat = null; render(); return;
    case 'addDebt':
    case 'editDebt': return debtModal(state.debts.find(d => d.id === id), false);
    case 'addInstallment':
    case 'editInstallment': return debtModal(state.debts.find(d => d.id === id), true);
    case 'debtHistory': return debtHistoryModal(id);
    case 'lendPerson': return transactionModal(null, { type: 'lend', debtId: id });
    case 'borrowPerson': return transactionModal(null, { type: 'borrow', debtId: id });
    case 'repayDebt':
    case 'increaseDebt': {
      const d = state.debts.find(x => x.id === id);
      if (!d) return;
      const dir = personDirection(state, id);
      const rem = debtRemaining(state, id);
      transactionModal(null, {
        type: name === 'repayDebt' ? (dir === 'owe' ? 'repay_out' : 'repay_in') : (dir === 'owe' ? 'borrow' : 'lend'),
        debtId: id,
        amount: name === 'repayDebt' ? rem : 0
      });
      return;
    }
    case 'payInstallment': {
      const [debtId, paymentId] = id.split('|');
      const d = state.debts.find(x => x.id === debtId);
      const p = installmentStatus(state, d).find(x => x.id === paymentId);
      const first = installmentStatus(state, d).find(x => x.remaining > 0);
      if (!p || !p.remaining) throw Error('Платёж уже погашен');
      if (first.id !== p.id) throw Error('Сначала оплати более ранний платёж графика');
      transactionModal(null, { type: 'repay_out', debtId, amount: p.remaining, note: 'Рассрочка: ' + d.name });
      return;
    }
    case 'addGoal':
    case 'editGoal': return goalModal(state.goals.find(g => g.id === id));
    case 'goalTransfer': return transactionModal(null, { type: 'transfer', toAccountId: state.goals.find(g => g.id === id)?.accountId });
    case 'setPurchasesTab': purchasesTab = id; render(); return;
    case 'notificationsModal': return notificationsModal();
    case 'testNotification': return triggerTestNotification();
    case 'newPurchase': return planModal(null, id || null);
    case 'addPlan':
    case 'editPlan': return planModal(state.plans.find(p => p.id === id));
    case 'buyPurchase':
    case 'payPlan': {
      const p = state.plans.find(x => x.id === id);
      if (!p || !pending(p)) throw Error('План уже закрыт');
      transactionModal(null, { type: 'expense', amount: p.amount, note: p.name, categoryId: p.categoryId, importance: p.importance || 'essential', accountId: p.accountId || state.accounts[0]?.id, items: p.items || [], planId: p.id });
      return;
    }
    case 'movePurchase': {
      const p = state.plans.find(x => x.id === id);
      if (!p || !pending(p)) throw Error('План уже закрыт');
      modal('Перенести · ' + esc(p.name), field('Новая дата', input('date', p.date, 'date', 'required')), f => mutate(s => { s.plans.find(x => x.id === id).date = f.get('date'); }));
      return;
    }
    case 'cancelPurchase': {
      mutate(s => {
        const p = s.plans.find(x => x.id === id);
        if (!p || !pending(p)) throw Error('План уже закрыт');
        p.status = 'cancelled';
        if (p.recurringId) {
          const r = s.recurringPayments.find(x => x.id === p.recurringId);
          const origDate = p.id.slice(p.recurringId.length + 1);
          if (r && !r.skippedDates.includes(origDate)) r.skippedDates.push(origDate);
        }
      });
      return;
    }
    case 'newQuick': return quickModal();
    case 'editQuick': return quickModal(state.quickActions.find(q => q.id === id));
    case 'useQuick': return useQuickModal(id);
    case 'newRecurring': return recurringModal();
    case 'editRecurring': return recurringModal(state.recurringPayments.find(r => r.id === id));
    case 'startDeliveryShift':
    case 'startShift': return startDeliveryShift();
    case 'editShiftTax': return editShiftTaxModal(id);
    case 'toggleLunch': return toggleLunchTimer(id);
    case 'fuelSettings': return fuelSettingsModal();
    case 'shiftOdoModal': return shiftOdoModal(id);
    case 'shiftExpense': return shiftExpenseModal(id);
    case 'quickAddDelivery': return quickAddDelivery(id, false);
    case 'quickAddNoAmount': return quickAddDelivery(id, true);
    case 'instantTrip1': quickPlusMode = false; quickOrders = 1; return quickAddDelivery(id, true);
    case 'instantTrip2': quickPlusMode = false; quickOrders = 2; return quickAddDelivery(id, true);
    case 'quickTip': { const [sId, rubVal] = id.split('|'); return quickTip(sId, rubVal); }
    case 'delivery': return deliveryModal(id);
    case 'editDelivery': { const [sId, eId] = id.split('|'); return deliveryModal(sId, eId); }
    case 'deleteDelivery': {
      const [sId, eId] = id.split('|');
      mutate(st => { const sh = st.courierShifts.find(x => x.id === sId); if (sh) { sh.entries = sh.entries.filter(e => e.id !== eId); syncShift(sh); } });
      toast('Поездка удалена');
      return;
    }
    case 'tip': return tipModal(id);
    case 'finishShift': return shiftDetailsModal(id, true);
    case 'shiftDetails': return shiftDetailsModal(id, false);
    case 'addShift':
    case 'editShift': return shiftManualModal(state.courierShifts.find(x => x.id === id));
    case 'autoStatement':
    case 'addStatement': return autoStatementModal();
    case 'editStatement': return autoStatementModal(state.courierStatements.find(r => r.id === id));
    case 'courierPayout':
    case 'statementPayout': return payoutModal(name === 'statementPayout' ? id : null);
    case 'taxSettings': return taxSettingsModal();
    case 'payTax': {
      let cat = state.categories.find(c => c.kind === 'expense' && c.name === 'Налоги');
      if (!cat) {
        const newId = uid();
        mutate(s => s.categories.push({ id: newId, name: 'Налоги', kind: 'expense', color: '#f59e0b' }));
        cat = state.categories.find(c => c.id === newId);
      }
      transactionModal(null, { type: 'expense', categoryId: cat.id, deductFromCategoryId: state.incomeDefaults?.x5, taxForCategoryId: state.incomeDefaults?.x5, amount: taxReserve(state), importance: 'essential', note: 'Оплата налога' });
      return;
    }
    case 'incomeMode': budgetIncomeMode = id; render(); return;
    case 'applyPeriod': {
      const from = app.querySelector('[name=reportFrom]').value, to = app.querySelector('[name=reportTo]').value;
      if (!from || !to || from > to || to > today()) throw Error('Выбери корректный период до сегодняшнего дня');
      period = { from, to };
      render();
setTimeout(() => { checkStartupPaymentAlerts(); syncNativeNotifications(false); }, 600);
      return;
    }
    case 'copyTextReport': return copyReadableReport();
    case 'moneySpan': calSpan = id; render(); return;
    case 'moneyMode': calMode = id; render(); return;
    case 'moneyToday': calAnchor = today(); render(); return;
    case 'moneyMove': {
      if (calSpan === 'week') calAnchor = addDays(calAnchor, Number(id) * 7);
      else {
        const [y, m] = calAnchor.split('-').map(Number);
        calAnchor = new Date(Date.UTC(y, m - 1 + Number(id), 1, 12)).toISOString().slice(0, 10);
      }
      render();
setTimeout(() => { checkStartupPaymentAlerts(); syncNativeNotifications(false); }, 600);
      return;
    }
    case 'moneyDay': return dayModal(id);
    case 'monthMove': {
      const [y, m] = monthCursor.split('-').map(Number);
      const next = new Date(Date.UTC(y, m - 1 + Number(id), 1, 12)).toISOString().slice(0, 7);
      if (next <= today().slice(0, 7)) { monthCursor = next; render(); }
      return;
    }
    case 'setTheme': mutate(s => s.appearance.theme = id); return;
    case 'backup': return download('financier-backup-' + today() + '.json', state);
    case 'shareBackup': return shareBackup();
    case 'backupText': return backupTextModal();
    case 'restore': return restoreModal();
    case 'autoCopies': return copiesModal();
    case 'restoreIDB': {
      openIDB().then(db => {
        const r = db.transaction('kv').objectStore('kv').get('latest');
        r.onsuccess = () => {
          if (!r.result) { toast('В IndexedDB пока нет копии'); return; }
          const data = validateState(JSON.parse(r.result));
          confirmModal('Восстановить из IndexedDB?', 'Текущие данные заменятся сохранённой копией из IndexedDB.', () => { storageError = ''; persist(data); render(); });
        };
      }).catch(() => toast('IndexedDB недоступен'));
      return;
    }
    case 'refreshApp': {
      navigator.serviceWorker?.getRegistration().then(r => r?.update()).then(() => location.reload()).catch(() => location.reload());
      return;
    }
    case 'demo': return confirmModal('Загрузить демо-данные?', 'Текущие записи будут заменены примером (копия сохранится в автокопиях).', () => { storageError = ''; persist(demoState()); render(); });
    case 'reset': return confirmModal('Очистить все данные?', 'Все счета и операции будут удалены. Сначала сохрани копию.', () => { storageError = ''; persist(initialState()); render(); });
  }
}

// Inline Math Evaluation & Hierarchical Category Selects
function tryEvalInput(el) {
  if (!el || !el.value) return;
  const raw = String(el.value).trim();
  if (/[+\-*/×÷()]/.test(raw.slice(1))) {
    try {
      const val = calculate(raw);
      el.value = String(Math.round(val * 100) / 100);
    } catch {}
  }
}

function sanitizeNumericMathValue(raw) {
  return String(raw ?? '').replace(/[^0-9.,+\-*/×÷()]/g, '');
}

function enhanceMathInputs(root = document) {
  for (const numEl of root.querySelectorAll('input[type="number"]')) {
    if (!numEl.getAttribute('inputmode')) {
      numEl.setAttribute('inputmode', numEl.step && numEl.step !== '1' ? 'decimal' : 'numeric');
    }
  }

  for (const el of root.querySelectorAll('input[inputmode="decimal"], input[inputmode="numeric"]')) {
    if (el.dataset.mathReady || el.readOnly || el.disabled) continue;
    el.dataset.mathReady = 'true';
    // Keep inputmode="decimal" (or "numeric") so Android ALWAYS shows the big Numpad without letters!
    if (el.getAttribute('inputmode') !== 'numeric') {
      el.setAttribute('inputmode', 'decimal');
    }
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('autocorrect', 'off');
    el.setAttribute('autocapitalize', 'off');
    el.setAttribute('spellcheck', 'false');
    el.classList.add('math-input');

    const bar = document.createElement('div');
    bar.className = 'inline-math-bar';
    bar.hidden = true;
    bar.innerHTML =
      ['+', '−', '×', '÷', '='].map(op => `<button type="button" tabindex="-1" data-math-op="${op}">${op}</button>`).join('') +
      `<span class="math-live-preview" data-math-preview></span>`;

    if (!el.dataset.noMath && !el.dataset.noMathBar && el.parentElement && !el.parentElement.querySelector('.inline-math-bar')) {
      el.after(bar);
    }

    const updatePreview = () => {
      const cleaned = sanitizeNumericMathValue(el.value);
      if (cleaned !== el.value) {
        const pos = el.selectionStart || cleaned.length;
        el.value = cleaned;
        try { el.setSelectionRange(pos, pos); } catch {}
      }
      const prevEl = bar.querySelector('[data-math-preview]');
      if (!prevEl) return;
      const trimmed = cleaned.trim();
      if (/[+\-*/×÷]/.test(trimmed.slice(1))) {
        try {
          const val = calculate(trimmed);
          prevEl.textContent = '= ' + (Math.round(val * 100) / 100);
        } catch {
          prevEl.textContent = '';
        }
      } else {
        prevEl.textContent = '';
      }
    };

    el.addEventListener('input', updatePreview);

    bar.addEventListener('pointerdown', e => {
      const btnEl = e.target.closest('[data-math-op]');
      if (!btnEl) return;
      e.preventDefault();
      const op = btnEl.dataset.mathOp;
      if (op === '=') {
        tryEvalInput(el);
        updatePreview();
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        const ch = op === '−' ? '-' : op;
        const start = el.selectionStart ?? (el.value || '').length;
        const end = el.selectionEnd ?? start;
        const cur = el.value || '';
        el.value = cur.slice(0, start) + ch + cur.slice(end);
        try { el.setSelectionRange(start + ch.length, start + ch.length); } catch {}
        updatePreview();
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    el.addEventListener('focus', () => {
      bar.hidden = false;
      updatePreview();
    });

    el.addEventListener('blur', () => {
      setTimeout(() => { bar.hidden = true; }, 160);
      tryEvalInput(el);
      updatePreview();
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
}

document.addEventListener('submit', e => {
  if (e.target instanceof HTMLFormElement) {
    e.target.querySelectorAll('input.math-input').forEach(tryEvalInput);
  }
}, true);

const observer = new MutationObserver(() => enhanceMathInputs(dialog));
observer.observe(dialog, { childList: true, subtree: true });

window.addEventListener('popstate', () => {
  if (dialog.open) { dialog.close(); return; }
  if (view !== 'home') { view = 'home'; render(); window.scrollTo(0, 0); }
});

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; });
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});

render();
setTimeout(() => { checkStartupPaymentAlerts(); syncNativeNotifications(false); }, 600);


// Live 1-second ticker for active shift elapsed time and 60-min lunch countdown
setInterval(() => {
  const activeShifts = state.courierShifts.filter(x => x.startedAt && !x.endedAt);
  if (!activeShifts.length) return;
  const now = Date.now();
  for (const x of activeShifts) {
    document.querySelectorAll(`[data-live-shift-elapsed="${x.id}"]`).forEach(el => {
      el.textContent = '⏱ ' + formatShiftElapsed(x, now);
    });
    const lunch = shiftLunchState(x, now);
    document.querySelectorAll(`[data-live-lunch-timer="${x.id}"]`).forEach(el => {
      el.textContent = (el.classList.contains('lunch-clock') ? '' : '🍱 ') + formatLunchClock(lunch.remainingMs);
    });
    if (lunch.active) {
      if (lunch.remainingMs <= 300000 && lunch.remainingMs > 290000 && !x.lunchWarned5m) {
        x.lunchWarned5m = true;
        sendImmediateNotification('🍱 До конца обеда 5 минут', 'Осталось 5 минут обеденного перерыва на смене.', 7705);
        toast('🍱 До конца обеда осталось 5 минут!');
      }
      if (lunch.remainingMs <= 0 && !x.lunchWarnedEnd) {
        x.lunchWarnedEnd = true;
        x.lunchRemainingMs = 0;
        x.lunchStartedAt = null;
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
        sendImmediateNotification('🔔 Обед закончился!', 'Часовой таймер обеда истёк — пора выходить на линию.', 7706);
        toast('🔔 Таймер обеда (60 мин) закончился!');
        render();
      }
    }
  }
}, 1000);
