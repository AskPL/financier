import {balance,uid,today} from './finance.js';

// Parse arithmetic without evaluating JavaScript or accepting identifiers.
export function calculate(raw){
 const source=String(raw).replace(/,/g,'.').replace(/×/g,'*').replace(/÷/g,'/').replace(/\s/g,'');
 if(!source||source.length>200||/[^\d.+*/()\-]/.test(source))throw Error('Введи выражение');
 let pos=0;
 const atom=()=>{if(source[pos]==='+'){pos++;return atom();}if(source[pos]==='-'){pos++;return -atom();}if(source[pos]==='('){pos++;const v=sum();if(source[pos++]!==')')throw Error('Проверь скобки');return v;}const m=source.slice(pos).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);if(!m)throw Error('Проверь выражение');pos+=m[0].length;return Number(m[0]);};
 const product=()=>{let v=atom();while(['*','/'].includes(source[pos])){const op=source[pos++],n=atom();if(op==='/'&&n===0)throw Error('На ноль делить нельзя');v=op==='*'?v*n:v/n;}return v;};
 const sum=()=>{let v=product();while(['+','-'].includes(source[pos])){const op=source[pos++],n=product();v=op==='+'?v+n:v-n;}return v;};
 const value=sum();if(pos!==source.length||!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER)throw Error('Проверь выражение');return value;
}
export function itemCosts(amount,price,quantity,source='amount'){
 const q=Number(String(quantity).replace(',','.'));if(!Number.isFinite(q)||q<=0)throw Error('Количество должно быть больше нуля');
 const v=Number(String(source==='price'?price:amount).replace(',','.'));if(!Number.isFinite(v)||v<0)throw Error('Проверь стоимость');
 const total=source==='price'?Math.round((v*q+Number.EPSILON)*100):Math.round((v+Number.EPSILON)*100);
 if(!Number.isSafeInteger(total))throw Error('Слишком большая сумма');
 return {amount:(total/100).toFixed(2),price:source==='price'?v.toFixed(2):(total/100/q).toFixed(4).replace(/0+$/,'').replace(/\.$/,''),source};
}
export function setAccountBalance(s,id,target,record){
 if(!Number.isSafeInteger(target))throw Error('Проверь остаток');
 const a=s.accounts.find(a=>a.id===id);if(!a)throw Error('Не найден счёт');
 const delta=target-balance(s,id);if(!delta)return;
 if(record)s.transactions.push({id:uid(),type:delta>0?'adjustment_in':'adjustment_out',amount:Math.abs(delta),date:today(),accountId:id,note:'Корректировка остатка',createdAt:Date.now()});
 else a.opening+=delta;
}
