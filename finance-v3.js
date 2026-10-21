import {uid,today,addDays,validDate,available,statementRemaining} from './finance.js';
import {shiftTotals} from './finance-v2.js';

export function prepareV3(s){s.quickActions??=[];s.recurringPayments??=[];s.appearance??={theme:'auto'};return s;}
export function recurrenceDate(first,interval,index){
 if(interval!=='month')return addDays(first,index*(interval==='week'?7:14));
 const [y,m,day]=first.split('-').map(Number),target=new Date(Date.UTC(y,m-1+index,1,12));
 const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
 target.setUTCDate(Math.min(day,last));return target.toISOString().slice(0,10);
}
export function syncRecurring(s,asOf=today()){
 s.plans=s.plans.filter(p=>!p.recurringId||p.date<=asOf||p.paidTransactionId||s.recurringPayments.some(r=>r.id===p.recurringId&&r.enabled));
 let through=addDays(asOf,120);if(s.budget.nextIncome>through)through=s.budget.nextIncome;
 for(const r of s.recurringPayments){if(!r.enabled)continue;if(!validDate(r.firstDate)||!['week','fortnight','month'].includes(r.interval))continue;
  for(let i=0;i<6000;i++){const date=recurrenceDate(r.firstDate,r.interval,i);if(date>through||r.endDate&&date>r.endDate)break;
   const id=r.id+':'+date;if(r.skippedDates?.includes(date)||s.plans.some(p=>p.id===id))continue;
   s.plans.push({id,name:r.name,amount:r.amount,date,categoryId:r.categoryId,recurringId:r.id,paidTransactionId:null});
  }
 }
 return s;
}
export function freeMoney(s,asOf=today()){
 const a=available(s),days=Math.max(1,Math.ceil((Date.parse(a.end+'T12:00:00Z')-Date.parse(asOf+'T12:00:00Z'))/86400000));
 return {...a,days,perDay:Math.floor(Math.max(0,a.free)/days),deficit:Math.max(0,-a.free)};
}
export function validateV3(s){
 const money=n=>Number.isSafeInteger(n)&&n>0,unique=rows=>Array.isArray(rows)&&rows.every(x=>typeof x.id==='string'&&x.id)&&new Set(rows.map(x=>x.id)).size===rows.length;
 if(!['auto','light','dark'].includes(s.appearance?.theme))throw Error('Некорректная тема');
 if(!unique(s.quickActions)||!unique(s.recurringPayments))throw Error('Некорректные быстрые или регулярные операции');
 for(const q of s.quickActions)if(!q.name?.trim()||!['expense','income'].includes(q.type)||!s.accounts.some(a=>a.id===q.accountId)||!s.categories.some(c=>c.id===q.categoryId&&c.kind===q.type)||(q.amount!==null&&!money(q.amount))||q.type==='expense'&&!['unrated','unnecessary','wanted','needed','essential'].includes(q.importance))throw Error('Проверь счёт, категорию и сумму быстрой операции');
 for(const r of s.recurringPayments)if(!r.name?.trim()||!money(r.amount)||!validDate(r.firstDate)||r.firstDate<addDays(today(),-3650)||!['week','fortnight','month'].includes(r.interval)||r.endDate&&(!validDate(r.endDate)||r.endDate<r.firstDate)||typeof r.enabled!=='boolean'||!s.categories.some(c=>c.id===r.categoryId&&c.kind==='expense')||!Array.isArray(r.skippedDates)||r.skippedDates.some(d=>!validDate(d)))throw Error('Проверь сумму, даты и категорию регулярного платежа');
 return s;
}

// A statement confirms a period. Daily values are explicitly an allocation of
// that total by shift estimates, never additional income or ledger transactions.
export function earningsCalendar(s,from,to,service='all'){
 const accepts=name=>service==='all'||name===service;
 const days={};for(let d=from;d<=to;d=addDays(d,1))days[d]={date:d,confirmed:0,expected:0,tips:0,hasData:false,allocated:false,shifts:[],statements:[]};
 const shifts=s.courierShifts.filter(x=>accepts(x.service));
 for(const x of shifts){const day=days[x.date];if(!day)continue;day.hasData=true;day.shifts.push(x.id);
  const covered=s.courierStatements.some(r=>r.service===x.service&&r.from<=x.date&&r.to>=x.date);
  if(!covered)day.expected+=shiftTotals(s,x).earned;
 }
 for(const r of s.courierStatements.filter(r=>accepts(r.service))){
  const weights={};for(const x of shifts.filter(x=>x.service===r.service&&x.date>=r.from&&x.date<=r.to)){const earned=shiftTotals(s,x).earned;if(earned>0)weights[x.date]=(weights[x.date]||0)+earned;}
  const sum=Object.values(weights).reduce((n,v)=>n+v,0);
  if(!sum){if(days[r.to]){days[r.to].confirmed+=r.amount;days[r.to].hasData=true;days[r.to].statements.push({id:r.id,amount:r.amount,periodOnly:true});}continue;}
  const shares=Object.entries(weights).map(([date,w])=>{const exact=r.amount*w/sum;return {date,amount:Math.floor(exact),remainder:exact-Math.floor(exact)};});
  let remaining=r.amount-shares.reduce((n,p)=>n+p.amount,0);shares.sort((a,b)=>b.remainder-a.remainder||a.date.localeCompare(b.date));for(const p of shares){if(remaining>0){p.amount++;remaining--;}}
  for(const p of shares)if(days[p.date]){const day=days[p.date];day.confirmed+=p.amount;day.hasData=true;day.allocated=true;day.statements.push({id:r.id,amount:p.amount,periodOnly:false});}
 }
 for(const t of s.transactions.filter(t=>t.type==='income'&&t.source==='courierTip'&&accepts(t.service))){const x=shifts.find(x=>x.id===t.shiftId);const day=days[x?.date||t.date];if(day){day.tips+=t.amount;day.hasData=true;}}
 const rows=Object.values(days),confirmed=rows.reduce((n,d)=>n+d.confirmed,0),expected=rows.reduce((n,d)=>n+d.expected,0),tips=rows.reduce((n,d)=>n+d.tips,0);
 const paid=s.transactions.filter(t=>t.type==='income'&&t.source==='courier'&&t.date>=from&&t.date<=to&&accepts(t.service||s.courierStatements.find(r=>r.id===t.statementId)?.service)).reduce((n,t)=>n+t.amount,0);
 return {days:rows,confirmed,expected,tips,paid,total:confirmed+expected+tips,unpaid:s.courierStatements.filter(r=>accepts(r.service)&&r.to>=from&&r.to<=to).reduce((n,r)=>n+statementRemaining(s,r.id),0),allocated:rows.some(d=>d.allocated)};
}
