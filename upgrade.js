import {uid,today,cents,decimal,rub,summary,available,categoryPath,removeCategory,nextPayday,addDays,statementRemaining} from './finance.js';
import {shiftTotals,syncShift,taxReserve,taxAmount,serviceCategory,incomeBreakdown,monthBudget} from './finance-v2.js';

export function createUpgrade(ctx){
 const {esc,field,input,option,modal,mutate,toast,dialog,app,accountOpts}=ctx;
 const state=()=>ctx.state;
 let kind='expense',openRoot=null,incomeMode='all',quickOrders=1;
 const button=(action,label,id='',style='ghost')=>`<button type="button" class="${style}" data-action="${action}" data-id="${esc(id)}">${label}</button>`;
 const section=(title,body,actions='')=>`<section class="flat-section"><div class="section-title"><h2>${title}</h2><div class="actions">${actions}</div></div>${body}</section>`;
 const date=d=>new Date(d+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
 const clock=n=>new Date(n).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
 const listButton=(action,title,subtitle,id='')=>`<button type="button" class="list-button" data-action="${action}" data-id="${esc(id)}"><span><b>${esc(title)}</b><small>${esc(subtitle)}</small></span><span aria-hidden="true">›</span></button>`;

 function more(){
  return '<div class="bento-menu">'+
   ['purchases','forecast','monthly'].map((id,i)=>listButton('navigate',['Покупки и платежи','Прогноз остатка','Итог месяца'][i],['Подтвердить, перенести или отменить','Имеющиеся деньги и сценарий выплат','Доходы, расходы, накопления и долги'][i],id)).join('')+
   ['earnings','quick','recurring'].map((id,i)=>listButton('navigate',['Календарь денег','Быстрые операции','Регулярные платежи'][i],['Доходы, расходы и будущие покупки','Свои кнопки доходов и расходов','Автоматические планы без списания денег'][i],id)).join('')+
   ['budget','reports','categories','settings'].map((id,i)=>listButton('navigate',['Бюджет','Отчёты','Категории','Настройки'][i],['План, сравнение месяцев и доля расходов','Графики, доходы и анализ нейросети','Доходы, расходы и подкатегории','Копии данных, налог X5 и обновление'][i],id)).join('')+
  '</div>';
 }

 function categories(){
  const s=state(),root=s.categories.find(c=>c.id===openRoot&&c.kind===kind);
  return `<div class="segmented">${button('categoryKind','Расходы','expense',kind==='expense'?'primary':'ghost')}${button('categoryKind','Доходы','income',kind==='income'?'primary':'ghost')}</div>${root?section(esc(root.name),`<div class="actions">${button('categoryBack','← Все категории')}${button('editCategoryV2','Изменить категорию',root.id)}</div>`):''}${section(root?'Подкатегории':'Категории',s.categories.filter(c=>c.kind===kind&&(root?c.parentId===root.id:!c.parentId)).map(c=>listButton(root?'editCategoryV2':'openCategory',c.name,`${c.hidden?'Скрыта · ':''}${root?'Нажми для изменения':s.categories.filter(x=>x.parentId===c.id).length+' подкатегорий'}`,c.id)).join('')||'<p class="muted">Пока пусто</p>',button('newCategoryV2','+ Добавить',root?.id||'','primary'))}`;
 }

 function categoryModal(c,parentId=null){
  const s=state(),categoryKind=c?.kind||s.categories.find(p=>p.id===parentId)?.kind||kind;
  const replacement=s.categories.filter(x=>x.kind===categoryKind&&x.id!==c?.id&&x.parentId!==c?.id);
  modal(c?'Изменить категорию':'Новая категория',`<div class="formgrid">${field('Название',input('name',c?.name||'','text','required maxlength="60"'),true)}${field('Основная категория',`<select name="parentId">${option('','Самостоятельная категория',c?.parentId||parentId||'')}${s.categories.filter(p=>p.kind===categoryKind&&!p.parentId&&p.id!==c?.id).map(p=>option(p.id,p.name,c?.parentId||parentId)).join('')}</select>`)}${field('Цвет',input('color',c?.color||'#5d927d','color'))}</div><label class="checks section"><input name="hidden" type="checkbox" ${c?.hidden?'checked':''}>Скрыть из выбора новых операций</label>${categoryKind==='income'?`<label class="checks section"><input name="working" type="checkbox" ${c?.working?'checked':''}>Рабочий доход</label>`:''}${c&&replacement.length?`<details><summary>Удаление с переносом записей</summary><p class="muted">Подкатегории также удаляются. История и связанные вычеты переносятся.</p>${field('Перенести записи в',`<select id="replacement">${replacement.map(x=>option(x.id,categoryPath(s,x.id))).join('')}</select>`)}<button id="deleteCategoryV2" class="danger section" type="button">Удалить с переносом</button></details>`:''}`,f=>mutate(s=>{const name=f.get('name').trim(),parentId=f.get('parentId')||null;if(!name)throw Error('Введите название');if(s.categories.some(x=>x.id!==c?.id&&x.kind===categoryKind&&(x.parentId||null)===parentId&&x.name.toLowerCase()===name.toLowerCase()))throw Error('Такая категория уже существует');const data={id:c?.id||uid(),name,parentId,kind:categoryKind,color:f.get('color'),hidden:f.get('hidden')==='on',working:f.get('working')==='on'};if(c)s.categories[s.categories.findIndex(x=>x.id===c.id)]=data;else s.categories.push(data);}));
  const del=dialog.querySelector('#deleteCategoryV2');if(del)del.onclick=()=>{try{mutate(s=>removeCategory(s,c.id,dialog.querySelector('#replacement').value));if(openRoot===c.id)openRoot=null;dialog.close();ctx.render();toast('Записи перенесены');}catch(e){dialog.querySelector('#formError').textContent=e.message;}};
 }

 function home(){
  const html=ctx.features.home();
  return html.replace('<span>Резерв накоплений',`<span>Резерв налога X5 <b>${rub(taxReserve(state()))}</b></span><span>Резерв накоплений`);
 }

 function activeShiftBanner(){
  const s=state(),active=s.courierShifts.filter(x=>x.startedAt&&!x.endedAt);
  if(!active.length)return '';
  return active.map(x=>{
   const t=shiftTotals(s,x);
   return `<section class="flat-section shift-live-banner"><div class="section-title"><div class="actions"><span class="statusdot"></span><h2>${esc(x.service)} · смена идёт</h2><span class="pill">${t.trips||0} поездок · ${t.orders||0} выдач</span></div><div class="actions">${button('navigate','К пульту смены →','courier','small soft')}</div></div><div class="shift-live-row"><div class="shift-live-amount"><strong>${t.unknown&&!t.earned?'Без суммы':rub(t.earned+t.tips)}</strong><small>заказы ${rub(t.earned)} · чай ${rub(t.tips)}${t.unknown?` · не указано: ${t.unknown}`:''}</small></div><div class="actions">${button('instantTrip1','⚡ +1 выдача',x.id,'small primary')}${button('instantTrip2','+2 выдачи',x.id,'small soft')}${button('delivery','С суммой…',x.id,'small ghost')}${button('tip','+ Чай',x.id,'small ghost')}</div></div></section>`;
  }).join('');
 }

 function comparison(){
  const s=state(),m=monthBudget(s,today(),incomeMode);
  return section('Сравнение с прошлым месяцем',`<p class="muted">${date(today().slice(0,7)+'-01')} — ${date(today())} против ${date(m.previousStart)} — ${date(m.comparableEnd)}; ${m.complete?'Прошлый месяц отмечен полным.':'Учёт прошлого месяца не подтверждён полным — сравнение предварительное.'}</p><div class="compact-stats"><div><span>Сейчас</span><b>${rub(m.current.expense)}</b></div><div><span>За те же дни прошлого месяца</span><b>${rub(m.previous.expense)}</b></div><div><span>Разница</span><b>${m.delta>0?'+':''}${rub(m.delta)}</b></div><div><span>Изменение</span><b>${m.percent===null?'Нет базы':(m.percent>0?'+':'')+m.percent.toFixed(1)+'%'}</b></div></div><div class="segmented">${button('incomeMode','Все доходы','all',incomeMode==='all'?'primary':'ghost')}${button('incomeMode','Только рабочие','work',incomeMode==='work'?'primary':'ghost')}</div><p>Расходы: <b>${m.denominator?(m.current.expense/m.denominator*100).toFixed(1)+'% дохода':'Доход пока не поступал'}</b></p>${s.categories.filter(c=>c.kind==='expense'&&!c.parentId&&(m.current.rootCategory[c.id]||m.previous.rootCategory[c.id])).map(c=>`<div class="row"><span class="row-main">${esc(c.name)}</span><b>${rub(m.current.rootCategory[c.id]||0)}</b><span>${m.denominator?((m.current.rootCategory[c.id]||0)/m.denominator*100).toFixed(1)+'%':'—'}</span></div>`).join('')}`);
 }

 function budget(){
  const s=state(),m=monthBudget(s);
  const effective=s.categories.filter(c=>c.kind==='expense').map(c=>{const cap=s.budget.caps[c.id]??m.suggested[c.id],spent=(c.parentId?m.current.category[c.id]:m.current.rootCategory[c.id])||0;return cap!==undefined&&(cap>0||spent>0||s.budget.caps[c.id]!==undefined)?`<div class="barrow"><div class="bar-label"><span>${esc(categoryPath(s,c.id))}</span><b>${rub(spent)} / ${rub(cap)}</b></div><div class="track"><div class="fill" style="width:${cap?Math.min(100,spent/cap*100):spent?100:0}%;background:${spent>cap?'#b45e50':'#71917a'}"></div></div></div>`:'';}).join('');
  const legacy=ctx.features.budget(),form=legacy.match(/<form id="budgetForm">[\s\S]*?<\/form>/)?.[0]||'',payments=legacy.slice(legacy.indexOf('<section class="flat-section"><div class="section-title"><h2>Предстоящие платежи'));
  return `<div class="actions">${button('navigate','Регулярные платежи','recurring')}</div>`+comparison()+section('Автоматический бюджет',`<p>${m.complete?'Ориентир — расходы за '+m.previousMonth+'. Ниже можно изменить предложенные суммы.':'Недостаточно информации: отметь предыдущий месяц заполненным полностью, когда внесёшь все операции.'}</p>${button('completeMonth',m.complete?'Снять отметку полного месяца':'Месяц '+m.previousMonth+' заполнен полностью',m.previousMonth)}${effective}`)+`<details><summary>Изменить план дохода и лимиты</summary>${form}</details>`+payments;
 }

 function reportExtras(from,to){
  const s=state(),rows=incomeBreakdown(s,from,to);
  return section('Доходы и вычеты',rows.map(r=>`<div class="income-detail"><b>${esc(categoryPath(s,r.id))}</b><div class="row"><span>Получено</span><b>${rub(r.gross)}</b></div><div class="row"><span>Фактические вычеты</span><b>${rub(r.deductions)}</b></div><div class="row"><span>После вычетов</span><b>${rub(r.net)}</b></div>${r.estimatedTax?`<small>Предварительный налог: ${rub(r.estimatedTax)} · оплачено за период: ${rub(r.taxPaid)}</small>`:''}</div>`).join('')||'<p class="muted">За выбранный период доходов нет.</p>')+`<p class="muted">Основные категории включают подкатегории; строки разных уровней не складываются. Налоговая оценка показана отдельно от фактических вычетов.</p>`;
 }

 function settings(){
  const s=state(),legacy=ctx.features.settings();
  return section('Категории',listButton('navigate','Управление категориями','Доходы и расходы','categories'))+section('Налог X5',`<p>Процент: <b>${s.courier.taxPercent===null?'Не задан':s.courier.taxPercent+'%'}</b>. Резерв: <b>${rub(taxReserve(s))}</b>.</p><div class="actions">${button('taxSettings','Настроить')}${button('payTax','Записать оплату налога')}</div><p class="muted">Магнит: дополнительный резерв не создаётся. Изменение процента применяется к новым поступлениям; старые оценки меняются в операции дохода.</p>`)+legacy.slice(legacy.indexOf('<section class="flat-section"><div class="section-title"><h2>Резервные копии')).replace('Финансист 1.1','Финансист 1.6');
 }

 function taxSettings(){
  const s=state();
  modal('Предварительный налог X5',`${field('Процент налога',input('taxPercent',s.courier.taxPercent??'','number','min="0" max="100" step="0.01"'))}<label class="checks section"><input type="checkbox" name="taxTips" ${s.courier.taxTips?'checked':''}>Включать чаевые X5 в предварительный расчёт</label><p class="muted">Это твоя оценка. Пустое поле отключает расчёт. Для старых поступлений процент можно изменить в операции.</p>`,f=>mutate(s=>{s.courier.taxPercent=f.get('taxPercent')===''?null:Number(f.get('taxPercent'));s.courier.taxTips=f.get('taxTips')==='on';}));
 }

 function unconfirmedShiftsTotal(s){
  return s.courierShifts.filter(x=>!s.courierStatements.some(r=>r.service===x.service&&r.from<=x.date&&r.to>=x.date)).reduce((n,x)=>n+shiftTotals(s,x).earned,0);
 }

 function courier(){
  const s=state(),active=s.courierShifts.filter(x=>x.startedAt&&!x.endedAt),closed=s.courierShifts.filter(x=>!x.startedAt||x.endedAt);
  const pending=s.courierStatements.reduce((n,r)=>n+statementRemaining(s,r.id),0);
  const unconfirmed=unconfirmedShiftsTotal(s);
  const x5Active=active.some(x=>x.service==='X5'),magActive=active.some(x=>x.service==='Магнит');

  return `<div class="courier-topbar"><div class="actions">${button('navigate','📅 Календарь денег','earnings','soft')}${button('addShift','+ Смена задним числом','','ghost')}${button('taxSettings','Налог X5'+(s.courier.taxPercent!==null?' ('+s.courier.taxPercent+'%)':''),'','ghost')}</div></div>`+
  `<div class="courier-launchpad">`+
   `<div class="service-card ${x5Active?'is-active':''}"><div class="service-card-head"><div><span class="pill ${x5Active?'essential':''}">${x5Active?'🟢 Смена идёт':'Готов к старту'}</span><h3>X5 Доставка</h3></div><span class="service-badge x5">X5</span></div><p class="muted">Заказ вносится перед выполнением или в 1 тап прямо с пульта смены.</p>${button('startShift',x5Active?'Смена X5 активна ниже':'▶ Начать смену X5','X5','primary')}</div>`+
   `<div class="service-card ${magActive?'is-active':''}"><div class="service-card-head"><div><span class="pill ${magActive?'essential':''}">${magActive?'🟢 Смена идёт':'Готов к старту'}</span><h3>Магнит Доставка</h3></div><span class="service-badge magnit">М</span></div><p class="muted">Можно отмечать выезд в 1 тап, а точную сумму поездки вносить после закрытия.</p>${button('startShift',magActive?'Смена Магнит активна ниже':'▶ Начать смену Магнит','Магнит','soft')}</div>`+
  `</div>`+
  active.map(x=>{
   const t=shiftTotals(s,x);
   const hrs=Math.max(0.1,t.hours||0.1),rate=t.earned?Math.round((t.earned+t.tips)/hrs):0,avgOrder=t.orders?Math.round(t.earned/t.orders):0;
   return `<section class="flat-section shift-cockpit" data-shift-cockpit="${esc(x.id)}">`+
    `<div class="section-title"><div class="actions"><span class="statusdot"></span><h2>Пульт смены · ${esc(x.service)}</h2><span class="pill">Старт ${date(x.date)} в ${clock(x.startedAt)} · ${t.hours.toFixed(1)} ч</span></div><div class="actions">${button('finishShift','⏹ Завершить смену',x.id,'danger small')}</div></div>`+
    `<div class="compact-stats">`+
     `<div><span>Заработано (с чаем)</span><b class="positive">${t.unknown&&!t.earned?'Ждёт сумм':rub(t.earned+t.tips)}</b><small class="muted">${x.service==='X5'&&s.courier.taxPercent?`Чистыми ≈ ${rub(t.net)}`:`Заказы: ${rub(t.earned)}`}</small></div>`+
     `<div><span>Поездки и выдачи</span><b>${t.trips??0} / ${t.orders??0}</b><small class="muted">${avgOrder?`Средняя выдача ≈ ${rub(avgOrder)}`:'Отмечай выдачи ниже'}</small></div>`+
     `<div><span>Темп смены</span><b>${rate?rub(rate)+'/ч':'—'}</b><small class="muted">${t.unknown?`Без суммы: ${t.unknown} поездок`:'Все суммы указаны'}</small></div>`+
     `<div><span>Чаевые за смену</span><b class="positive">${rub(t.tips)}</b><small class="muted">Сразу идут на счёт</small></div>`+
    `</div>`+
    `<div class="quick-trip-box">`+
     `<div class="quick-trip-header"><b>⚡ Быстрая запись поездки (без лишних окон)</b><small class="muted">Выбери число выдач и нажми «+ Записать поездку» (сумму можно указать сразу или позже)</small></div>`+
     `<div class="quick-orders-bar" role="group" aria-label="Число выдач в поездке">`+
      `<span class="label">Выдач:</span>`+
      Array.from({length:7},(_,i)=>`<button type="button" class="${quickOrders===i+1?'primary':'ghost'} small" data-quick-order="${i+1}" data-shift="${esc(x.id)}">${i+1}</button>`).join('')+
     `</div>`+
     `<div class="quick-amount-row">`+
      `<input type="text" inputmode="decimal" data-no-calc="true" data-quick-amount="${esc(x.id)}" placeholder="Сумма за поездку, ₽ (необязательно)">`+
      `<button type="button" class="primary" data-action="quickAddDelivery" data-id="${esc(x.id)}">+ Записать поездку</button>`+
      `<button type="button" class="ghost" data-action="delivery" data-id="${esc(x.id)}" title="Указать другое время или число выдач">Время / Детали</button>`+
     `</div>`+
     `<div class="quick-presets">`+
      `<span class="muted">Быстрая сумма:</span>`+
      [180,240,300,360,450,600].map(v=>`<button type="button" class="small soft" data-preset-amount="${v}" data-shift="${esc(x.id)}">${v} ₽</button>`).join('')+
      `<button type="button" class="small ghost" data-preset-plus="50" data-shift="${esc(x.id)}">+50 ₽</button>`+
      `<button type="button" class="small ghost" data-action="quickAddNoAmount" data-id="${esc(x.id)}">Без суммы (в 1 тап)</button>`+
     `</div>`+
    `</div>`+
    `<div class="quick-tips-bar">`+
     `<span class="label">🍵 Быстрые чаевые на карту/наличные:</span>`+
     `<div class="actions">`+
      [50,100,150,200,300].map(v=>`<button type="button" class="small soft" data-action="quickTip" data-id="${esc(x.id)}|${v}">+${v} ₽</button>`).join('')+
      `${button('tip','Другая сумма / счёт…',x.id,'small ghost')}`+
     `</div>`+
    `</div>`+
    `<div class="shift-trips-section">`+
     `<div class="cardhead"><h3>Поездки текущей смены (${(x.entries||[]).length})</h3>${(x.entries||[]).length?`<button type="button" class="small ghost" data-action="delivery" data-id="${esc(x.id)}">+ Ещё поездка</button>`:''}</div>`+
     `${deliveryList(x)}`+
    `</div>`+
   `</section>`;
  }).join('')+
  section('Конвейер выплат: Смены → Расчётка → Карта',
   `<div class="compact-stats">`+
    `<div><span>Подтверждено к выплате</span><b class="positive">${rub(pending)}</b><small class="muted">По готовым расчёткам</small></div>`+
    `<div><span>Ожидает расчётки (по сменам)</span><b class="expected-text">${rub(unconfirmed)}</b><small class="muted">Ещё не сведено в расчётку</small></div>`+
    `<div><span>Ближайшая выплата</span><b>Чт, ${date(nextPayday(s))}</b><small class="muted">Расчётка — после пн 17:00</small></div>`+
    `<div><span>Резерв налога X5</span><b>${rub(taxReserve(s))}</b><small class="muted">${s.courier.taxPercent===null?'Процент не задан':s.courier.taxPercent+'% с поступлений'}</small></div>`+
   `</div>`+
   `<div class="actions">${button('courierPayout','💰 Получил выплату на счёт','','primary')}${button('addStatement','📋 Внести расчётку','','soft')}${unconfirmed>0?button('autoStatement','✨ Собрать расчётку из смен','','ghost'):''}</div>`
  )+
  section('Расчётки по неделям',[...s.courierStatements].sort((a,b)=>b.to.localeCompare(a.to)).map(r=>{
   const rem=statementRemaining(s,r.id);
   return `<div class="row wrap-row"><div class="row-main"><b>${esc(r.service)} · ${date(r.from)} — ${date(r.to)}</b><small>${rem>0?`Осталось получить: <b class="expected-text">${rub(rem)}</b> из ${rub(r.amount)}`:'✓ Выплачено полностью'}</small></div><b class="amount">${rub(r.amount)}</b><div class="actions">${rem>0?button('statementPayout','Зачислить выплату',r.id,'small primary'):''}${button('editStatement','✎',r.id,'small ghost')}</div></div>`;
  }).join('')||'<p class="muted">После понедельника 17:00 внеси подтверждённую сумму расчётки за прошлую неделю.</p>')+
  section('Завершённые смены',[...closed].sort((a,b)=>b.date.localeCompare(a.date)).map(x=>{
   const t=shiftTotals(s,x);
   const rate=t.hours>0?Math.round((t.earned+t.tips)/t.hours):0;
   return listButton(x.entries?'shiftDetails':'editShift',`${x.service} · ${date(x.date)}`,`Поездок: ${t.trips??'без разбивки'} · выдач: ${t.orders} · ${rub(t.earned)}${t.tips?' + чай '+rub(t.tips):''}${rate?' · '+rub(rate)+'/ч':''}${t.unknown?' · есть поездки без суммы':''}`,x.id);
  }).join('')||'<p class="muted">Здесь появится история завершённых смен с расчётом руб/час.</p>');
 }

 function deliveryList(x){
  const entries=x.entries||[];
  if(!entries.length)return '<p class="muted">Пока нет поездок в этой смене. Нажми «+ Записать поездку» выше.</p>';
  return [...entries].map((e,idx)=>({e,idx})).reverse().map(({e,idx})=>
   `<div class="row trip-row">`+
    `<div class="badge">#${idx+1}</div>`+
    `<div class="row-main">`+
     `<div class="row-title">${e.takenAt?e.takenAt.slice(11,16):'Время не указано'} · <b>${e.orders} ${e.orders===1?'выдача':e.orders<5?'выдачи':'выдач'}</b></div>`+
     `<div class="row-meta">${e.amount===null?'<span class="expected-text">Сумма ещё не указана</span>':'Оценка за поездку'}</div>`+
    `</div>`+
    `<div class="amount ${e.amount===null?'expected-text':'positive'}">${e.amount===null?'—':rub(e.amount)}</div>`+
    `<div class="actions">`+
     `${e.amount===null?`<button type="button" class="small soft" data-action="editDelivery" data-id="${esc(x.id+'|'+e.id)}">+ Сумма ₽</button>`:`<button type="button" class="small ghost" data-action="editDelivery" data-id="${esc(x.id+'|'+e.id)}" aria-label="Изменить поездку">✎</button>`}`+
     `<button type="button" class="small danger" data-action="deleteDelivery" data-id="${esc(x.id+'|'+e.id)}" aria-label="Удалить поездку">×</button>`+
    `</div>`+
   `</div>`
  ).join('');
 }

 function startShift(service){
  if(state().courierShifts.some(x=>x.service===service&&x.startedAt&&!x.endedAt))throw Error('Смена уже начата — пульт ниже');
  if(service==='X5'&&state().courier.taxPercent===null)toast('Налог X5 пока не задан. Настроить можно в любой момент.');
  mutate(s=>s.courierShifts.push({id:uid(),date:today(),service,startedAt:Date.now(),entries:[],earned:0,hours:0,orders:0,taxPercent:service==='X5'?s.courier.taxPercent:0}));
  toast('Смена '+service+' запущена');
 }

 function quickAddDelivery(shiftId,forceNoAmount=false){
  const s=state(),x=s.courierShifts.find(sh=>sh.id===shiftId);
  if(!x)return;
  const amountInput=app.querySelector(`[data-quick-amount="${shiftId}"]`);
  const rawAmount=forceNoAmount?'':(amountInput?.value||'').trim();
  const amount=rawAmount?cents(rawAmount):null;
  const orders=Math.max(1,Math.min(1000,Number(quickOrders)||1));
  mutate(st=>{
   const shift=st.courierShifts.find(sh=>sh.id===shiftId);
   shift.entries.push({id:uid(),orders,packages:0,takenAt:localDatetime(Date.now()),amount});
   syncShift(shift);
  });
  quickOrders=1;
  toast(`Поездка (#${(x.entries?.length||0)+1}, выдач: ${orders})${amount?' на '+rub(amount):' без суммы'} записана`);
 }

 function quickTip(shiftId,rubles){
  const s=state();
  const targetAcc=s.accounts.find(a=>a.kind==='card')||s.accounts.find(a=>a.kind!=='savings');
  if(!targetAcc){toast('Сначала добавь карту или наличные');ctx.features.handleAction('courierPayout','');return;}
  const amount=Number(rubles)*100;
  mutate(st=>{
   const x=st.courierShifts.find(sh=>sh.id===shiftId);
   st.transactions.push({id:uid(),type:'income',amount,date:today(),accountId:targetAcc.id,categoryId:st.incomeDefaults.tips,source:'courierTip',service:x.service,shiftId,taxPercent:x.service==='X5'&&st.courier.taxTips?st.courier.taxPercent:0,note:'Чаевые · '+x.service,createdAt:Date.now()});
  });
  toast(`Чаевые +${rub(amount)} зачислены на «${targetAcc.name}»`);
 }

 function autoStatementModal(){
  const s=state();
  const unconfirmed=s.courierShifts.filter(x=>!s.courierStatements.some(r=>r.service===x.service&&r.from<=x.date&&r.to>=x.date));
  if(!unconfirmed.length){ctx.features.handleAction('addStatement','');return;}
  const service=unconfirmed[0].service;
  const group=unconfirmed.filter(x=>x.service===service).sort((a,b)=>a.date.localeCompare(b.date));
  const from=group[0].date,to=group.at(-1).date;
  const total=group.reduce((n,x)=>n+shiftTotals(s,x).earned,0);
  modal('Собрать расчётку по сменам',`<div class="formgrid">${field('Период с',input('from',from,'date','required'))}${field('По',input('to',to,'date',`required max="${today()}"`))}${field('Сервис',`<select name="service">${['X5','Магнит'].map(n=>option(n,n,service)).join('')}</select>`)}${field('Подтверждено к выплате, ₽',input('amount',total?decimal(total):'','text','required inputmode="decimal"'))}${field('Комментарий',input('note',`Смен: ${group.length}`),true)}</div><div class="note">Даты и предварительная сумма (${rub(total)}) собраны автоматически из твоих незакрытых смен ${esc(service)}. Уточни итоговую сумму из официальной расчётки.</div>`,f=>mutate(st=>{
   const entry={id:uid(),from:f.get('from'),to:f.get('to'),service:f.get('service').trim(),amount:cents(f.get('amount')),note:f.get('note').trim(),created:today()};
   st.courierStatements.push(entry);
  }));
 }

 function deliveryModal(shiftId,entryId){
  const x=state().courierShifts.find(x=>x.id===shiftId),e=x.entries.find(e=>e.id===entryId);
  modal(e?'Изменить поездку':'Добавить поездку · '+esc(x.service),`<span class="label">Количество выдач</span><div class="order-keypad">${Array.from({length:7},(_,i)=>`<button type="button" data-count="${i+1}" class="${(e?.orders||1)===i+1?'primary':'ghost'}">${i+1}</button>`).join('')}<button type="button" id="otherCount" class="ghost">Другое</button></div><div class="formgrid section"><label class="field" id="customOrderCount" ${e?.orders>7?'':'hidden'}><span>Количество выдач</span>${input('orders',e?.orders||1,'number','required min="1" max="1000"')}</label>${field('Время взятия',input('takenAt',e?.takenAt||(!e?localDatetime(Date.now()):''),'datetime-local',!e?'required':''))}${field('Примерная общая сумма, ₽',input('amount',e?.amount?decimal(e.amount):'','text','inputmode="decimal"'),true)}</div><p class="muted">Сумма за всю поездку, без умножения на выдачи. Можно оставить пустой, если оплата неизвестна. В Магните укажи время взятия вручную, если записываешь после доставки.</p>${e?'<button type="button" class="danger" id="undoDelivery">Убрать ошибочную запись</button>':''}`,f=>mutate(s=>{const shift=s.courierShifts.find(x=>x.id===shiftId);const data={id:e?.id||uid(),orders:Number(f.get('orders')),packages:e?.packages||0,takenAt:f.get('takenAt')||null,amount:f.get('amount').trim()?cents(f.get('amount')):null};if(e)shift.entries[shift.entries.findIndex(x=>x.id===entryId)]=data;else shift.entries.push(data);syncShift(shift);}));
  dialog.querySelectorAll('[data-count]').forEach(b=>b.onclick=()=>{dialog.querySelector('#customOrderCount').hidden=true;dialog.querySelector('[name=orders]').value=b.dataset.count;dialog.querySelectorAll('[data-count]').forEach(p=>p.className=p===b?'primary':'ghost');dialog.querySelector('[name=amount]').focus();});
  dialog.querySelector('#otherCount').onclick=()=>{dialog.querySelector('#customOrderCount').hidden=false;dialog.querySelector('[name=orders]').focus();dialog.querySelector('[name=orders]').select();};
  const undo=dialog.querySelector('#undoDelivery');if(undo)undo.onclick=()=>{mutate(s=>{const shift=s.courierShifts.find(x=>x.id===shiftId);shift.entries=shift.entries.filter(x=>x.id!==entryId);syncShift(shift);});dialog.close();toast('Запись убрана');};
 }

 function tipModal(id){
  if(!state().accounts.length){ctx.features.handleAction('courierPayout','');return;}
  modal('Полученные чаевые',`<div class="formgrid">${field('Сумма, ₽',input('amount','','text','required inputmode="decimal"'))}${field('Куда получил · карта или наличные',`<select name="accountId">${state().accounts.filter(a=>a.kind!=='savings').map(a=>option(a.id,a.name+' · '+(a.kind==='cash'?'наличные':'карта'))).join('')}</select>`)}</div><p class="muted">Это уже полученные деньги. Они записываются один раз и не входят в последующую выплату за заказы.</p>`,f=>mutate(s=>{const x=s.courierShifts.find(x=>x.id===id);s.transactions.push({id:uid(),type:'income',amount:cents(f.get('amount')),date:today(),accountId:f.get('accountId'),categoryId:s.incomeDefaults.tips,source:'courierTip',service:x.service,shiftId:id,taxPercent:x.service==='X5'&&s.courier.taxTips?s.courier.taxPercent:0,note:'Чаевые · '+x.service,createdAt:Date.now()});}));
 }

 function shiftDetails(id,finish=false){
  const x=state().courierShifts.find(x=>x.id===id),t=shiftTotals(state(),x);
  modal(finish?'Завершить смену · '+esc(x.service):'Итог смены · '+esc(x.service),`<div class="shift-total"><span>Примерно заработано + чай</span><strong>${rub(t.earned+t.tips)}</strong></div><div class="row"><span>Заказы</span><b>${rub(t.earned)}</b></div><div class="row"><span>Полученные чаевые</span><b>${rub(t.tips)}</b></div>${x.service==='X5'?`<div class="row"><span>Предварительный налог</span><b>${x.taxPercent===null?'Процент не задан':rub(t.tax)}</b></div><div class="row"><span>После налоговой оценки, с чаем</span><b>${rub(t.net)}</b></div>`:''}${t.unknown?`<p class="note">Итог неполный: неизвестных сумм ${t.unknown}.</p>`:''}<p>Поездок: ${t.trips??'нет разбивки'} · выдач: ${t.orders} · ${t.hours.toFixed(1)} ч</p><p class="muted">Оплата заказов пока ожидается. Чаевые уже записаны на счёт.</p><label class="field"><span>Время начала</span><input id="shiftStart" type="datetime-local" value="${localDatetime(x.startedAt)}" required></label>${!finish?`<label class="field section"><span>Время завершения</span><input id="shiftEnd" type="datetime-local" value="${localDatetime(x.endedAt)}" required></label>`:''}`,()=>mutate(s=>{const shift=s.courierShifts.find(x=>x.id===id);shift.startedAt=new Date(dialog.querySelector('#shiftStart').value).getTime();shift.date=localDatetime(shift.startedAt).slice(0,10);shift.endedAt=finish?Date.now():new Date(dialog.querySelector('#shiftEnd').value).getTime();syncShift(shift);}));
  if(!finish){const entries=document.createElement('div');entries.className='section';entries.innerHTML=deliveryList(x);dialog.querySelector('#formError').before(entries);entries.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{const [shiftId,entryId]=b.dataset.id.split('|');dialog.close();if(b.dataset.action==='deleteDelivery'){mutate(s=>{const shift=s.courierShifts.find(sh=>sh.id===shiftId);shift.entries=shift.entries.filter(e=>e.id!==entryId);syncShift(shift);});toast('Поездка удалена');}else deliveryModal(shiftId,entryId);});}
 }

 function localDatetime(n){
  const d=new Date(n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
 }

 function afterRender(){
  for(const b of app.querySelectorAll('[data-action=startShift]'))b.disabled=state().courierShifts.some(x=>x.service===b.dataset.id&&x.startedAt&&!x.endedAt);
  app.querySelectorAll('[data-quick-order]').forEach(b=>b.onclick=()=>{
   quickOrders=Number(b.dataset.quickOrder);
   const shiftId=b.dataset.shift;
   app.querySelectorAll(`[data-quick-order][data-shift="${shiftId}"]`).forEach(btn=>{
    btn.className=(Number(btn.dataset.quickOrder)===quickOrders?'primary':'ghost')+' small';
   });
  });
  app.querySelectorAll('[data-preset-amount]').forEach(b=>b.onclick=()=>{
   const inp=app.querySelector(`[data-quick-amount="${b.dataset.shift}"]`);
   if(inp){inp.value=b.dataset.presetAmount;inp.focus();}
  });
  app.querySelectorAll('[data-preset-plus]').forEach(b=>b.onclick=()=>{
   const inp=app.querySelector(`[data-quick-amount="${b.dataset.shift}"]`);
   if(inp){
    const cur=Number(String(inp.value||'0').replace(',','.'))||0;
    inp.value=String(cur+Number(b.dataset.presetPlus));
   }
  });
  app.querySelectorAll('[data-quick-amount]').forEach(inp=>{
   inp.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();quickAddDelivery(inp.dataset.quickAmount);}
   });
  });
  const f=app.querySelector('#budgetForm');
  if(f){
   const m=monthBudget(state());
   for(const c of state().categories.filter(c=>c.kind==='expense')){
    const el=f.querySelector(`[name="cap_${c.id}"]`);
    if(el&&state().budget.caps[c.id]===undefined&&m.complete&&m.suggested[c.id]!==undefined)el.value=decimal(m.suggested[c.id]);
   }
   f.onsubmit=e=>{
    e.preventDefault();
    try{
     const data=new FormData(f);
     mutate(s=>{
      const caps={};
      for(const c of s.categories.filter(c=>c.kind==='expense')){
       const raw=data.get('cap_'+c.id);if(!raw)continue;
       const amount=cents(raw);
       if(s.budget.caps[c.id]!==undefined||!m.complete||c.parentId||amount!==(m.suggested[c.id]??0))caps[c.id]=amount;
      }
      s.budget={...s.budget,income:cents(data.get('income')),savings:cents(data.get('savings')),nextIncome:data.get('nextIncome'),incomeMode:data.get('incomeMode'),caps};
     });
     toast('Бюджет сохранён');
    }catch(err){app.querySelector('#budgetError').textContent=err.message;}
   };
  }
 }

 function handleAction(action,id){
  const s=state();
  switch(action){
   case 'navigate':ctx.navigate(id);return true;
   case 'categoryKind':kind=id;openRoot=null;ctx.render();return true;
   case 'openCategory':openRoot=id;ctx.render();return true;
   case 'categoryBack':openRoot=null;ctx.render();return true;
   case 'newCategoryV2':categoryModal(null,id||null);return true;
   case 'editCategoryV2':categoryModal(s.categories.find(c=>c.id===id));return true;
   case 'incomeMode':incomeMode=id;ctx.render();return true;
   case 'completeMonth':mutate(s=>{s.completedMonths=s.completedMonths.includes(id)?s.completedMonths.filter(m=>m!==id):[...s.completedMonths,id];});return true;
   case 'taxSettings':taxSettings();return true;
   case 'payTax':{let cat=s.categories.find(c=>c.kind==='expense'&&c.name==='Налоги');if(!cat){const newId=uid();mutate(s=>s.categories.push({id:newId,name:'Налоги',kind:'expense',color:'#bc945f'}));cat=state().categories.find(c=>c.id===newId);}ctx.transactionModal(null,{type:'expense',categoryId:cat.id,deductFromCategoryId:state().incomeDefaults.x5,taxForCategoryId:state().incomeDefaults.x5,amount:taxReserve(state()),importance:'essential',note:'Оплата налога X5'});return true;}
   case 'startShift':startShift(id);return true;
   case 'quickAddDelivery':quickAddDelivery(id,false);return true;
   case 'quickAddNoAmount':quickAddDelivery(id,true);return true;
   case 'instantTrip1':quickOrders=1;quickAddDelivery(id,true);return true;
   case 'instantTrip2':quickOrders=2;quickAddDelivery(id,true);return true;
   case 'quickTip':{const [shiftId,rubles]=id.split('|');quickTip(shiftId,rubles);return true;}
   case 'autoStatement':autoStatementModal();return true;
   case 'delivery':deliveryModal(id);return true;
   case 'editDelivery':{const [x,e]=id.split('|');deliveryModal(x,e);return true;}
   case 'deleteDelivery':{const [shiftId,entryId]=id.split('|');mutate(st=>{const shift=st.courierShifts.find(sh=>sh.id===shiftId);if(shift){shift.entries=shift.entries.filter(e=>e.id!==entryId);syncShift(shift);}});toast('Поездка удалена');return true;}
   case 'tip':tipModal(id);return true;
   case 'finishShift':shiftDetails(id,true);return true;
   case 'shiftDetails':shiftDetails(id);return true;
   default:return false;
  }
 }
 return {home,activeShiftBanner,more,categories,categoryModal,budget,courier,settings,reportExtras,afterRender,handleAction};
}
