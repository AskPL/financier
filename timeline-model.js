import {today,addDays,summary,balance,upcomingPayments,nextPayday,statementRemaining,uid,validateTransaction,validDate,IMPORTANCE} from './finance.js';
import {shiftTotals,taxReserve,taxAmount} from './finance-v2.js';
import {earningsCalendar} from './finance-v3.js';

export const pending=p=>!p.paidTransactionId&&p.status!=='cancelled';
export function validateTimeline(s){
 for(const p of s.plans){if(p.status!==undefined&&!['pending','cancelled'].includes(p.status)||p.importance!==undefined&&!Object.hasOwn(IMPORTANCE,p.importance)||p.accountId&&!s.accounts.some(a=>a.id===p.accountId))throw Error('Проверь запланированную покупку');if(p.items?.length)validateTransaction(s,{type:'expense',date:today(),amount:p.amount,accountId:p.accountId||s.accounts[0]?.id,categoryId:p.categoryId,importance:p.importance||'unrated',items:p.items});}
 for(const x of s.courierShifts)for(const e of x.entries||[])if(e.takenAt!==undefined&&e.takenAt!==null&&(!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(e.takenAt)||!validDate(e.takenAt.slice(0,10))||!Number.isFinite(new Date(e.takenAt).getTime())||new Date(e.takenAt).getTime()>Date.now()))throw Error('Проверь время взятия поездки');
 return s;
}
export function planFromExpense(s,tx){
 if(tx.type!=='expense'||tx.date<=today()||!validDate(tx.date))throw Error('Для плана выбери будущую дату расхода');
 validateTransaction(s,{...tx,date:today()});
 const p={id:uid(),name:tx.note||'Запланированная покупка',amount:tx.amount,date:tx.date,accountId:tx.accountId,categoryId:tx.categoryId,importance:tx.importance,items:tx.items,deductFromCategoryId:tx.deductFromCategoryId||null,taxForCategoryId:tx.taxForCategoryId||null,paidTransactionId:null,status:'pending'};s.plans.push(p);return p;
}
export function calendarMoney(s,from,to,mode='received'){
 const work=earningsCalendar(s,from,to),days=work.days.map(d=>({...d,income:0,expense:0,estimate:0,unknown:0,plans:[],payments:[],transactions:[]})),byDate=Object.fromEntries(days.map(d=>[d.date,d]));
 for(const t of s.transactions){const d=byDate[t.date];if(!d)continue;d.transactions.push(t.id);if(t.type==='expense')d.expense+=t.amount;if(t.type==='income'&&(mode==='received'||!['courier','courierTip'].includes(t.source)))d.income+=t.amount;}
 for(const d of days){if(mode==='earned'){d.income+=d.confirmed+d.tips;d.estimate=d.expected;}for(const x of s.courierShifts.filter(x=>x.date===d.date))d.unknown+=shiftTotals(s,x).unknown;}
 for(const p of s.plans.filter(pending)){if(byDate[p.date])byDate[p.date].plans.push(p.id);}
 for(const p of upcomingPayments(s,to)){if(byDate[p.date])byDate[p.date].payments.push(p);}
 const payout=expectedPayouts(s);let payoutDate=nextPayday(s);if(payoutDate<=today())payoutDate=addDays(payoutDate,7);if(byDate[payoutDate]&&!payout.unlinked)byDate[payoutDate].expectedPayment=payout.net;
 return {days,max:Math.max(1,...days.flatMap(d=>[d.income+d.estimate,d.expense])),allocated:mode==='earned'&&work.allocated,income:days.reduce((n,d)=>n+d.income,0),expense:days.reduce((n,d)=>n+d.expense,0),estimate:days.reduce((n,d)=>n+d.estimate,0)};
}
export function expectedPayouts(s){
 const byService={};for(const r of s.courierStatements){byService[r.service]=(byService[r.service]||0)+statementRemaining(s,r.id);}
 let unknown=0;for(const x of s.courierShifts){if(s.courierStatements.some(r=>r.service===x.service&&r.from<=x.date&&r.to>=x.date))continue;const t=shiftTotals(s,x);unknown+=t.unknown;byService[x.service]=(byService[x.service]||0)+t.earned;}
 // Unlinked received payouts cannot be matched to a work period reliably.
 const unlinked=s.transactions.some(t=>t.type==='income'&&t.source==='courier'&&!t.statementId);
 return {gross:Object.values(byService).reduce((n,v)=>n+v,0),net:Object.entries(byService).reduce((n,[service,v])=>n+v-taxAmount(v,s.courier.taxPercent||0),0),unknown,unlinked};
}
export function forecastMoney(s,to,asOf=today()){
 const starting=s.accounts.filter(a=>a.kind!=='savings').reduce((n,a)=>n+balance(s,a.id,asOf),0)-taxReserve(s)-s.budget.savings;
 const obligations=upcomingPayments(s,to),expected=expectedPayouts(s);let payday=nextPayday(s,asOf);if(payday<=asOf)payday=addDays(payday,7);
 let certain=starting,scenario=starting;const rows=[];
 for(let date=asOf;date<=to;date=addDays(date,1)){const due=obligations.filter(p=>(p.date<asOf?asOf:p.date)===date),out=due.reduce((n,p)=>n+p.amount,0),incoming=date===payday&&!expected.unlinked?expected.net:0;certain-=out;scenario+=incoming-out;rows.push({date,certain,scenario,out,incoming,due});}
 return {starting,rows,expected,payday,firstDeficit:rows.find(r=>r.certain<0)?.date};
}
export function monthlyMoney(s,month){
 const from=month+'-01',[y,m]=month.split('-').map(Number),to=new Date(Date.UTC(y,m,0,12)).toISOString().slice(0,10),end=to>today()?today():to,report=summary(s,from,end),work=earningsCalendar(s,from,end);
 const tx=s.transactions.filter(t=>t.date>=from&&t.date<=end),savings=tx.filter(t=>t.type==='transfer').reduce((n,t)=>{const a=s.accounts.find(a=>a.id===t.accountId),b=s.accounts.find(a=>a.id===t.toAccountId);return n+(a?.kind!=='savings'&&b?.kind==='savings'?t.amount:a?.kind==='savings'&&b?.kind!=='savings'?-t.amount:0);},0);
 return {...report,from,to,end,complete:s.completedMonths.includes(month),current:month===today().slice(0,7),savings,repaid:tx.filter(t=>t.type==='repay_out').reduce((n,t)=>n+t.amount,0),remaining:s.accounts.reduce((n,a)=>n+balance(s,a.id,end),0),unpaid:s.courierStatements.filter(r=>r.to>=from&&r.to<=end).reduce((n,r)=>n+statementRemaining(s,r.id),0),expected:work.expected};
}
