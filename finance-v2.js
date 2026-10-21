import {prepareV3,validateV3,syncRecurring} from './finance-v3.js';
// Personal bookkeeping only: tax percentages are user supplied estimates.
import {uid,today,validDate,summary,categoryMatches} from './finance.js';

export function upgradeState(s){
 if(!s.v12Installed){
  for(const c of s.categories)c.kind??='expense';
  const add=(name,parentId=null,working=false)=>{const id=uid();s.categories.push({id,name,parentId,kind:'income',working,color:'#4c876d'});return id;};
  const work=add('Работа',null,true);
  s.incomeDefaults={x5:add('X5',work,true),magnit:add('Магнит',work,true),other:add('Другие доходы'),tips:add('Чаевые',work,true)};
  s.v12Installed=true;
 }
 s.completedMonths??=[];
 s.courier.taxPercent??=null;s.courier.taxTips??=false;
 for(const c of s.categories)c.kind??='expense';
 for(const t of s.transactions)if(t.type==='income'&&!t.categoryId){const service=t.service||s.courierStatements.find(r=>r.id===t.statementId)?.service;t.categoryId=service==='X5'?s.incomeDefaults.x5:service==='Магнит'?s.incomeDefaults.magnit:s.incomeDefaults.other;t.service??=service;}
 prepareV3(s);validateV3(s);return syncRecurring(s);
}
export function serviceCategory(s,service){return service==='X5'?s.incomeDefaults.x5:service==='Магнит'?s.incomeDefaults.magnit:s.incomeDefaults.other;}
export function taxAmount(amount,percent){return Math.round(amount*(percent??0)/100);}
export function taxReserve(s){
 const assessed={};
 for(const t of s.transactions.filter(t=>t.type==='income')){const id=t.source==='courierTip'&&t.service==='X5'?s.incomeDefaults.x5:t.categoryId;assessed[id]=(assessed[id]||0)+taxAmount(t.amount,t.taxPercent);}
 const payments=s.transactions.filter(t=>t.type==='expense'&&t.taxForCategoryId);
 for(const t of payments){let amount=t.amount;for(const id of Object.keys(assessed).filter(id=>categoryMatches(s,id,t.taxForCategoryId))){const used=Math.min(assessed[id],amount);assessed[id]-=used;amount-=used;}}
 return Object.values(assessed).reduce((n,v)=>n+v,0);
}
export function shiftTotals(s,x){
 const entries=x.entries||[];
 const tips=s.transactions.filter(t=>t.shiftId===x.id&&t.source==='courierTip');
 const earned=entries.length?entries.reduce((n,e)=>n+(e.amount??0),0):(x.earned??0);
 const tipTotal=tips.reduce((n,t)=>n+t.amount,0);
 const estimatedTax=taxAmount(earned,x.taxPercent??(x.service==='X5'?s.courier.taxPercent:0))+tips.reduce((n,t)=>n+taxAmount(t.amount,t.taxPercent),0);
 return {trips:x.entries?entries.length:null,unknown:x.entries?entries.filter(e=>e.amount===null).length:x.earned===null?1:0,earned,tips:tipTotal,tax:estimatedTax,net:earned+tipTotal-estimatedTax,orders:entries.length?entries.reduce((n,e)=>n+e.orders,0):x.orders,packages:entries.reduce((n,e)=>n+(e.packages||0),0),hours:x.startedAt?Math.max(0,((x.endedAt||Date.now())-x.startedAt)/3600000):x.hours};
}
export function syncShift(x){const entries=x.entries||[];x.earned=entries.reduce((n,e)=>n+(e.amount??0),0);x.orders=entries.reduce((n,e)=>n+e.orders,0);x.hours=x.endedAt?Math.round((x.endedAt-x.startedAt)/36000)/100:0;}
export function incomeBreakdown(s,from,to){
 return s.categories.filter(c=>c.kind==='income').map(c=>{
  const income=s.transactions.filter(t=>t.type==='income'&&t.date>=from&&t.date<=to&&categoryMatches(s,t.categoryId,c.id));
  const deductions=s.transactions.filter(t=>t.type==='expense'&&t.date>=from&&t.date<=to&&categoryMatches(s,t.deductFromCategoryId||t.taxForCategoryId,c.id)).reduce((n,t)=>n+t.amount,0);
  const gross=income.reduce((n,t)=>n+t.amount,0),estimatedTax=income.reduce((n,t)=>n+taxAmount(t.amount,t.taxPercent),0);
  const taxPaid=s.transactions.filter(t=>t.type==='expense'&&t.date>=from&&t.date<=to&&categoryMatches(s,t.taxForCategoryId,c.id)).reduce((n,t)=>n+t.amount,0);
  return {id:c.id,gross,deductions,net:gross-deductions,estimatedTax,taxPaid};
 }).filter(c=>c.gross||c.deductions);
}
export function monthBudget(s,asOf=today(),incomeMode='all'){
 const [y,m,day]=asOf.split('-').map(Number),previousEnd=new Date(Date.UTC(y,m-1,0,12)).toISOString().slice(0,10);
 const previousMonth=previousEnd.slice(0,7),previousStart=previousMonth+'-01';
 const comparableEnd=previousMonth+'-'+String(Math.min(day,Number(previousEnd.slice(-2)))).padStart(2,'0');
 const current=summary(s,asOf.slice(0,7)+'-01',asOf),previous=summary(s,previousStart,comparableEnd),full=summary(s,previousStart,previousEnd);
 const complete=s.completedMonths.includes(previousMonth)||full.expense>0;
 const denominator=s.transactions.filter(t=>t.type==='income'&&t.date>=asOf.slice(0,7)+'-01'&&t.date<=asOf&&(incomeMode==='all'||s.categories.find(c=>c.id===t.categoryId)?.working||s.categories.find(c=>c.id===s.categories.find(x=>x.id===t.categoryId)?.parentId)?.working)).reduce((n,t)=>n+t.amount,0);
 return {current,previous,previousMonth,previousStart,previousEnd,comparableEnd,complete,denominator,suggested:complete?full.rootCategory:{},delta:current.expense-previous.expense,percent:previous.expense?100*(current.expense-previous.expense)/previous.expense:null};
}
export function validateV2(s){
 const money=n=>Number.isSafeInteger(n)&&n>=0,percent=n=>n===null||Number.isFinite(n)&&n>=0&&n<=100;
 if(!percent(s.courier.taxPercent)||typeof s.courier.taxTips!=='boolean')throw Error('Налог: введи процент от 0 до 100');
 if(!Array.isArray(s.completedMonths)||s.completedMonths.some(m=>!/^\d{4}-\d{2}$/.test(m)||!validDate(m+'-01')||m>=today().slice(0,7)))throw Error('Полным можно отметить только завершённый месяц');
 for(const c of s.categories){if(!['income','expense'].includes(c.kind)||c.parentId&&s.categories.find(p=>p.id===c.parentId)?.kind!==c.kind)throw Error('Категории доходов и расходов разделены');}
 for(const id of Object.keys(s.budget.caps))if(s.categories.find(c=>c.id===id)?.kind!=='expense')throw Error('Лимит задаётся для категории расходов');
 for(const t of s.transactions){
  if(['expense','income'].includes(t.type))for(const id of t.type==='expense'&&t.items?.length?t.items.map(i=>i.categoryId):[t.categoryId])if(s.categories.find(c=>c.id===id)?.kind!==t.type)throw Error('Выбери категорию для этого типа операции');
  if(t.taxPercent!==undefined&&!percent(t.taxPercent))throw Error('Некорректный процент налога');
  for(const key of ['deductFromCategoryId','taxForCategoryId'])if(t[key]&&(t.type!=='expense'||s.categories.find(c=>c.id===t[key])?.kind!=='income'))throw Error('Вычет должен относиться к категории дохода');
  if(t.taxForCategoryId&&t.deductFromCategoryId&&t.taxForCategoryId!==t.deductFromCategoryId)throw Error('Налог и вычет должны относиться к одному источнику');
  if(t.shiftId&&!s.courierShifts.some(x=>x.id===t.shiftId))throw Error('Не найдена смена для чаевых');
 }
 const active=new Set();
 for(const x of s.courierShifts){
  if(x.startedAt!==undefined){if(!Number.isFinite(x.startedAt)||x.startedAt>Date.now()||x.endedAt!==undefined&&(!Number.isFinite(x.endedAt)||x.endedAt<x.startedAt||x.endedAt>Date.now()))throw Error('Проверь время смены');if(x.endedAt===undefined){if(active.has(x.service))throw Error('Уже есть активная смена этого сервиса');active.add(x.service);}}
  if(x.taxPercent!==undefined&&!percent(x.taxPercent))throw Error('Некорректный налог смены');
  if(x.entries!==undefined){if(!Array.isArray(x.entries)||new Set(x.entries.map(e=>e.id)).size!==x.entries.length)throw Error('Некорректные доставки');for(const e of x.entries)if(!e.id||(e.amount!==null&&(!money(e.amount)||!e.amount))||!Number.isInteger(e.orders)||e.orders<1||e.orders>1000||!Number.isInteger(e.packages)||e.packages<0||e.packages>10000)throw Error('Проверь число заказов, пакетов и сумму');const total=shiftTotals(s,x);if(total.earned!==x.earned||total.orders!==x.orders)throw Error('Итог смены не совпадает с доставками');}
 }
 return s;
}
