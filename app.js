import {createTimeline} from './timeline.js';
import {planFromExpense} from './timeline-model.js';
import {IMPORTANCE,TYPES,uid,today,cents,rub,decimal,initialState,balance,debtRemaining,expenses,summary,available,validateTransaction,validateState,makeAIRequest,validateAIResponse,categoryPath,categoryMatches,addDays} from './finance.js';
import {createFeatures} from './features.js';
import {createUpgrade} from './upgrade.js';
import {installComfort} from './comfort.js';
import {itemCosts,setAccountBalance} from './comfort-model.js';
import {createDaily} from './daily.js';
import {serviceCategory,shiftTotals} from './finance-v2.js';
const KEY='financier.personal.v1';
let state=initialState(),storageError='';try{const saved=localStorage.getItem(KEY);if(saved)state=validateState(JSON.parse(saved));}catch(e){storageError='Не удалось прочитать данные. Экспортируйте исходный файл в настройках перед восстановлением: '+e.message;}
let view='home',filters={from:'',to:'',category:'',importance:'',search:'',typeGroup:''},period={from:today().slice(0,7)+'-01',to:today()},aiRequest=null,activeReport=null,installEvent=null;
const app=document.querySelector('#app'),dialog=document.querySelector('#dialog');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=(name)=>{const paths={home:'<path d="M3 10 12 3l9 7v11H3z"/><path d="M9 21v-8h6v8"/>',transactions:'<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>',accounts:'<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 9h18m-6 6h3"/>',budget:'<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 11h16m-12 4h2m4 0h2m-8 3h2"/>',courier:'<path d="M3 16h14l4-7h-9L9 4H5m1 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',reports:'<path d="M4 20V10m8 10V4m8 16v-7M2 22h20"/>',settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>'};return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.settings}</svg>`;};
const views={home:'Обзор',transactions:'Операции',courier:'Доставка',accounts:'Счета',more:'Ещё'};
const option=(id,label,selected)=>`<option value="${esc(id)}" ${id===selected?'selected':''}>${esc(label)}</option>`;
const accountOpts=(selected,kind)=>state.accounts.filter(a=>!kind||a.kind===kind).map(a=>option(a.id,a.name,selected)).join('');
const categoryOpts=(selected,kind='expense')=>state.categories.filter(c=>!c.parentId&&(!kind||c.kind===kind)&&(!c.hidden||c.id===selected||state.categories.find(x=>x.id===selected)?.parentId===c.id)).map(c=>option(c.id,c.name,selected)+state.categories.filter(x=>x.parentId===c.id&&(!x.hidden||x.id===selected)).map(x=>option(x.id,'↳ '+x.name,selected)).join('')).join('');
const importanceOpts=selected=>Object.entries(IMPORTANCE).map(([id,n])=>option(id,n,selected)).join('');
const field=(label,control,full=false)=>`<label class="field ${full?'full':''}"><span>${label}</span>${control}</label>`;
const input=(name,value='',type='text',extra='')=>`<input name="${name}" type="${type}" value="${esc(value)}" ${extra}>`;
const category=id=>categoryPath(state,id);
const account=id=>state.accounts.find(a=>a.id===id)?.name||'Счёт';
const date=v=>v?new Date(v+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'}):'Без срока';
function toast(msg){const el=document.querySelector('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),3500);}
function autoBackup(){try{const raw=localStorage.getItem(KEY);if(!raw)return;let copies=JSON.parse(localStorage.getItem(KEY+'.copies')||'[]');const stamp=new Date().toISOString(),day=today();if(!copies.some(c=>c.day===day&&c.daily))copies.unshift({stamp,day,daily:true,data:raw});copies=copies.filter(c=>c.daily).slice(0,14).concat([{stamp,day,daily:false,data:raw},...copies.filter(c=>!c.daily).slice(0,4)]);localStorage.setItem(KEY+'.copies',JSON.stringify(copies));}catch{}}
function copiesModal(){let copies;try{copies=JSON.parse(localStorage.getItem(KEY+'.copies')||'[]');}catch{copies=[];}modal('Автоматические копии', '<p class="muted">До 14 дневных и 5 последних версий в этом браузере. Очистка данных сайта удаляет и эти копии; для переноса на телефон скачай JSON.</p>'+(copies.map((c,i)=>'<div class="row"><span class="row-main">'+esc(new Date(c.stamp).toLocaleString('ru-RU'))+(c.daily?' · дневная':'')+'</span><button type="button" class="small ghost" data-copy-download="'+i+'">Скачать</button><button type="button" class="small soft" data-copy-restore="'+i+'">Восстановить</button></div>').join('')||'<p class="muted">Пока нет сохранённых копий.</p>'));dialog.querySelectorAll('[data-copy-download]').forEach(b=>b.onclick=()=>download('financier-auto-'+copies[b.dataset.copyDownload].day+'.json',copies[b.dataset.copyDownload].data));dialog.querySelectorAll('[data-copy-restore]').forEach(b=>b.onclick=()=>{const data=validateState(JSON.parse(copies[b.dataset.copyRestore].data));dialog.close();confirmModal('Восстановить эту версию?','Текущая версия будет сохранена в автоматических копиях.',()=>{storageError='';persist(data);render();});});}

// IndexedDB Mirror & Native APK / Share helpers
const IDB_NAME='financier.idb.v1';
function openIDB(){return new Promise((res,rej)=>{if(!('indexedDB' in window))return rej();const req=indexedDB.open(IDB_NAME,1);req.onupgradeneeded=()=>req.result.createObjectStore('kv');req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});}
async function mirrorToIDB(rawState){try{const db=await openIDB();const tx=db.transaction('kv','readwrite');tx.objectStore('kv').put(rawState,'latest');tx.objectStore('kv').put({stamp:new Date().toISOString(),data:rawState},'day_'+today());}catch{}}
async function shareBackup(){
 const name='financier-backup-'+today()+'.json';
 const text=JSON.stringify(state,null,2);
 try{
  const file=new File([new Blob([text],{type:'application/json'})],name,{type:'application/json'});
  if(navigator.canShare&&navigator.canShare({files:[file]})){
   await navigator.share({files:[file],title:'Резервная копия Финансист',text:'Копия базы Финансист от '+today()});
   toast('Копия отправлена');
   return;
  }
 }catch(e){if(e?.name==='AbortError')return;}
 download(name,state);
}
window.addEventListener('popstate',()=>{
 if(dialog.open){dialog.close();return;}
 if(view!=='home'){view='home';render();window.scrollTo(0,0);}
});

function persist(next=state){if(storageError)throw Error('Сначала сохраните исходные данные и восстановите копию или сбросьте хранилище в настройках');autoBackup();const raw=JSON.stringify(next);try{localStorage.setItem(KEY,raw);}catch(e){if(e.name!=='QuotaExceededError')throw e;localStorage.removeItem(KEY+'.copies');localStorage.setItem(KEY,raw);toast('Память браузера заполнена: старые автоматические копии освобождены, текущие данные сохранены');}mirrorToIDB(raw);state=next;}
function mutate(fn){const next=structuredClone(state);fn(next);validateState(next);persist(next);render();}
function download(name,obj){const text=typeof obj==='string'?obj:JSON.stringify(obj,null,2);const blob=new Blob([text],{type:'application/json;charset=utf-8'});if(navigator.canShare&&window.Capacitor){try{const file=new File([blob],name,{type:'application/json'});if(navigator.canShare({files:[file]})){navigator.share({files:[file],title:name}).catch(()=>{});return;}}catch{}}const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
async function copy(s){try{await navigator.clipboard.writeText(s);toast('Скопировано');}catch{modal('Скопируйте текст',`<textarea rows="16" readonly>${esc(s)}</textarea>`);dialog.querySelector('textarea').select();}}
function modal(title,body,onSubmit,extraClass=''){dialog.className=extraClass;dialog.innerHTML=`<form id="modalForm"><div class="dialoghead"><h2>${title}</h2><button type="button" class="close" data-close aria-label="Закрыть">×</button></div>${body}<div class="error" id="formError" role="alert"></div>${onSubmit?'<div class="dialogfoot"><button type="button" class="ghost" data-close>Отмена</button><button class="primary" type="submit">Сохранить</button></div>':''}</form>`;dialog.showModal();dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>dialog.close());if(onSubmit)dialog.querySelector('form').onsubmit=e=>{e.preventDefault();if(e.target.dataset.busy)return;e.target.dataset.busy='true';const submit=e.target.querySelector('[type=submit]');submit.disabled=true;try{onSubmit(new FormData(e.target));dialog.close();toast('Сохранено');}catch(err){delete e.target.dataset.busy;submit.disabled=false;dialog.querySelector('#formError').textContent=err.message;}};}
function row(t){const down=['expense','lend','repay_out','transfer','adjustment_out'].includes(t.type);return `<div class="row"><div class="badge">${t.type==='transfer'?'↔':down?'↗':'↙'}</div><div class="row-main"><div class="row-title">${esc(t.note||TYPES[t.type])}</div><div class="row-meta">${date(t.date)} · ${esc(account(t.accountId))}${['expense','income'].includes(t.type)?' · '+esc(t.items?.length?`${t.items.length} позиций`:category(t.categoryId)):''}${t.type==='transfer'?' → '+esc(account(t.toAccountId)):''}${t.debtId?' · '+esc(state.debts.find(d=>d.id===t.debtId)?.name):''}</div></div><div class="amount ${t.type==='income'?'positive':''}">${t.type==='transfer'?'':down?'−':'+'}${rub(t.amount)}</div><div class="actions">${!t.type.startsWith('adjustment')?`<button type="button" class="small ghost" data-action="repeatTx" data-id="${t.id}" title="Повторить сегодня" aria-label="Повторить операцию">↻</button>`:''}<button type="button" class="small ghost" data-action="editTx" data-id="${t.id}" aria-label="Изменить операцию">✎</button></div></div>`;}
function bars(values,labels,color){const max=Math.max(...Object.values(values),1);return Object.entries(values).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]).map(([id,n])=>`<div class="barrow"><div class="bar-label"><span>${esc(labels(id))}</span><strong>${rub(n)}</strong></div><div class="track"><div class="fill" style="width:${n/max*100}%;background:${/^#[0-9a-f]{6}$/i.test(color?.(id)||'')?color(id):'#71917a'}"></div></div></div>`).join('')||'<div class="empty">Здесь появится распределение расходов</div>';}
function trend(days,from,to){const dates=[];for(let d=new Date(from+'T12:00:00');d<=new Date(to+'T12:00:00')&&dates.length<3660;d.setDate(d.getDate()+1))dates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);if(!dates.length)return '';const grouped=dates.length>31?Array.from({length:Math.min(24,dates.length)},(_,i)=>{const slice=dates.slice(Math.floor(i*dates.length/24),Math.floor((i+1)*dates.length/24));return {date:slice[0],n:slice.reduce((n,d)=>n+(days[d]||0),0)};}):dates.map(d=>({date:d,n:days[d]||0}));const max=Math.max(...grouped.map(d=>d.n),1);const w=560,h=130,step=(w-24)/grouped.length;return `<svg class="chart" role="img" aria-label="Расходы по времени" viewBox="0 0 560 160"><line x1="5" y1="130" x2="555" y2="130"/>${grouped.map((d,i)=>`<rect x="${12+i*step}" y="${h-d.n/max*110}" width="${Math.max(step*.65,2)}" height="${d.n/max*110}" rx="3" fill="#71917a"><title>${esc(d.date)}: ${rub(d.n)}</title></rect>`).join('')}<text x="10" y="151">${date(from)}</text><text x="550" y="151" text-anchor="end">${date(to)}</text></svg>`;}
function home(){const month=summary(state,today().slice(0,7)+'-01',today()),a=available(state);const recent=[...state.transactions].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt).slice(0,5);return `${state.accounts.length?'':`<div class="note"><strong>Начнём с твоих денег.</strong> Добавь карту или наличные и укажи текущий остаток. Затем можно записать первую покупку. <button class="small primary" data-action="addAccount">Добавить счёт</button></div>`}<div class="grid two"><div class="card hero"><div class="eyebrow">Можно потратить ${state.budget.nextIncome?'до '+date(state.budget.nextIncome):'сейчас'}</div><div class="hero-number ${a.free<0?'negative':''}">${rub(a.free)}</div><div class="explain">Деньги на картах и наличными − неоплаченные платежи − долги к сроку − резерв на накопления. Накопительные счета уже исключены.</div><div class="statsline"><div>Карты и наличные<strong>${rub(a.cash)}</strong></div><div>Платежи и долги<strong>${rub(a.duePlans+a.dueDebts)}</strong></div></div></div><div class="card"><div class="cardhead"><h2>Этот месяц</h2><span class="pill">${new Date().toLocaleDateString('ru-RU',{month:'long'})}</span></div><div class="grid two"><div><div class="label">Доходы</div><div class="metric positive">${rub(month.income)}</div></div><div><div class="label">Расходы</div><div class="metric">${rub(month.expense)}</div></div></div>${trend(month.days,today().slice(0,7)+'-01',today())}</div></div><div class="grid four section"><div class="card"><div class="label">Накопления</div><div class="metric">${rub(state.accounts.filter(a=>a.kind==='savings').reduce((n,a)=>n+balance(state,a.id),0))}</div><div class="muted">На отдельных счетах</div></div><div class="card"><div class="label">Я должен</div><div class="metric">${rub(state.debts.filter(d=>d.direction==='owe').reduce((n,d)=>n+debtRemaining(state,d.id),0))}</div><div class="muted">Остаток долгов</div></div><div class="card"><div class="label">Мне должны</div><div class="metric">${rub(state.debts.filter(d=>d.direction==='owed').reduce((n,d)=>n+debtRemaining(state,d.id),0))}</div><div class="muted">Не включено в доступные деньги</div></div><div class="card"><div class="label">«Не нужно» и «Хотелось»</div><div class="metric">${rub(month.importance.unnecessary+month.importance.wanted)}</div><div class="muted">Твоя оценка за месяц</div></div></div><div class="grid two section"><div class="card"><div class="cardhead"><h2>Последние операции</h2><button class="linkbutton" data-view="transactions">Все операции →</button></div>${recent.map(row).join('')||'<div class="empty"><strong>Пока чистый лист</strong>Запиши покупку или доход — здесь появится история.</div>'}</div><div class="card"><div class="cardhead"><h2>Куда уходят деньги</h2><span class="pill">За месяц</span></div>${bars(month.category,category,id=>state.categories.find(c=>c.id===id)?.color)}</div></div>`;}
function transactions(){
 const ts=state.transactions.filter(t=>
  (!filters.from||t.date>=filters.from)&&
  (!filters.to||t.date<=filters.to)&&
  (!filters.typeGroup||(filters.typeGroup==='debt'?['borrow','lend','repay_out','repay_in'].includes(t.type):t.type===filters.typeGroup))&&
  (!filters.search||[t.note,TYPES[t.type],state.debts.find(d=>d.id===t.debtId)?.name,...(t.items||[]).map(i=>i.name)].join(' ').toLowerCase().includes(filters.search.toLowerCase()))&&
  (!filters.category||(t.items?.length?t.items.some(i=>categoryMatches(state,i.categoryId,filters.category)):categoryMatches(state,t.categoryId,filters.category)))&&
  (!filters.importance||(t.items?.length?t.items.some(i=>i.importance===filters.importance):t.importance===filters.importance))
 ).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt);
 const hasActiveFilters=Boolean(filters.from||filters.to||filters.category||filters.importance||filters.search||filters.typeGroup);
 return `<div class="card"><div class="cardhead"><h2>История денег</h2><div class="actions"><span class="pill">${ts.length} операций</span><button class="ghost filter-trigger" data-action="openFilters" aria-label="Поиск и фильтры${hasActiveFilters?' · применены':''}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg>${hasActiveFilters?'<span class="filter-active" aria-hidden="true"></span>':''}</button></div></div>`+
 `<div class="tx-quick-bar"><input type="search" id="liveTxSearch" value="${esc(filters.search)}" placeholder="🔍 Быстрый поиск по покупкам, товарам, долгам…"><div class="tx-chips">${[['','Все'],['expense','Расходы'],['income','Доходы'],['debt','Долги'],['transfer','Переводы']].map(([id,label])=>`<button type="button" class="small ${filters.typeGroup===id?'primary':'ghost'}" data-tx-group="${id}">${label}</button>`).join('')}${hasActiveFilters?`<button type="button" class="small danger" data-action="resetFilters">Сбросить</button>`:''}</div></div>`+
 `${ts.map(row).join('')||'<div class="empty">Операций по выбранному фильтру пока нет</div>'}</div>`;
}
function accounts(){return `<div class="cardhead"><h2>Мои счета</h2><button data-action="addAccount">+ Счёт</button></div><div class="grid three">${state.accounts.map(a=>`<div class="card"><div class="cardhead"><span class="pill">${{card:'Карта',cash:'Наличные',savings:'Накопления'}[a.kind]}</span><button class="small ghost" data-action="editAccount" data-id="${a.id}">Изменить</button></div><h3>${esc(a.name)}</h3><div class="metric ${balance(state,a.id)<0?'negative':''}">${rub(balance(state,a.id))}</div><div class="muted">Начальный остаток ${rub(a.opening)}</div></div>`).join('')||'<div class="card empty">Добавь первый счёт</div>'}</div><div class="cardhead section"><h2>На что коплю</h2><button data-action="addGoal">+ Цель</button></div><div class="grid three">${state.goals.map(g=>{const n=balance(state,g.accountId);return `<div class="card"><div class="cardhead"><h3>${esc(g.name)}</h3><button class="small ghost" data-action="editGoal" data-id="${g.id}">✎</button></div><div class="metric">${rub(n)}</div><div class="muted">из ${rub(g.target)} · ${esc(account(g.accountId))}</div><div class="barrow"><div class="track"><div class="fill" style="width:${Math.max(0,Math.min(100,n/g.target*100))}%"></div></div></div><div class="muted">${g.due?'К '+date(g.due):'Без срока'} · осталось ${rub(Math.max(0,g.target-n))}</div><button class="small soft section" data-action="goalTransfer" data-id="${g.id}">Пополнить переводом</button></div>`;}).join('')||'<div class="card empty">Создай накопительный счёт и привяжи к нему цель</div>'}</div><div class="cardhead section"><h2>Долги</h2><button data-action="addDebt">+ Долг</button></div><div class="grid two">${state.debts.map(d=>`<div class="card"><div class="cardhead"><span class="pill">${d.direction==='owe'?'Я должен':'Мне должны'}</span><button class="small ghost" data-action="editDebt" data-id="${d.id}">Изменить</button></div><h3>${esc(d.name)}</h3><div class="metric">${rub(debtRemaining(state,d.id))}</div><div class="muted">${d.due?'Вернуть до '+date(d.due):'Без срока'}${d.note?' · '+esc(d.note):''}</div><div class="actions section"><button class="small primary" data-action="repayDebt" data-id="${d.id}" ${debtRemaining(state,d.id)<=0?'disabled':''}>${d.direction==='owe'?'Вернуть':'Получить возврат'}</button><button class="small ghost" data-action="increaseDebt" data-id="${d.id}">${d.direction==='owe'?'Взять ещё':'Дать ещё'}</button></div></div>`).join('')||'<div class="card empty">Здесь будут долги и их погашения</div>'}</div>`;}
function budget(){const m=summary(state,today().slice(0,7)+'-01',today());return `<div class="grid two"><div class="card"><h2>Мой план на месяц</h2><form id="budgetForm"><div class="formgrid">${field('Ожидаемый доход, ₽',input('income',decimal(state.budget.income),'text','inputmode="decimal" required'))}${field('Резерв на накопления до дохода, ₽',input('savings',decimal(state.budget.savings),'text','inputmode="decimal" required'))}${field('Следующий доход',input('nextIncome',state.budget.nextIncome,'date'),true)}</div><div class="note">Резерв — сколько ещё хочешь отложить до следующего дохода. После перевода в накопления уменьши резерв, чтобы не вычитать эти деньги повторно. Ожидаемый доход не увеличивает текущий остаток.</div><h3>Лимиты категорий, ₽</h3><div class="formgrid">${state.categories.map(c=>field(esc(c.name),input('cap_'+c.id,state.budget.caps[c.id]?decimal(state.budget.caps[c.id]):'','text','inputmode="decimal" placeholder="Без лимита"'))).join('')}</div><div class="error" id="budgetError"></div><button class="primary section">Сохранить бюджет</button></form></div><div class="card"><h2>Как идёт месяц</h2>${state.categories.filter(c=>state.budget.caps[c.id]).map(c=>{const cap=state.budget.caps[c.id],spent=m.category[c.id]||0;return `<div class="barrow"><div class="bar-label"><span>${esc(c.name)}</span><strong class="${spent>cap?'negative':''}">${rub(spent)} / ${rub(cap)}</strong></div><div class="track"><div class="fill" style="width:${Math.min(100,spent/cap*100)}%;background:${spent>cap?'#b45e50':'#71917a'}"></div></div></div>`;}).join('')||'<div class="empty">Задай лимиты для нужных категорий</div>'}<div class="separator"></div><div class="label">Доходы минус расходы за месяц</div><div class="metric ${m.net<0?'negative':'positive'}">${rub(m.net)}</div><div class="muted">Переводы и основной долг исключены</div></div></div><div class="card section"><div class="cardhead"><h2>Предстоящие платежи</h2><button data-action="addPlan">+ Платёж</button></div>${[...state.plans].sort((a,b)=>a.date.localeCompare(b.date)).map(p=>`<div class="row"><div class="badge">${p.paidTransactionId?'✓':'◷'}</div><div class="row-main"><div class="row-title">${esc(p.name)}</div><div class="row-meta">${date(p.date)} · ${esc(category(p.categoryId))} · ${p.paidTransactionId?'Оплачен':'Запланирован'}</div></div><div class="amount">${rub(p.amount)}</div><div class="actions">${!p.paidTransactionId?`<button class="small primary" data-action="payPlan" data-id="${p.id}">Оплатить</button>`:''}<button class="small ghost" data-action="editPlan" data-id="${p.id}">✎</button></div></div>`).join('')||'<div class="empty">Добавь аренду, связь или другой будущий платёж</div>'}</div>`;}
function buildLocalInsights(s,prev){
 const list=[];
 if(prev.expense>0){
  const diff=s.expense-prev.expense,pct=Math.round(diff/prev.expense*100);
  list.push({
   badge:diff>0?'Рост расходов':'Снижение расходов',
   title:diff>0?`Потрачено на ${rub(diff)} (+${pct}%) больше прошлого периода`:`Экономия ${rub(Math.abs(diff))} (${pct}%) к прошлому периоду`,
   text:`За этот период расходы составили ${rub(s.expense)} против ${rub(prev.expense)} за предыдущие дни такой же длины.`
  });
 }
 const impulse=(s.importance.unnecessary||0)+(s.importance.wanted||0);
 if(impulse>0){
  const share=s.expense?Math.round(impulse/s.expense*100):0;
  list.push({
   badge:'Потенциал экономии',
   title:`«Не нужно» и «Хотелось» съели ${rub(impulse)} (${share}% трат)`,
   text:`Из них «Не нужно»: ${rub(s.importance.unnecessary||0)}, «Хотелось»: ${rub(s.importance.wanted||0)}. Сокращение этих трат наполовину сохранит ${rub(Math.round(impulse/2))}.`
  });
 }
 const topCat=Object.entries(s.rootCategory).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1])[0];
 if(topCat){
  const share=s.expense?Math.round(topCat[1]/s.expense*100):0;
  list.push({
   badge:'Главная статья',
   title:`«${category(topCat[0])}» — ${rub(topCat[1])} (${share}% всех расходов)`,
   text:`Самая крупная категория за выбранный период.`
  });
 }
 return list;
}
function copyReadableReport(){
 const start=new Date(period.from+'T12:00:00'),end=new Date(period.to+'T12:00:00'),len=Math.max(1,Math.round((end-start)/86400000)+1);
 const prevEnd=new Date(start);prevEnd.setDate(prevEnd.getDate()-1);
 const prevStart=new Date(prevEnd);prevStart.setDate(prevStart.getDate()-len+1);
 const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const cur=summary(state,period.from,period.to),prev=summary(state,fmt(prevStart),fmt(prevEnd));
 const cats=Object.entries(cur.rootCategory).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).map(([id,v])=>`- ${category(id)}: ${rub(v)}`).join('\n');
 const imp=Object.entries(cur.importance).filter(([,v])=>v>0).map(([k,v])=>`- ${IMPORTANCE[k]}: ${rub(v)}`).join('\n');
 const text=`Разбери мой личный бюджет за период ${period.from} — ${period.to} (${len} дн.) по фактам и без воды:\n\n`+
  `Доходы: ${rub(cur.income)}\nРасходы: ${rub(cur.expense)} (предыдущий период: ${rub(prev.expense)})\nИтог периода: ${rub(cur.net)}\nСвободные деньги сейчас: ${rub(available(state).free)}\n\n`+
  `Расходы по категориям:\n${cats||'нет'}\n\nОценка необходимости трат:\n${imp||'нет'}\n\n`+
  `Напиши коротко: 1) Где главный перерасход и дыра в бюджете; 2) Конкретный план действий на следующую неделю в цифрах.`;
 copy(text);
}
function reports(){
 const start=new Date(period.from+'T12:00:00'),end=new Date(period.to+'T12:00:00'),len=Math.max(1,Math.round((end-start)/86400000)+1);
 const prevEnd=new Date(start);prevEnd.setDate(prevEnd.getDate()-1);
 const prevStart=new Date(prevEnd);prevStart.setDate(prevStart.getDate()-len+1);
 const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const s=summary(state,period.from,period.to),prev=summary(state,fmt(prevStart),fmt(prevEnd));
 const insights=buildLocalInsights(s,prev);
 return `<div class="card"><div class="filterbar">${field('Начало периода',input('reportFrom',period.from,'date'))}${field('Конец периода',input('reportTo',period.to,'date'))}<button data-action="applyPeriod" class="soft">Показать</button><button class="primary" data-action="copyTextReport">📋 Скопировать выписку для ИИ</button></div><div class="grid three"><div><div class="label">Доходы</div><div class="metric positive">${rub(s.income)}</div></div><div><div class="label">Расходы</div><div class="metric">${rub(s.expense)}</div></div><div><div class="label">Разница</div><div class="metric ${s.net<0?'negative':'positive'}">${rub(s.net)}</div></div></div>${trend(s.days,period.from,period.to)}</div>`+
 `<div class="card section"><div class="cardhead"><h2>⚡ Авторазбор периода по фактам</h2><span class="pill">Локальный расчёт</span></div>${insights.length?insights.map(ins=>`<div class="insight"><span class="pill">${esc(ins.badge)}</span><h3 class="section">${esc(ins.title)}</h3><p>${esc(ins.text)}</p></div>`).join(''):'<div class="empty">Добавь операции за выбранный период, чтобы увидеть автоматический разбор.</div>'}</div>`+
 `${upgrade.reportExtras(period.from,period.to)}`+
 `<div class="grid two section"><div class="card"><h2>Категории расходов</h2>${bars(s.rootCategory,category,id=>state.categories.find(c=>c.id===id)?.color)+`<details><summary>Подкатегории</summary>${bars(Object.fromEntries(state.categories.filter(c=>c.parentId).map(c=>[c.id,s.category[c.id]||0])),category)}</details>`}</div><div class="card"><h2>Необходимость покупок</h2>${bars(s.importance,id=>IMPORTANCE[id])}<div class="footerhint">Показывает, сколько денег уходит на обязательные вещи, а сколько — на импульсивные «Хотелось» и «Не нужно».</div></div></div>`;
}
function productTable(rows){const grouped={};for(const r of rows.filter(r=>r.productId)){const key=r.name.trim().toLowerCase()+'|'+r.unit; (grouped[key]??=[]).push(r);}return Object.values(grouped).length?`<div class="tablewrap section"><table><thead><tr><th>Товар</th><th>Покупок</th><th>Первая цена</th><th>Последняя цена</th><th>Изменение</th></tr></thead><tbody>${Object.values(grouped).map(rs=>{rs.sort((a,b)=>a.date.localeCompare(b.date));const first=Math.round(rs[0].amount/rs[0].quantity),last=Math.round(rs.at(-1).amount/rs.at(-1).quantity);return `<tr><td>${esc(rs[0].name)}<div class="row-meta">За ${esc(rs[0].unit)} · ${date(rs[0].date)} — ${date(rs.at(-1).date)}</div></td><td>${rs.length}</td><td>${rub(first)}</td><td>${rub(last)}</td><td>${rs.length>1?((last-first)/first*100).toFixed(1)+'%':'—'}</td></tr>`;}).join('')}</tbody></table></div>`:'<div class="empty">Пока нет покупок с отдельными товарами</div>';}
function settings(){return `<div class="grid two"><div class="card"><div class="cardhead"><h2>Мои категории</h2><button data-action="addCategory">+ Категория</button></div><div class="categorylist">${state.categories.map(c=>`<div class="row"><span class="dot" style="background:${/^#[0-9a-f]{6}$/i.test(c.color)?c.color:'#71917a'}"></span><div class="row-main row-title">${esc(c.name)}</div><button class="small ghost" data-action="editCategory" data-id="${c.id}">Изменить</button></div>`).join('')}</div></div><div class="card"><h2>Данные на твоём устройстве</h2><p class="muted">Учёт хранится в этом браузере. Очистка данных браузера удалит записи. Сохраняй резервную копию, особенно перед сменой телефона.</p><div class="actions"><button class="primary" data-action="backup">Скачать копию</button><button class="ghost" data-action="restore">Восстановить</button><button class="ghost" data-action="backupText">Копия текстом</button></div><div class="separator"></div><h3>Установка на Android</h3><p class="muted">Открой приложение по HTTPS в Chrome → меню → «Добавить на главный экран» или «Установить приложение». Для первого запуска нужен интернет; затем интерфейс работает офлайн.</p>${installEvent?'<button data-action="install" class="soft">Установить</button>':''}<div class="note">Встроенной синхронизации и шифрования базы нет. JSON-копия содержит финансовые данные — храни её в безопасном месте.</div><div class="actions"><button class="small ghost" data-action="demo">Загрузить пример</button><button class="small danger" data-action="reset">Удалить все данные</button>${storageError?'<button class="small ghost" data-action="rawBackup">Сохранить исходное хранилище</button>':''}</div><div class="footerhint">Финансист 1.6 · без банковских API, QR и распознавания чеков.</div></div></div>`;}

function thumbSheetModal(){
 const activeShifts=state.courierShifts.filter(x=>x.startedAt&&!x.endedAt);
 const quickBtns=state.quickActions.map(q=>`<button type="button" class="soft" data-thumb-quick="${esc(q.id)}">${esc(q.name)}${q.amount?' · '+rub(q.amount):''}</button>`).join('');
 modal('Быстрые действия под палец',
  `<div class="thumb-sheet-grid">`+
   `<button type="button" class="primary thumb-card-btn" data-thumb-tx="expense"><span>💸</span><b>Расход</b><small>Покупка или платёж</small></button>`+
   `<button type="button" class="soft thumb-card-btn" data-thumb-tx="income"><span>💰</span><b>Доход</b><small>Поступление денег</small></button>`+
   `<button type="button" class="soft thumb-card-btn" data-thumb-tx="lend"><span>🤝</span><b>Дал в долг</b><small>Новому или знакомому</small></button>`+
   `<button type="button" class="soft thumb-card-btn" data-thumb-tx="transfer"><span>⇄</span><b>Перевод</b><small>Между своими счетами</small></button>`+
  `</div>`+
  `<div class="thumb-sheet-section"><span class="label">Доставка в 1 касание</span><div class="actions">`+
   (activeShifts.length?activeShifts.map(x=>
    `<button type="button" class="primary small" data-thumb-courier="instantTrip1|${esc(x.id)}">⚡ +1 выдача</button>`+
    `<button type="button" class="soft small" data-thumb-courier="instantTrip2|${esc(x.id)}">+2 выдачи</button>`+
    `<button type="button" class="ghost small" data-thumb-courier="shiftExpense|${esc(x.id)}">− Расход смены</button>`+
    `<button type="button" class="ghost small" data-thumb-courier="tip|${esc(x.id)}">+ Чай</button>`
   ).join(''):`<button type="button" class="primary small" data-thumb-courier="startDeliveryShift|">▶ Начать смену доставки</button><button type="button" class="ghost small" data-thumb-nav="courier">Открыть доставку →</button>`)+
  `</div></div>`+
  (quickBtns?`<div class="thumb-sheet-section"><span class="label">Твои шаблоны</span><div class="quick-buttons">${quickBtns}</div></div>`:''),
  null,
  'bottom-sheet'
 );
 dialog.querySelectorAll('[data-thumb-tx]').forEach(b=>b.onclick=()=>{
  const tp=b.dataset.thumbTx;
  dialog.close();
  transactionModal(null,{type:tp,...(tp==='lend'?{debtId:'__new__'}:{})});
 });
 dialog.querySelectorAll('[data-thumb-courier]').forEach(b=>b.onclick=()=>{
  const [act,id]=b.dataset.thumbCourier.split('|');
  dialog.close();
  if(act==='startShift'||act==='startDeliveryShift')view='courier';
  action(act,id);
 });
 dialog.querySelectorAll('[data-thumb-nav]').forEach(b=>b.onclick=()=>{
  dialog.close();
  view=b.dataset.thumbNav;
  render();
  window.scrollTo(0,0);
 });
 dialog.querySelectorAll('[data-thumb-quick]').forEach(b=>b.onclick=()=>{
  const id=b.dataset.thumbQuick;
  dialog.close();
  daily.handleAction('useQuick',id);
 });
}

function render(){
 const content={home,transactions,accounts,budget,courier,reports,settings,more:upgrade.more,categories:upgrade.categories,quick:daily.quick,recurring:daily.recurring,earnings:timeline.calendar,purchases:timeline.purchases,forecast:timeline.forecast,monthly:timeline.monthly}[view]();
 const nav=Object.entries(views).map(([id,n])=>`<button data-view="${id}" class="${id===view||(id==='more'&&['budget','reports','settings','categories','quick','recurring','earnings','purchases','forecast','monthly'].includes(view))?'active':''}">${icon(id)}<span>${n}</span></button>`).join('');
 const activeShifts=state.courierShifts.filter(x=>x.startedAt&&!x.endedAt);
 app.innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><span class="brandmark">₽</span>Финансист</div><nav class="nav">${nav}</nav><div class="sidebar-note"><span class="statusdot"></span>Личное пространство<br>Данные на этом устройстве<br><span class="version">Финансист 1.6 · UI 2026</span></div></aside><main class="main"><div class="mobile-brand"><span class="actions"><span class="brandmark">₽</span>Финансист</span><span class="pill">${activeShifts.length?'🟢 В смене':'Личный'}</span></div><div class="topline"><div><h1>${{home:'Обзор',transactions:'Операции',accounts:'Счета и долги',budget:'Бюджет',courier:'Доставка',reports:'Отчёты',settings:'Настройки',more:'Ещё',categories:'Категории',quick:'Быстрые операции',recurring:'Регулярные платежи',earnings:'Календарь денег',purchases:'Покупки и платежи',forecast:'Прогноз остатка',monthly:'Итог месяца'}[view]}</h1></div><div class="actions"><button class="ghost small" data-action="lendQuick">🤝 Дал в долг</button><button class="primary" data-action="addTx">+ Операция</button></div></div>${storageError?`<div class="note negative">${esc(storageError)}</div>`:''}${content}<div class="footerhint">${new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})} · RUB · только твои записи</div></main><div class="thumb-dock" role="region" aria-label="Быстрые операции под палец"><button type="button" class="thumb-quick-btn" data-action="thumbSheet" aria-label="Быстрые действия">⚡ Быстро</button><button type="button" class="thumb-add-btn primary" data-action="addTx" aria-label="Записать операцию">+ Операция</button></div><nav class="bottomnav">${nav}</nav></div>`;
 bind();features.afterRender();upgrade.afterRender();daily.afterRender();
}

function bind(){
 app.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;render();window.scrollTo(0,0);});
 app.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{try{action(b.dataset.action,b.dataset.id);}catch(e){toast(e.message);}});
 const liveSearch=app.querySelector('#liveTxSearch');
 if(liveSearch){
  liveSearch.oninput=e=>{
   filters.search=e.target.value;
   const pos=e.target.selectionStart;
   render();
   const nextInput=app.querySelector('#liveTxSearch');
   if(nextInput){nextInput.focus();nextInput.setSelectionRange(pos,pos);}
  };
 }
 app.querySelectorAll('[data-tx-group]').forEach(b=>b.onclick=()=>{
  filters.typeGroup=b.dataset.txGroup;
  render();
 });
 const form=app.querySelector('#budgetForm');
 if(form)form.onsubmit=e=>{e.preventDefault();try{const f=new FormData(form);mutate(s=>{s.budget={income:cents(f.get('income')),savings:cents(f.get('savings')),nextIncome:f.get('nextIncome'),caps:Object.fromEntries(s.categories.filter(c=>f.get('cap_'+c.id)).map(c=>[c.id,cents(f.get('cap_'+c.id))]))};});toast('Бюджет сохранён');}catch(err){app.querySelector('#budgetError').textContent=err.message;}};
}

function action(name,id){
 if(name==='thumbSheet')return thumbSheetModal();
 if(name==='lendQuick')return transactionModal(null,{type:'lend',debtId:'__new__'});
 if(name==='resetFilters'){filters={from:'',to:'',category:'',importance:'',search:'',typeGroup:''};return render();}
 if(name==='repeatTx'){
  const orig=state.transactions.find(t=>t.id===id);
  if(!orig)return;
  return transactionModal(null,{...structuredClone(orig),id:undefined,date:today(),createdAt:undefined});
 }
 if(timeline.handleAction(name,id))return;
 if(name==='autoCopies')return copiesModal();
 if(name==='openFilters')return filterModal();
 if(daily.handleAction(name,id))return;
 if(upgrade.handleAction(name,id))return;
 if(features.handleAction(name,id))return;
 if(name==='addTx')return transactionModal();
 if(name==='editTx')return transactionModal(state.transactions.find(t=>t.id===id));
 if(name==='addAccount'||name==='editAccount')return accountModal(state.accounts.find(a=>a.id===id));
 if(name==='addCategory'||name==='editCategory')return categoryModal(state.categories.find(c=>c.id===id));
 if(name==='addDebt'||name==='editDebt')return debtModal(state.debts.find(d=>d.id===id));
 if(name==='addGoal'||name==='editGoal')return goalModal(state.goals.find(g=>g.id===id));
 if(name==='addPlan'||name==='editPlan')return planModal(state.plans.find(p=>p.id===id));
 if(name==='repayDebt'||name==='increaseDebt'){const d=state.debts.find(d=>d.id===id);return transactionModal(null,{type:name==='repayDebt'?(d.direction==='owe'?'repay_out':'repay_in'):(d.direction==='owe'?'borrow':'lend'),debtId:id,amount:name==='repayDebt'?debtRemaining(state,id):0});}
 if(name==='goalTransfer')return transactionModal(null,{type:'transfer',toAccountId:state.goals.find(g=>g.id===id).accountId});
 if(name==='payPlan'){const p=state.plans.find(p=>p.id===id);return transactionModal(null,{type:'expense',amount:p.amount,note:p.name,categoryId:p.categoryId,importance:'essential',planId:p.id});}
 if(name==='applyFilters'){filters={...filters,from:app.querySelector('[name=filterFrom]').value,to:app.querySelector('[name=filterTo]').value,category:app.querySelector('[name=filterCategory]').value,importance:app.querySelector('[name=filterImportance]').value,search:app.querySelector('[name=filterSearch]').value};if(!filters.from||!filters.to||filters.from>filters.to)throw Error('Проверьте период');return render();}
 if(name==='applyPeriod'){const from=app.querySelector('[name=reportFrom]').value,to=app.querySelector('[name=reportTo]').value;if(!from||!to||from>to||to>today())throw Error('Выберите корректный период до сегодняшнего дня');period={from,to};activeReport=null;aiRequest=null;return render();}
 if(name==='copyTextReport')return copyReadableReport();
 if(name==='aiExport')return copyReadableReport();
 if(name==='showReport'){activeReport=id;period=state.reports.find(r=>r.id===id).period;return render();}
 if(name==='backup')return download('financier-backup-'+today()+'.json',state);
 if(name==='shareBackup')return shareBackup();
 if(name==='restoreIDB'){openIDB().then(db=>{const r=db.transaction('kv').objectStore('kv').get('latest');r.onsuccess=()=>{if(!r.result){toast('В резервном хранилище IndexedDB пока нет копии');return;}const data=validateState(JSON.parse(r.result));confirmModal('Восстановить из защищённого хранилища (IndexedDB)?','Текущие данные будут заменены сохранённой копией из IndexedDB.',()=>{storageError='';persist(data);render();});};}).catch(()=>toast('IndexedDB недоступен'));return;}
 if(name==='backupText')return modal('Резервная копия JSON', '<textarea id="backupText" rows="16" readonly>'+esc(JSON.stringify(state,null,2))+'</textarea><p class="muted">Можно скопировать текст и сохранить в файл .json. Это полная копия данных.</p>');
 if(name==='rawBackup')return download('financier-original.json',localStorage.getItem(KEY)||'');
 if(name==='restore')return restoreModal();
 if(name==='reset')return confirmModal('Удалить все данные?','Это удалит счета, операции, долги и отчёты. Сначала сохрани резервную копию.',()=>{storageError='';persist(initialState());aiRequest=null;localStorage.removeItem(KEY+'.pending');activeReport=null;render();});
 if(name==='demo')return confirmModal('Загрузить пример?','Пример заменит текущие данные. Сначала скачай резервную копию. Все суммы в примере вымышленные.',()=>{storageError='';persist(demoState());aiRequest=null;localStorage.removeItem(KEY+'.pending');activeReport=null;render();});
 if(name==='install'&&installEvent){installEvent.prompt();installEvent=null;render();}
}

function confirmModal(title,message,fn){modal(title,`<p>${message}</p>`,()=>fn());dialog.querySelector('button[type="submit"]').textContent='Подтвердить';}
function filterModal(){modal('Поиск и фильтры', '<div class="formgrid">'+field('С',input('from',filters.from,'date'))+field('По',input('to',filters.to,'date'))+field('Категория','<select name="category">'+option('','Все',filters.category)+categoryOpts(filters.category,null)+'</select>')+field('Важность','<select name="importance">'+option('','Любая',filters.importance)+importanceOpts(filters.importance)+'</select>')+field('Поиск',input('search',filters.search,'search','placeholder="Покупка или товар"'),true)+'</div><button type="button" id="clearFilters" class="ghost section">Сбросить всё</button>',f=>{const next={...filters,from:f.get('from'),to:f.get('to'),category:f.get('category'),importance:f.get('importance'),search:f.get('search')};if(next.from&&next.to&&next.from>next.to)throw Error('Проверь период');filters=next;render();});dialog.querySelector('#clearFilters').onclick=()=>{filters={from:'',to:'',category:'',importance:'',search:'',typeGroup:''};dialog.close();render();};dialog.querySelector('[type=submit]').textContent='Применить';}
function accountModal(a){modal(a?'Изменить счёт':'Новый счёт','<div class="formgrid">'+field('Название',input('name',a?.name||'','text','required maxlength="80"'),true)+field('Тип','<select name="kind">'+Object.entries({card:'Карта',cash:'Наличные',savings:'Накопления'}).map(([id,n])=>option(id,n,a?.kind||'card')).join('')+'</select>')+field(a?'Текущий остаток, ₽':'Остаток, ₽',input('opening',decimal(a?balance(state,a.id):0),'text','required inputmode="decimal"'))+'</div>'+(a?field('Как учитывать изменение остатка','<select name="correction"><option value="history">Записать расхождение в истории</option><option value="silent">Изменить без истории</option></select>')+'<p class="muted">Корректировка отдельно от доходов и расходов. Последующие операции меняют этот остаток.</p><button type="button" class="danger small" id="deleteEntity">Удалить счёт</button>':''),f=>mutate(s=>{const target=(String(f.get('opening')).trim().startsWith('-')?-cents(String(f.get('opening')).trim().slice(1)):cents(f.get('opening'))),name=f.get('name').trim(),kind=f.get('kind');if(!name)throw Error('Введите название');if(a){setAccountBalance(s,a.id,target,f.get('correction')==='history');Object.assign(s.accounts.find(x=>x.id===a.id),{name,kind});}else s.accounts.push({id:uid(),name,kind,opening:target});}));if(a)dialog.querySelector('#deleteEntity').onclick=()=>{try{if(state.transactions.some(t=>t.accountId===a.id||t.toAccountId===a.id)||state.goals.some(g=>g.accountId===a.id)||state.quickActions.some(q=>q.accountId===a.id))throw Error('Счёт используется в операциях, целях или быстрых кнопках');mutate(s=>s.accounts=s.accounts.filter(x=>x.id!==a.id));dialog.close();}catch(e){dialog.querySelector('#formError').textContent=e.message;}};}
function categoryModal(c){modal(c?'Изменить категорию':'Новая категория',`<div class="formgrid">${field('Название',input('name',c?.name||'','text','required maxlength="60"'))}${field('Цвет',input('color',c?.color||'#71917a','color'))}</div>${c&&state.categories.length>1?`<div class="separator"></div>${field('При удалении перенести записи в',`<select id="replacement">${state.categories.filter(x=>x.id!==c.id).map(x=>option(x.id,x.name)).join('')}</select>`)}<button type="button" class="danger small section" id="deleteEntity">Удалить с переносом записей</button>`:''}`,f=>mutate(s=>{const name=f.get('name').trim();if(!name)throw Error('Введите название');if(s.categories.some(x=>x.id!==c?.id&&x.name.toLowerCase()===name.toLowerCase()))throw Error('Такая категория уже есть');const data={id:c?.id||uid(),name,color:f.get('color')};if(c)s.categories[s.categories.findIndex(x=>x.id===c.id)]=data;else s.categories.push(data);}));if(dialog.querySelector('#deleteEntity'))dialog.querySelector('#deleteEntity').onclick=()=>{try{const target=dialog.querySelector('#replacement').value;mutate(s=>{s.transactions.forEach(t=>{if(t.categoryId===c.id)t.categoryId=target;t.items?.forEach(i=>{if(i.categoryId===c.id)i.categoryId=target;});});s.plans.forEach(p=>{if(p.categoryId===c.id)p.categoryId=target;});if(s.budget.caps[c.id])s.budget.caps[target]=(s.budget.caps[target]||0)+s.budget.caps[c.id];delete s.budget.caps[c.id];s.categories=s.categories.filter(x=>x.id!==c.id);});dialog.close();toast('Категория удалена, записи перенесены');}catch(e){dialog.querySelector('#formError').textContent=e.message;}};}
function debtModal(d){modal(d?'Изменить долг':'Новый долг',`<div class="formgrid">${field('Человек или организация',input('name',d?.name||'','text','required maxlength="80"'),true)}${field('Направление',`<select name="direction" ${d&&state.transactions.some(t=>t.debtId===d.id)?'disabled':''}>${option('owe','Я должен',d?.direction||'owe')}${option('owed','Мне должны',d?.direction)}</select>`)}${field('Уже существующий долг, ₽',input('opening',decimal(d?.opening||0),'text','required inputmode="decimal"'))}${field('Срок возврата',input('due',d?.due||'','date'))}${field('Комментарий',input('note',d?.note||''))}</div><div class="note">Существующий долг не меняет остаток счёта. Если деньги получены или выданы сейчас, можно сразу выбрать «Дал / взял в долг» в обычной операции — профиль человека создастся автоматически.</div>${d?'<button type="button" class="danger small" id="deleteEntity">Удалить долг</button>':''}`,f=>mutate(s=>{const data={id:d?.id||uid(),name:f.get('name').trim(),direction:f.get('direction')||d.direction,opening:cents(f.get('opening')),due:f.get('due'),note:f.get('note').trim()};if(!data.name)throw Error('Введите имя');if(d)s.debts[s.debts.findIndex(x=>x.id===d.id)]=data;else s.debts.push(data);}));if(d)dialog.querySelector('#deleteEntity').onclick=()=>{try{if(state.transactions.some(t=>t.debtId===d.id))throw Error('Долг связан с операциями. Удаление потеряет историю');mutate(s=>s.debts=s.debts.filter(x=>x.id!==d.id));dialog.close();}catch(e){dialog.querySelector('#formError').textContent=e.message;}};}
function goalModal(g){if(!state.accounts.some(a=>a.kind==='savings')){toast('Сначала добавь накопительный счёт');return accountModal();}modal(g?'Изменить цель':'Новая цель',`<div class="formgrid">${field('На что коплю',input('name',g?.name||'','text','required maxlength="80"'),true)}${field('Сумма цели, ₽',input('target',g?decimal(g.target):'','text','required inputmode="decimal"'))}${field('Накопительный счёт',`<select name="accountId">${accountOpts(g?.accountId,'savings')}</select>`)}${field('Срок',input('due',g?.due||'','date'),true)}</div><div class="note">Один накопительный счёт — одна цель. Прогресс равен остатку счёта. Пополнение цели — обычный перевод между счетами.</div>${g?'<button type="button" class="danger small" id="deleteEntity">Удалить цель</button>':''}`,f=>mutate(s=>{const data={id:g?.id||uid(),name:f.get('name').trim(),target:cents(f.get('target')),accountId:f.get('accountId'),due:f.get('due')};if(!data.name)throw Error('Введите название');if(g)s.goals[s.goals.findIndex(x=>x.id===g.id)]=data;else s.goals.push(data);}));if(g)dialog.querySelector('#deleteEntity').onclick=()=>{mutate(s=>s.goals=s.goals.filter(x=>x.id!==g.id));dialog.close();};}
function planModal(p){modal(p?'Изменить платёж':'Будущий платёж',`<div class="formgrid">${field('Название',input('name',p?.name||'','text','required maxlength="80"'),true)}${field('Сумма, ₽',input('amount',p?decimal(p.amount):'','text','required inputmode="decimal"'))}${field('Дата',input('date',p?.date||today(),'date','required'))}${field('Категория',`<select name="categoryId">${categoryOpts(p?.categoryId)}</select>`,true)}</div>${p?'<button type="button" class="danger small section" id="deleteEntity">Удалить план</button>':''}`,f=>mutate(s=>{const data={...p,id:p?.id||uid(),name:f.get('name').trim(),amount:cents(f.get('amount')),date:f.get('date'),categoryId:f.get('categoryId'),paidTransactionId:p?.paidTransactionId||null};if(!data.name)throw Error('Введите название');if(p)s.plans[s.plans.findIndex(x=>x.id===p.id)]=data;else s.plans.push(data);}));if(p)dialog.querySelector('#deleteEntity').onclick=()=>{mutate(s=>{if(p.recurringId){const r=s.recurringPayments.find(r=>r.id===p.recurringId);if(r&&!r.skippedDates.includes(p.date))r.skippedDates.push(p.date);}s.plans=s.plans.filter(x=>x.id!==p.id);});dialog.close();};}

function knownProductsMap(){
 const map=new Map();
 for(const t of state.transactions){
  for(const i of t.items||[]){
   if(i.name?.trim())map.set(i.name.trim().toLowerCase(),{name:i.name.trim(),unit:i.unit||'шт',categoryId:i.categoryId,importance:i.importance||'unrated'});
  }
 }
 return map;
}

function transactionModal(t,defaults={},resuming=false){
 let draft=null;
 if(!resuming&&!t&&!Object.keys(defaults).length){
  try{draft=JSON.parse(localStorage.getItem(KEY+'.draft'));}catch{}
  if(draft&&draft.fields&&state.accounts.some(a=>a.id===draft.fields.accountId)){
   const original=draft.editId?state.transactions.find(x=>x.id===draft.editId):null;
   if(draft.editId&&!original)draft=null;
   else return transactionModal(original,{...draft.defaults,...draft.fields,categoryId:draft.fields.incomeCategoryId||draft.fields.categoryId,_draft:draft},true);
  }
 }
 draft=defaults._draft||null;
 if(!state.accounts.length){toast('Сначала добавь счёт');return accountModal();}
 const d={type:'expense',date:today(),accountId:state.accounts[0].id,categoryId:state.categories[0]?.id,importance:'unrated',...defaults,...t,...(draft?{...draft.fields,categoryId:draft.fields.incomeCategoryId||draft.fields.categoryId}:{})};
 let items=structuredClone(draft?.items||t?.items||defaults.items||[]);
 const draftFields=draft?.fields;
 const recentNotes=[...new Set(state.transactions.map(x=>x.note).filter(Boolean))].slice(0,25);
 const prodMap=knownProductsMap();
 const fields=`<div class="formgrid">${field('Операция',`<select name="type">${Object.entries(TYPES).filter(([id])=>t?.type.startsWith('adjustment')?id.startsWith('adjustment'):!id.startsWith('adjustment')).map(([id,n])=>option(id,n,d.type)).join('')}</select>`)}${field('Дата',input('date',d.date,'date','required'))}${field('Счёт',`<select name="accountId">${accountOpts(d.accountId)}</select>`)}${field('Сумма, ₽',input('amount',draft?draft.fields.amount:d.amount?decimal(d.amount):'','text','required inputmode="decimal"'))}<div class="field full" id="transferFields"></div><div class="field full" id="debtFields"></div><div class="full" id="expenseFields"></div><div class="full" id="incomeFields"></div>${field('Название / комментарий',input('note',d.note||'','text','maxlength="250" list="txNotesList" placeholder="Например: Продукты, Такси, Возврат…"'),true)}</div><datalist id="txNotesList">${recentNotes.map(n=>`<option value="${esc(n)}">`).join('')}</datalist><datalist id="productNamesList">${[...prodMap.values()].map(p=>`<option value="${esc(p.name)}">`).join('')}</datalist>${t?'<button type="button" class="danger small section" id="deleteTx">Удалить операцию</button>':''}`;

 modal(t?'Изменить операцию':'Записать операцию',fields,f=>{
  const type=f.get('type');
  if(type==='expense'&&f.get('isTax')==='on'&&!f.get('deductFromCategoryId'))throw Error('Выбери источник дохода для оплаты налога');
  readItems();
  const totalCents=cents(f.get('amount'));
  let rows=[];
  if(type==='expense'&&items.length){
   const parts=items.map(i=>({productId:i.productId||uid(),name:i.name?.trim()||category(i.categoryId),amount:cents(i.amount),quantity:1,unit:'шт',categoryId:i.categoryId,importance:i.importance||f.get('importance')||'unrated'}));
   const splitSum=parts.reduce((n,p)=>n+p.amount,0);
   if(splitSum>totalCents)throw Error('Сумма выделенных категорий превышает общую сумму чека');
   rows=[...parts];
   if(splitSum<totalCents){
    rows.unshift({productId:uid(),name:f.get('note').trim()||category(f.get('categoryId')),amount:totalCents-splitSum,quantity:1,unit:'шт',categoryId:f.get('categoryId'),importance:f.get('importance')||'unrated'});
   }
  }
  let resolvedDebtId=f.get('debtId');
  let newDebtToCreate=null;
  if(['borrow','lend'].includes(type)&&resolvedDebtId==='__new__'){
   const newName=(f.get('newDebtName')||'').trim();
   if(!newName)throw Error('Введи имя человека или название долга');
   const dir=type==='borrow'?'owe':'owed';
   const existing=state.debts.find(x=>x.direction===dir&&x.name.trim().toLowerCase()===newName.toLowerCase());
   if(existing){
    resolvedDebtId=existing.id;
   }else{
    newDebtToCreate={
     id:uid(),
     name:newName,
     direction:dir,
     opening:0,
     due:f.get('newDebtDue')||'',
     note:(f.get('newDebtNote')||'').trim(),
     schedule:[],
     schedulePaidBase:0
    };
    resolvedDebtId=newDebtToCreate.id;
   }
  }
  const rawNote=f.get('note').trim();
  const autoNote=(!rawNote&&newDebtToCreate)?(`${type==='lend'?'Дал в долг':'Взял в долг'}: ${newDebtToCreate.name}`):rawNote;
  const tx={
   id:t?.id||uid(),
   type,
   date:f.get('date'),
   accountId:f.get('accountId'),
   amount:cents(f.get('amount')),
   note:autoNote,
   createdAt:t?.createdAt||Date.now(),
   ...(type==='transfer'?{toAccountId:f.get('toAccountId')}:{}),
   ...(['borrow','lend','repay_out','repay_in'].includes(type)?{debtId:resolvedDebtId}:{}),
   ...(type==='income'?{categoryId:f.get('incomeCategoryId'),taxPercent:f.get('taxPercent')===''?null:Number(f.get('taxPercent')),...(t?.type==='income'?{source:t.source,service:t.service,shiftId:t.shiftId,...(t.statementId?{statementId:t.statementId}:{})}:{})}:{}),
   ...(type==='expense'?{categoryId:f.get('categoryId'),importance:f.get('importance'),items:rows,deductFromCategoryId:f.get('deductFromCategoryId')||null,taxForCategoryId:f.get('isTax')==='on'?f.get('deductFromCategoryId')||null:null}:{})
  };
  if(type==='expense'&&tx.date>today()){
   if(t)throw Error('Существующий расход нельзя перенести в будущее — создай план');
   if(d.planId)throw Error('Для оплаты выбери сегодня или прошлую дату. Перенос плана доступен отдельно');
   mutate(s=>planFromExpense(s,tx));
   localStorage.removeItem(KEY+'.draft');
   window.removeEventListener('pagehide',saveDraft);
   return;
  }
  if(d.planId){
   const plan=state.plans.find(p=>p.id===d.planId);
   if(!plan||plan.paidTransactionId||plan.status==='cancelled')throw Error('План уже закрыт');
  }
  const checkState=newDebtToCreate?{...state,debts:[...state.debts,newDebtToCreate]}:state;
  validateTransaction(checkState,tx,t?.id);
  mutate(s=>{
   if(newDebtToCreate)s.debts.push(newDebtToCreate);
   if(t)s.transactions[s.transactions.findIndex(x=>x.id===t.id)]=tx;
   else s.transactions.push(tx);
   if(d.planId)s.plans.find(p=>p.id===d.planId).paidTransactionId=tx.id;
   for(const p of s.plans)if(p.paidTransactionId===tx.id&&tx.type!=='expense')p.paidTransactionId=null;
  });
  localStorage.removeItem(KEY+'.draft');
  window.removeEventListener('pagehide',saveDraft);
 });

 items=items.map(i=>({...i,amount:draft?i.amount:decimal(i.amount),costSource:i.costSource||'amount'}));
 let manualTotal=draft?draft.manualTotal:!!d.amount,draftFailed=false;
 const readItems=()=>{const el=dialog.querySelector('#itemList');if(el)items=[...el.querySelectorAll('.item')].map((row,i)=>({...items[i],name:row.querySelector('[data-item=name]')?.value||'',amount:row.querySelector('[data-item=amount]').value,quantity:1,unit:'шт',categoryId:row.querySelector('[data-item=categoryId]').value,importance:row.querySelector('[data-item=importance]').value}));};
 function drawItems(){
  const el=dialog.querySelector('#itemList');if(!el)return;
  el.innerHTML=items.map((i,index)=>`<div class="item split-item"><div class="split-grid">${field('Категория части чека',`<select data-item="categoryId" data-hierarchy="expense">${categoryOpts(i.categoryId)}</select>`)}${field('Сумма из чека, ₽',`<input data-item="amount" value="${esc(i.amount)}" inputmode="decimal" required placeholder="Например: 800">`)}${field('Важность',`<select data-item="importance">${importanceOpts(i.importance)}</select>`)}${field('Заметка · необязательно',`<input data-item="name" value="${esc(i.name||'')}" maxlength="80" placeholder="Например: бытовая химия">`)}</div><div class="itemfooter"><span class="muted">Остаток чека автоматически пойдёт в основную категорию</span><button type="button" class="small danger" data-remove="${index}">Убрать часть</button></div></div>`).join('');
  el.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{readItems();items.splice(Number(b.dataset.remove),1);drawItems();updateItemTotal();saveDraft();});
  el.querySelectorAll('[data-item="amount"]').forEach(inp=>inp.addEventListener('input',updateItemTotal));
 }
 function updateItemTotal(){
  readItems();
  const el=dialog.querySelector('#itemTotal');if(!el)return;
  if(!items.length){el.hidden=true;el.innerHTML='';return;}
  el.hidden=false;
  let splitSum=0;
  try{for(const i of items)splitSum+=cents(i.amount||'0');}catch{el.textContent='Укажи сумму выделенной части';return;}
  const main=dialog.querySelector('[name=amount]');
  let total=0;
  try{total=cents(main.value||'0');}catch{}
  if(!total&&splitSum>0){main.value=decimal(splitSum);total=splitSum;}
  const rem=total-splitSum;
  el.innerHTML=rem>=0
   ?`<b>Распределение чека:</b> выделено ${rub(splitSum)} · в основной категории останется <b>${rub(rem)}</b>`
   :`<span class="negative">Выделено (${rub(splitSum)}) больше общей суммы чека (${rub(total)})!</span> <button type="button" class="small soft" id="takeItemTotal">Сделать общую сумму ${rub(splitSum)}</button>`;
  const take=el.querySelector('#takeItemTotal');
  if(take)take.onclick=()=>{main.value=decimal(splitSum);updateItemTotal();saveDraft();};
 }
 function saveDraft(){if(!dialog.open||dialog.querySelector('form')!==draftForm)return;readItems();try{const fields=Object.fromEntries(new FormData(dialog.querySelector('form')));localStorage.setItem(KEY+'.draft',JSON.stringify({editId:t?.id||null,fields,items,manualTotal,defaults:{planId:d.planId},savedAt:Date.now()}));}catch{if(!draftFailed){draftFailed=true;toast('Не удалось сохранить черновик: проверь свободную память браузера');}}}

 function drawType(){
  readItems();
  const type=dialog.querySelector('[name=type]').value;
  dialog.querySelector('#transferFields').innerHTML=type==='transfer'?`<span>Куда перевести</span><select name="toAccountId">${accountOpts(d.toAccountId)}</select>`:'';
  if(['borrow','lend','repay_out','repay_in'].includes(type)){
   const dir=['borrow','repay_out'].includes(type)?'owe':'owed';
   const canNew=['borrow','lend'].includes(type);
   const list=state.debts.filter(x=>x.direction===dir);
   const defaultNew=canNew&&(d.debtId==='__new__' || !list.length);
   const selectedDebt=defaultNew?'__new__':(d.debtId||list[0]?.id||'');
   dialog.querySelector('#debtFields').innerHTML=
    `<div class="debt-field-header"><span>${type==='lend'?'Кому даёшь в долг':type==='borrow'?'У кого берёшь в долг':'Выбери долг для возврата'}</span>${canNew?`<button type="button" class="small soft" id="btnToggleNewDebt">${selectedDebt==='__new__'&&list.length?'Выбрать из списка':'+ Новый человек'}</button>`:''}</div>`+
    `<select name="debtId" id="txDebtSelect" required>`+
     `${!canNew?'<option value="">Выберите долг</option>':''}`+
     `${list.map(x=>option(x.id,`${x.name} · остаток ${rub(debtRemaining(state,x.id))}`,selectedDebt)).join('')}`+
     `${canNew?option('__new__','➕ Новый человек / создать прямо здесь…',selectedDebt):''}`+
    `</select>`+
    (canNew?`<div id="inlineNewDebtBox" class="inline-debt-box" ${selectedDebt==='__new__'?'':'hidden'}>`+
     `<div class="formgrid">`+
      `${field(type==='lend'?'Имя (кому даёшь в долг)':'Имя (у кого занимаешь)',`<input name="newDebtName" type="text" maxlength="80" placeholder="Например: Максим, коллега" value="${esc(d.newDebtName||'')}" ${selectedDebt==='__new__'?'required':''}>`,true)}`+
      `${field('Когда вернёт / срок · необязательно',`<input name="newDebtDue" type="date" value="${esc(d.newDebtDue||'')}">`)}`+
      `${field('Заметка к долгу · необязательно',`<input name="newDebtNote" type="text" maxlength="120" placeholder="Наличными / до зарплаты" value="${esc(d.newDebtNote||'')}">`)}`+
     `</div>`+
     `<small class="muted">Профиль должника создастся автоматически во вкладке «Счета и долги», а сумма спишется/зачислится по выбранному счёту.</small>`+
    `</div>`:(!list.length?`<span class="muted">Пока нет активных долгов в этом направлении.</span>`:''));
   const sel=dialog.querySelector('#txDebtSelect');
   const box=dialog.querySelector('#inlineNewDebtBox');
   const toggleBtn=dialog.querySelector('#btnToggleNewDebt');
   const syncNewBox=()=>{
    if(!box)return;
    const isNew=sel.value==='__new__';
    box.hidden=!isNew;
    const nameInp=box.querySelector('[name="newDebtName"]');
    if(nameInp){nameInp.required=isNew;if(isNew)setTimeout(()=>nameInp.focus(),30);}
    if(toggleBtn)toggleBtn.textContent=isNew&&list.length?'Выбрать существующего':'+ Новый человек';
   };
   if(sel)sel.onchange=syncNewBox;
   if(toggleBtn)toggleBtn.onclick=()=>{
    if(sel.value==='__new__'&&list.length){sel.value=list[0].id;}
    else{sel.value='__new__';}
    syncNewBox();
   };
  }else{
   dialog.querySelector('#debtFields').innerHTML='';
  }
  dialog.querySelector('#expenseFields').innerHTML=type==='expense'?`<div class="formgrid">${categoryControl('expense','categoryId',d.categoryId)}${field('Важность покупки',`<select name="importance">${importanceOpts(d.importance)}</select>`)}</div>${field('Вычесть из доходов · необязательно',`<select name="deductFromCategoryId"><option value="">Не связывать с доходом</option>${categoryOpts(d.deductFromCategoryId||d.taxForCategoryId,'income')}</select>`)}<label class="checks section"><input type="checkbox" name="isTax" ${d.taxForCategoryId?'checked':''}>Это оплата налога — уменьшить резерв</label><div class="cardhead section"><h3>✂️ Разделить чек на несколько категорий</h3><button class="small soft" type="button" id="addItem">+ Выделить категорию из чека</button></div><div id="itemList" class="items"></div><div id="itemTotal" class="item-total" aria-live="polite" hidden></div>`:'';
  dialog.querySelector('#incomeFields').innerHTML=type==='income'?`<div class="formgrid">${categoryControl('income','incomeCategoryId',d.type==='income'?d.categoryId:state.incomeDefaults.other)}${field('Предварительный налог, % · необязательно',input('taxPercent',d.taxPercent??(d.categoryId===state.incomeDefaults.x5?state.courier.taxPercent??'':''),'number','min="0" max="100" step="0.01"'))}</div><p class="muted">Резерв уменьшает доступные деньги, но не остаток счёта.</p>`:'';
  bindCategoryControl(type,type==='income'?'incomeCategoryId':'categoryId');
  if(type==='expense'){
   drawItems();
   dialog.querySelector('#addItem').onclick=()=>{readItems();items.push({name:'',amount:'',quantity:1,unit:'шт',categoryId:dialog.querySelector('[name=categoryId]').value,importance:dialog.querySelector('[name=importance]').value});drawItems();updateItemTotal();saveDraft();};
   updateItemTotal();
  }
 }
 dialog.querySelector('[name=type]').onchange=drawType;
 drawType();
 if(draftFields){
  for(const [name,value] of Object.entries(draftFields)){
   const el=dialog.querySelector('[name="'+name+'"]');
   if(el){if(el.type==='checkbox')el.checked=value==='on';else if(!['categoryId','incomeCategoryId'].includes(name))el.value=value;}
  }
  const sel=dialog.querySelector('#txDebtSelect');
  if(sel&&draftFields.debtId){sel.value=draftFields.debtId;if(sel.onchange)sel.onchange();}
 }
 dialog.querySelector('[name=amount]').addEventListener('input',()=>{manualTotal=true;updateItemTotal();});
 const draftForm=dialog.querySelector('form');
 dialog.querySelector('form').addEventListener('input',saveDraft);
 dialog.querySelector('form').addEventListener('change',saveDraft);
 window.addEventListener('pagehide',saveDraft,{once:true});
 const draftNote=document.createElement('div');
 draftNote.className='draft-note';
 draftNote.innerHTML='<small class="muted">'+(draft?'Черновик восстановлен. ':'')+'Незавершённый ввод сохраняется.</small><button type="button" class="ghost">Удалить черновик</button>';
 dialog.querySelector('.dialogfoot').before(draftNote);
 draftNote.querySelector('button').onclick=()=>{localStorage.removeItem(KEY+'.draft');dialog.querySelector('form').removeEventListener('input',saveDraft);dialog.querySelector('form').removeEventListener('change',saveDraft);window.removeEventListener('pagehide',saveDraft);dialog.close();};
 if(t)dialog.querySelector('#deleteTx').onclick=()=>{try{mutate(s=>{s.transactions=s.transactions.filter(x=>x.id!==t.id);s.plans.forEach(p=>{if(p.paidTransactionId===t.id)p.paidTransactionId=null;});});localStorage.removeItem(KEY+'.draft');window.removeEventListener('pagehide',saveDraft);dialog.close();toast('Операция удалена');}catch(e){dialog.querySelector('#formError').textContent=e.message;}};
}

function aiExportModal(){const start=new Date(period.from+'T12:00:00'),end=new Date(period.to+'T12:00:00'),len=Math.round((end-start)/86400000)+1;const prevEnd=new Date(start);prevEnd.setDate(prevEnd.getDate()-1);const prevStart=new Date(prevEnd);prevStart.setDate(prevStart.getDate()-len+1);const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;modal('Запрос для любой нейросети',`<p class="muted">Период: ${date(period.from)} — ${date(period.to)}. Сравнение: предыдущие ${len} дней. В запрос войдут названия счетов, долгов, товаров и комментарии — проверь их перед отправкой.</p>${field('Что важно сохранить в бюджете',`<textarea id="priorities" placeholder="Например: не сокращать здоровье и спорт"></textarea>`)}<div class="actions section"><button type="button" class="primary" id="prepareAI">Подготовить JSON</button><button type="button" class="ghost" id="copyAI" disabled>Скопировать</button><button type="button" class="ghost" id="saveAI" disabled>Скачать</button></div><textarea id="requestText" readonly rows="10" class="section" aria-label="JSON запрос"></textarea>`);dialog.querySelector('#prepareAI').onclick=()=>{aiRequest=makeAIRequest(state,period.from,period.to,fmt(prevStart),fmt(prevEnd),dialog.querySelector('#priorities').value);dialog.querySelector('#requestText').value=JSON.stringify(aiRequest,null,2);dialog.querySelector('#copyAI').disabled=false;dialog.querySelector('#saveAI').disabled=false;try{localStorage.setItem(KEY+'.pending',JSON.stringify(aiRequest));}catch{toast('Запрос подготовлен, но не сохранён. Скопируй его сейчас');}};dialog.querySelector('#copyAI').onclick=()=>copy(JSON.stringify(aiRequest,null,2));dialog.querySelector('#saveAI').onclick=()=>download('financier-ai-request-'+period.to+'.json',aiRequest);}
function aiImportModal(){if(!aiRequest){try{aiRequest=JSON.parse(localStorage.getItem(KEY+'.pending'));}catch{}}if(!aiRequest)throw Error('Сначала подготовь запрос нейросети');modal('Ответ нейросети',`<p class="muted">Ожидаем ответ на запрос за ${date(aiRequest.data.period.from)} — ${date(aiRequest.data.period.to)}. JSON проверяется перед сохранением.</p><textarea name="response" rows="14" placeholder='{"schemaVersion":1,...}' required></textarea><button type="button" class="ghost small section" id="repairAI">Скопировать инструкцию для исправления</button>`,f=>{const response=validateAIResponse(f.get('response'),aiRequest);const report={id:uid(),period:aiRequest.data.period,created:new Date().toISOString(),response,request:aiRequest};mutate(s=>s.reports.unshift(report));activeReport=report.id;period=report.period;render();});dialog.querySelector('#repairAI').onclick=()=>copy(JSON.stringify({instruction:'Исправь ответ строго по этой схеме. Ответь только JSON. Денежные суммы — целые копейки. Не добавляй отсутствующие факты.',responseSchema:aiRequest.responseSchema,allowedCategoryIds:aiRequest.data.allowedCategoryIds,invalidResponse:dialog.querySelector('[name=response]').value},null,2));}
function restoreModal(){modal('Восстановить резервную копию',`<p class="muted">Копия заменит текущие данные. Перед восстановлением скачай текущую копию.</p><input type="file" name="file" accept="application/json,.json" required><div class="note" id="restoreStatus">Выбери файл резервной копии Финансиста.</div>`,()=>{if(!restoreModal.pending)throw Error('Дождись проверки файла');const next=restoreModal.pending;validateState(next);storageError='';persist(next);aiRequest=null;localStorage.removeItem(KEY+'.pending');activeReport=null;render();});restoreModal.pending=null;dialog.querySelector('[name=file]').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>20000000)throw Error('Файл слишком большой (до 20 МБ)');restoreModal.pending=null;const data=validateState(JSON.parse(await file.text()));restoreModal.pending=data;dialog.querySelector('#restoreStatus').textContent=`Проверено: ${data.accounts.length} счетов, ${data.transactions.length} операций. Нажми «Сохранить» для замены данных.`;}catch(err){dialog.querySelector('#formError').textContent=err.message;}};}
function demoState(){const s=initialState(),day=today();s.accounts=[{id:'a-card',name:'Основная карта',kind:'card',opening:8600000},{id:'a-cash',name:'Наличные',kind:'cash',opening:750000},{id:'a-save',name:'На отпуск',kind:'savings',opening:4200000}];const daysAgo=n=>{const d=new Date(day+'T12:00:00');d.setDate(d.getDate()-n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};const tx=(id,n,amount,categoryId,importance,note)=>({id,type:'expense',date:daysAgo(n),accountId:'a-card',amount,categoryId,importance,note,createdAt:Date.now()-n*100000,items:[]});s.transactions=[tx('t1',3,385000,'food','essential','Продукты на неделю'),tx('t2',2,145000,'joy','wanted','Ужин с друзьями'),tx('t3',1,48000,'transport','needed','Такси'),tx('t4',0,269000,'home','needed','Для дома')];s.transactions[0].items=[{productId:'p1',name:'Молоко 1 л',quantity:2,unit:'шт',amount:24000,categoryId:'food',importance:'essential'},{productId:'p2',name:'Продукты',quantity:1,unit:'шт',amount:361000,categoryId:'food',importance:'essential'}];s.goals=[{id:'g1',name:'Отпуск без кредитов',accountId:'a-save',target:12000000,due:''}];s.debts=[{id:'d1',name:'Алексей',direction:'owed',opening:500000,due:'',note:'До конца месяца'}];s.budget={income:11000000,savings:1500000,nextIncome:day.slice(0,7)+'-15',caps:{food:2200000,joy:1000000,transport:600000,home:1200000}};s.plans=[{id:'pl1',name:'Аренда квартиры',amount:2800000,date:day.slice(0,7)+'-10',categoryId:'home',paidTransactionId:null}];return validateState(s);}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;});
if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>toast('Офлайн-режим недоступен. Открой приложение по HTTPS или localhost'));
const features=createFeatures({get state(){return state;},get storageError(){return storageError;},esc,field,input,option,modal,mutate,toast,dialog,app,accountOpts,row,bars,trend,categoryOpts,accountModal,transactionModal});
const upgrade=createUpgrade({get state(){return state;},esc,field,input,option,modal,mutate,toast,dialog,app,accountOpts,bars,categoryOpts,features,render,navigate:id=>{view=id;render();window.scrollTo(0,0);},transactionModal});
const daily=createDaily({get state(){return state;},esc,field,input,option,modal,mutate,toast,dialog,app,accountOpts,categoryOpts,upgrade,features,render,navigate:id=>{view=id;render();window.scrollTo(0,0);},transactionModal});
const timeline=createTimeline({get state(){return state;},esc,field,input,option,modal,mutate,dialog,app,accountOpts,categoryOpts,row,daily,upgrade,action,render,transactionModal,navigate:id=>{view=id;render();window.scrollTo(0,0);}});home=timeline.home;planModal=timeline.planModal;accounts=features.accounts;budget=upgrade.budget;settings=()=>daily.themeSettings()+upgrade.settings()+'<section class="flat-section"><div class="section-title"><h2>APK-режим и двойная защита базы</h2><span class="pill essential">IndexedDB активен</span></div><p class="muted">Каждое изменение автоматически дублируется в защищённое хранилище IndexedDB. На телефоне или в APK можно в 1 касание отправить копию себе в «Избранное» Telegram или сохранить в Файлы.</p><div class="actions"><button class="primary" data-action="shareBackup">📤 Отправить копию (Telegram / Файлы)</button><button class="soft" data-action="autoCopies">Автокопии (14 дн.)</button><button class="ghost" data-action="restoreIDB">Восстановить из IndexedDB</button></div></section>';categoryModal=upgrade.categoryModal;debtModal=features.debtModal;const courier=upgrade.courier;
render();

function categoryControl(kind,name,selected){const chosen=state.categories.find(c=>c.id===selected&&c.kind===kind);const roots=state.categories.filter(c=>c.kind===kind&&!c.parentId&&(!c.hidden||c.id===chosen?.id||c.id===chosen?.parentId));const root=chosen?.parentId||chosen?.id||roots[0]?.id;const children=state.categories.filter(c=>c.parentId===root&&(!c.hidden||c.id===selected));return ''+field('Основная категория', '<select data-category-root="'+name+'">'+roots.map(c=>option(c.id,c.name,root)).join('')+'</select>')+field(kind==='expense'?'Категория покупки':'Категория дохода','<select name="'+name+'" data-category-child>'+option(root,state.categories.find(c=>c.id===root)?.name||'Общая',selected===root?root:selected)+children.map(c=>option(c.id,c.name,selected)).join('')+'</select>');}
function bindCategoryControl(kind,name){const root=dialog.querySelector('[data-category-root]'),child=dialog.querySelector('[data-category-child]');if(!root||!child)return;const changeTax=()=>{const tax=dialog.querySelector('[name=taxPercent]');if(tax)tax.value=child.value===state.incomeDefaults.x5?state.courier.taxPercent??'':'';};root.onchange=()=>{child.innerHTML=option(root.value,state.categories.find(c=>c.id===root.value)?.name||'Общая',root.value)+state.categories.filter(c=>c.parentId===root.value&&!c.hidden).map(c=>option(c.id,c.name)).join('');changeTax();};child.onchange=changeTax;dialog.querySelectorAll('[data-recent-category]').forEach(b=>b.onclick=()=>{const c=state.categories.find(c=>c.id===b.dataset.recentCategory);root.value=c.parentId||c.id;root.onchange();child.value=c.id;changeTax();});}

installComfort({state:()=>state,esc,option});
