import {uid,today,cents,decimal,rub,summary,available,categoryPath,removeCategory,nextPayday,addDays,statementRemaining} from './finance.js';
import {shiftTotals,syncShift,taxReserve,taxAmount,serviceCategory,incomeBreakdown,monthBudget} from './finance-v2.js';

export function createUpgrade(ctx){
 const {esc,field,input,option,modal,mutate,toast,dialog,app,accountOpts,categoryOpts}=ctx;
 const state=()=>ctx.state;
 let kind='expense',openRoot=null,incomeMode='all',quickOrders=1,quickPlusMode=false;
 const button=(action,label,id='',style='ghost')=>`<button type="button" class="${style}" data-action="${action}" data-id="${esc(id)}">${label}</button>`;
 const section=(title,body,actions='')=>`<section class="flat-section"><div class="section-title"><h2>${title}</h2><div class="actions">${actions}</div></div>${body}</section>`;
 const date=d=>new Date(d+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
 const clock=n=>new Date(n).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
 const listButton=(action,title,subtitle,id='')=>`<button type="button" class="list-button" data-action="${action}" data-id="${esc(id)}"><span><b>${esc(title)}</b><small>${esc(subtitle)}</small></span><span aria-hidden="true">›</span></button>`;

 function more(){
  return '<div class="bento-menu">'+
   ['purchases','forecast','monthly'].map((id,i)=>listButton('navigate',['Покупки и платежи','Прогноз остатка','Итог месяца'][i],['Подтвердить, перенести или отменить','Имеющиеся деньги и сценарий выплат','Доходы, расходы, накопления и долги'][i],id)).join('')+
   ['earnings','quick','recurring'].map((id,i)=>listButton('navigate',['Календарь денег','Быстрые операции','Регулярные платежи'][i],['Доходы, расходы и будущие покупки','Свои кнопки доходов и расходов','Автоматические планы без списания денег'][i],id)).join('')+
   ['budget','reports','categories','settings'].map((id,i)=>listButton('navigate',['Бюджет','Отчёты','Категории','Настройки'][i],['Лимиты, сравнение месяцев и доля расходов','Разбор трат, вычеты и выписка для ИИ','Доходы, расходы и подкатегории','Копии данных, налог и обновление'][i],id)).join('')+
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
  return html.replace('<span>Резерв накоплений',`<span>Резерв налога <b>${rub(taxReserve(state()))}</b></span><span>Резерв накоплений`);
 }

 function shiftExpensesTotal(s,x){
  return s.transactions.filter(t=>t.type==='expense'&&t.date===x.date&&(t.shiftId===x.id||t.deductFromCategoryId===s.incomeDefaults.x5)).reduce((n,t)=>n+t.amount,0);
 }

 function activeShiftBanner(){
  const s=state(),active=s.courierShifts.filter(x=>x.startedAt&&!x.endedAt);
  if(!active.length)return '';
  return active.map(x=>{
   const t=shiftTotals(s,x),exp=shiftExpensesTotal(s,x);
   return `<section class="flat-section shift-live-banner"><div class="section-title"><div class="actions"><span class="statusdot"></span><h2>Доставка · смена идёт</h2><span class="pill">${t.trips||0} поездок · ${t.orders||0} выдач · налог ${x.taxPercent??0}%</span></div><div class="actions">${button('navigate','Пульт смены →','courier','small soft')}</div></div><div class="shift-live-row"><div class="shift-live-amount"><strong>${t.unknown&&!t.earned?'Ждёт сумм':rub(t.net-exp)}</strong><small>чистыми · грязными ${rub(t.earned)} · чай ${rub(t.tips)}${exp?` · расход −${rub(exp)}`:''}</small></div><div class="actions">${button('instantTrip1','⚡ +1 выдача',x.id,'small primary')}${button('instantTrip2','+2 выдачи',x.id,'small soft')}${button('shiftExpense','− Расход',x.id,'small ghost')}${button('tip','+ Чай',x.id,'small ghost')}</div></div></section>`;
  }).join('');
 }

 function comparison(){
  const s=state(),m=monthBudget(s,today(),incomeMode);
  return section('Сравнение с прошлым месяцем',`<p class="muted">${date(today().slice(0,7)+'-01')} — ${date(today())} против ${date(m.previousStart)} — ${date(m.comparableEnd)}</p><div class="compact-stats"><div><span>Сейчас</span><b>${rub(m.current.expense)}</b></div><div><span>За те же дни прошлого месяца</span><b>${rub(m.previous.expense)}</b></div><div><span>Разница</span><b class="${m.delta>0?'negative':'positive'}">${m.delta>0?'+':''}${rub(m.delta)}</b></div><div><span>Динамика</span><b>${m.percent===null?'Нет базы':(m.percent>0?'+':'')+m.percent.toFixed(1)+'%'}</b></div></div><div class="segmented">${button('incomeMode','Все доходы','all',incomeMode==='all'?'primary':'ghost')}${button('incomeMode','Только рабочие','work',incomeMode==='work'?'primary':'ghost')}</div><p>Расходы: <b>${m.denominator?(m.current.expense/m.denominator*100).toFixed(1)+'% дохода':'Доход пока не поступал'}</b></p>${s.categories.filter(c=>c.kind==='expense'&&!c.parentId&&(m.current.rootCategory[c.id]||m.previous.rootCategory[c.id])).map(c=>`<div class="row"><span class="row-main">${esc(c.name)}</span><b>${rub(m.current.rootCategory[c.id]||0)}</b><span>${m.denominator?((m.current.rootCategory[c.id]||0)/m.denominator*100).toFixed(1)+'%':'—'}</span></div>`).join('')}`);
 }

 function budget(){
  const s=state(),m=monthBudget(s);
  const effective=s.categories.filter(c=>c.kind==='expense').map(c=>{const cap=s.budget.caps[c.id]??m.suggested[c.id],spent=(c.parentId?m.current.category[c.id]:m.current.rootCategory[c.id])||0;return cap!==undefined&&(cap>0||spent>0||s.budget.caps[c.id]!==undefined)?`<div class="barrow"><div class="bar-label"><span>${esc(categoryPath(s,c.id))}</span><b>${rub(spent)} / ${rub(cap)}</b></div><div class="track"><div class="fill" style="width:${cap?Math.min(100,spent/cap*100):spent?100:0}%;background:${spent>cap?'#b45e50':'#71917a'}"></div></div></div>`:'';}).join('');
  const legacy=ctx.features.budget(),form=legacy.match(/<form id="budgetForm">[\s\S]*?<\/form>/)?.[0]||'',payments=legacy.slice(legacy.indexOf('<section class="flat-section"><div class="section-title"><h2>Предстоящие платежи'));
  return `<div class="actions">${button('navigate','Регулярные платежи','recurring')}</div>`+comparison()+section('Лимиты и автоориентир по прошлому месяцу',`<p class="muted">${m.complete?'Автолимиты рассчитаны по тратам за '+m.previousMonth+'. Ручные лимиты имеют приоритет.':'В прошлом месяце пока нет записанных расходов — задай лимиты вручную ниже.'}</p>${effective||'<p class="muted">Пока нет данных по расходам</p>'}`)+`<details><summary>Настроить план дохода и ручные лимиты</summary>${form}</details>`+payments;
 }

 function reportExtras(from,to){
  const s=state(),rows=incomeBreakdown(s,from,to);
  return section('Доходы и рабочие вычеты (налог, бензин, перекус)',rows.map(r=>`<div class="income-detail"><b>${esc(categoryPath(s,r.id))}</b><div class="row"><span>Получено грязными</span><b>${rub(r.gross)}</b></div><div class="row"><span>Расходы на работе и налоги</span><b>${rub(r.deductions)}</b></div><div class="row"><span>Чистыми на руки</span><b class="positive">${rub(r.net)}</b></div>${r.estimatedTax?`<small>Налоговый резерв за период: ${rub(r.estimatedTax)} · фактически оплачено налога: ${rub(r.taxPaid)}</small>`:''}</div>`).join('')||'<p class="muted">За выбранный период доходов нет.</p>');
 }

 function settings(){
  const s=state(),legacy=ctx.features.settings();
  return section('Категории',listButton('navigate','Управление категориями','Доходы и расходы','categories'))+section('Налог доставки по умолчанию',`<p>Ставка по умолчанию: <b>${s.courier.taxPercent===null?'0%':s.courier.taxPercent+'%'}</b> · Текущий резерв к оплате: <b>${rub(taxReserve(s))}</b>.</p><div class="actions">${button('taxSettings','Изменить % по умолчанию')}${button('payTax','Записать оплату налога')}</div><p class="muted">Процент также можно указать или поменять прямо в начале каждой смены.</p>`)+legacy.slice(legacy.indexOf('<section class="flat-section"><div class="section-title"><h2>Резервные копии')).replace('Финансист 1.1','Финансист 2.0');
 }

 function taxSettings(){
  const s=state();
  modal('Налог доставки по умолчанию',`${field('Процент налога, %',input('taxPercent',s.courier.taxPercent??4,'number','min="0" max="100" step="0.1"'))}<label class="checks section"><input type="checkbox" name="taxTips" ${s.courier.taxTips?'checked':''}>Облагать чаевые налогом</label><p class="muted">Этот процент автоматически подставляется при старте новой смены.</p>`,f=>mutate(s=>{s.courier.taxPercent=f.get('taxPercent')===''?0:Number(f.get('taxPercent'));s.courier.taxTips=f.get('taxTips')==='on';}));
 }

 function unconfirmedShifts(s){
  return s.courierShifts.filter(x=>!s.courierStatements.some(r=>r.from<=x.date&&r.to>=x.date));
 }

 function courier(){
  const s=state(),active=s.courierShifts.filter(x=>x.startedAt&&!x.endedAt),closed=s.courierShifts.filter(x=>!x.startedAt||x.endedAt);
  const pending=s.courierStatements.reduce((n,r)=>n+statementRemaining(s,r.id),0);
  const unconfList=unconfirmedShifts(s);
  const unconfirmed=unconfList.reduce((n,x)=>n+shiftTotals(s,x).earned,0);
  const defaultTax=s.courier.taxPercent??4;

  return `<div class="courier-topbar"><div class="actions">${button('navigate','📅 Календарь денег','earnings','soft')}${button('addShift','+ Смена задним числом','','ghost')}${taxReserve(s)>0?button('payTax','Оплатить налог ('+rub(taxReserve(s))+')','','ghost'):''}</div></div>`+
  (!active.length?
   `<section class="flat-section start-shift-card">`+
    `<div class="section-title"><div><h2>Начать смену доставки</h2><p class="muted">Укажи ставку налога для этой смены и нажми старт</p></div><span class="service-badge x5">🛵</span></div>`+
    `<div class="shift-tax-picker">`+
     `<span class="label">Налог смены, %:</span>`+
     `<div class="tax-preset-btns">`+
      [0,4,6].map(p=>`<button type="button" class="small ${Number(defaultTax)===p?'primary':'ghost'}" data-start-tax-preset="${p}">${p}%</button>`).join('')+
      `<input type="number" id="startShiftTaxInput" value="${esc(defaultTax)}" min="0" max="100" step="0.1" aria-label="Процент налога смены">`+
     `</div>`+
    `</div>`+
    `<button type="button" class="primary courier-order" data-action="startDeliveryShift">▶ Начать смену</button>`+
   `</section>`
  :'')+
  active.map(x=>{
   const t=shiftTotals(s,x);
   const exp=shiftExpensesTotal(s,x);
   const cleanNet=t.net-exp;
   const hrs=Math.max(0.1,t.hours||0.1),rate=(t.earned||t.tips)?Math.round(cleanNet/hrs):0,avgOrder=t.orders?Math.round(t.earned/t.orders):0;
   const is3Plus=quickPlusMode||quickOrders>=3;
   return `<section class="flat-section shift-cockpit" data-shift-cockpit="${esc(x.id)}">`+
    `<div class="section-title"><div class="actions"><span class="statusdot"></span><h2>Смена идёт</h2><span class="pill">с ${clock(x.startedAt)} (${t.hours.toFixed(1)} ч)</span><button type="button" class="small ghost" data-action="editShiftTax" data-id="${esc(x.id)}">Налог: ${x.taxPercent??0}% ✎</button></div><div class="actions">${button('finishShift','⏹ Завершить',x.id,'danger small')}</div></div>`+
    `<div class="compact-stats">`+
     `<div><span>Чистыми на руки</span><b class="${cleanNet<0?'negative':'positive'}">${t.unknown&&!t.earned&&!exp?'Ждёт сумм':rub(cleanNet)}</b><small class="muted">Налог −${rub(t.tax)}${exp?` · расход −${rub(exp)}`:''}</small></div>`+
     `<div><span>Грязными + чай</span><b>${rub(t.earned+t.tips)}</b><small class="muted">Заказы ${rub(t.earned)} · чай ${rub(t.tips)}</small></div>`+
     `<div><span>Поездки / выдачи</span><b>${t.trips??0} / ${t.orders??0}</b><small class="muted">${avgOrder?`≈ ${rub(avgOrder)} за выдачу`:'Отмечай ниже'}</small></div>`+
     `<div><span>Чистый темп</span><b>${rate?rub(rate)+'/ч':'—'}</b><small class="muted">${t.unknown?`Без суммы: ${t.unknown}`:'Все суммы внесены'}</small></div>`+
    `</div>`+
    `<div class="quick-trip-box">`+
     `<div class="quick-trip-toprow">`+
      `<div class="orders-3btn-group" role="group" aria-label="Количество выдач">`+
       `<span class="label">Выдач:</span>`+
       `<button type="button" class="${!is3Plus&&quickOrders===1?'primary':'ghost'}" data-quick-order="1" data-shift="${esc(x.id)}">1</button>`+
       `<button type="button" class="${!is3Plus&&quickOrders===2?'primary':'ghost'}" data-quick-order="2" data-shift="${esc(x.id)}">2</button>`+
       `<button type="button" class="${is3Plus?'primary':'ghost'}" data-quick-order="3+" data-shift="${esc(x.id)}">3+</button>`+
       `<input type="number" id="customQuickOrders_${esc(x.id)}" class="custom-orders-inp" value="${is3Plus?Math.max(3,quickOrders):3}" min="3" max="100" ${is3Plus?'':'hidden'} aria-label="Точное число выдач (3 и более)">`+
      `</div>`+
      `<div class="quick-amount-inline">`+
       `<input type="text" inputmode="decimal" data-no-math-bar="true" data-quick-amount="${esc(x.id)}" placeholder="Сумма ₽ (или пусто)">`+
       `<button type="button" class="primary" data-action="quickAddDelivery" data-id="${esc(x.id)}">+ Записать</button>`+
      `</div>`+
     `</div>`+
     `<div class="quick-presets">`+
      [180,250,320,400,500].map(v=>`<button type="button" class="small soft" data-preset-amount="${v}" data-shift="${esc(x.id)}">${v} ₽</button>`).join('')+
      `<button type="button" class="small ghost" data-preset-plus="50" data-shift="${esc(x.id)}">+50 ₽</button>`+
      `<button type="button" class="small ghost" data-action="quickAddNoAmount" data-id="${esc(x.id)}">Без суммы</button>`+
     `</div>`+
    `</div>`+
    `<div class="quick-tips-bar">`+
     `<div class="actions"><span class="label">🍵 Чай:</span>`+
      [50,100,150,200].map(v=>`<button type="button" class="small soft" data-action="quickTip" data-id="${esc(x.id)}|${v}">+${v} ₽</button>`).join('')+
      `${button('tip','Свой…',x.id,'small ghost')}`+
     `</div>`+
     `<div class="actions">`+
      `${button('shiftExpense','− Расход на смене (еда / бензин / проезд)',x.id,'small ghost')}`+
     `</div>`+
    `</div>`+
    `<div class="shift-trips-section">`+
     `<div class="cardhead"><h3>Поездки смены (${(x.entries||[]).length})</h3>${(x.entries||[]).length?`<button type="button" class="small ghost" data-action="delivery" data-id="${esc(x.id)}">+ Поездка с временем</button>`:''}</div>`+
     `${deliveryList(x)}`+
    `</div>`+
   `</section>`;
  }).join('')+
  section('Выплаты и сверка расчётки',
   `<div class="compact-stats">`+
    `<div><span>К получению по расчёткам</span><b class="positive">${rub(pending)}</b><small class="muted">Подтверждено</small></div>`+
    `<div><span>Накоплено по сменам</span><b class="expected-text">${rub(unconfirmed)}</b><small class="muted">Ждёт расчётки (${unconfList.length} смен)</small></div>`+
    `<div><span>Ближайший четверг</span><b>${date(nextPayday(s))}</b><small class="muted">День выплаты</small></div>`+
    `<div><span>Налоговый резерв</span><b>${rub(taxReserve(s))}</b><small class="muted">Отложено с выплат</small></div>`+
   `</div>`+
   `<div class="actions">${button('courierPayout','💰 Пришла выплата на карту','','primary')}${button('autoStatement','📋 Сверить и внести расчётку','','soft')}</div>`
  )+
  section('Расчётки по неделям',[...s.courierStatements].sort((a,b)=>b.to.localeCompare(a.to)).map(r=>{
   const rem=statementRemaining(s,r.id);
   return `<div class="row wrap-row"><div class="row-main"><b>${date(r.from)} — ${date(r.to)}</b><small>${r.note?esc(r.note)+' · ':''}${rem>0?`Ждёт выплаты: <b class="expected-text">${rub(rem)}</b>`:'✓ Выплачено на счёт'}</small></div><b class="amount">${rub(r.amount)}</b><div class="actions">${rem>0?button('statementPayout','Зачислить на счёт',r.id,'small primary'):''}${button('editStatement','✎',r.id,'small ghost')}</div></div>`;
  }).join('')||'<p class="muted">Когда придёт недельная расчётка, нажми «Сверить и внести расчётку» — приложение само покажет разницу с твоими сменами.</p>')+
  section('История смен',[...closed].sort((a,b)=>b.date.localeCompare(a.date)).map(x=>{
   const t=shiftTotals(s,x),exp=shiftExpensesTotal(s,x),clean=t.net-exp;
   const rate=t.hours>0?Math.round(clean/t.hours):0;
   return listButton(x.entries?'shiftDetails':'editShift',`${date(x.date)} · чистыми ${rub(clean)}`,`Поездок: ${t.trips??'—'} · выдач: ${t.orders} · грязными ${rub(t.earned)}${t.tips?' + чай '+rub(t.tips):''}${exp?' − расход '+rub(exp):''} · налог ${x.taxPercent??0}%${rate?' · '+rub(rate)+'/ч':''}`,x.id);
  }).join('')||'<p class="muted">Здесь появится история твоих смен с чистым заработком и темпом ₽/час.</p>');
 }

 function deliveryList(x){
  const entries=x.entries||[];
  if(!entries.length)return '<p class="muted">Пока нет поездок. Выбери 1, 2 или 3+ выдачи и нажми «+ Записать».</p>';
  return [...entries].map((e,idx)=>({e,idx})).reverse().map(({e,idx})=>
   `<div class="row trip-row">`+
    `<div class="badge">#${idx+1}</div>`+
    `<div class="row-main">`+
     `<div class="row-title">${e.takenAt?e.takenAt.slice(11,16):'Время не указано'} · <b>${e.orders} ${e.orders===1?'выдача':e.orders<5?'выдачи':'выдач'}</b></div>`+
     `<div class="row-meta">${e.amount===null?'<span class="expected-text">Сумма не указана</span>':'Записано'}</div>`+
    `</div>`+
    `<div class="amount ${e.amount===null?'expected-text':'positive'}">${e.amount===null?'—':rub(e.amount)}</div>`+
    `<div class="actions">`+
     `${e.amount===null?`<button type="button" class="small soft" data-action="editDelivery" data-id="${esc(x.id+'|'+e.id)}">+ Сумма ₽</button>`:`<button type="button" class="small ghost" data-action="editDelivery" data-id="${esc(x.id+'|'+e.id)}" aria-label="Изменить поездку">✎</button>`}`+
     `<button type="button" class="small danger" data-action="deleteDelivery" data-id="${esc(x.id+'|'+e.id)}" aria-label="Удалить поездку">×</button>`+
    `</div>`+
   `</div>`
  ).join('');
 }

 function startDeliveryShift(){
  if(state().courierShifts.some(x=>x.startedAt&&!x.endedAt))throw Error('Смена уже запущена');
  const taxInp=app.querySelector('#startShiftTaxInput');
  const rawTax=taxInp?taxInp.value.trim():'';
  const taxPercent=rawTax===''?(state().courier.taxPercent??0):Number(rawTax);
  if(!Number.isFinite(taxPercent)||taxPercent<0||taxPercent>100)throw Error('Укажи налог от 0 до 100%');
  mutate(s=>{
   s.courier.taxPercent=taxPercent;
   s.courierShifts.push({id:uid(),date:today(),service:'X5',startedAt:Date.now(),entries:[],earned:0,hours:0,orders:0,taxPercent});
  });
  toast(`Смена запущена (налог ${taxPercent}%)`);
 }

 function editShiftTaxModal(shiftId){
  const x=state().courierShifts.find(sh=>sh.id===shiftId);
  if(!x)return;
  modal('Налог текущей смены',field('Процент налога, %',input('taxPercent',x.taxPercent??0,'number','min="0" max="100" step="0.1" required')),f=>mutate(s=>{
   const val=Number(f.get('taxPercent'));
   const sh=s.courierShifts.find(item=>item.id===shiftId);
   sh.taxPercent=val;
   s.courier.taxPercent=val;
  }));
 }

 function shiftExpenseModal(shiftId){
  const s=state(),x=s.courierShifts.find(sh=>sh.id===shiftId);
  if(!s.accounts.length){toast('Сначала добавь счёт');return;}
  const defaultAcc=s.accounts.find(a=>a.kind!=='savings')?.id||s.accounts[0].id;
  const defaultCat=s.categories.find(c=>c.kind==='expense'&&['transport','food'].includes(c.id))?.id||s.categories.find(c=>c.kind==='expense')?.id;
  modal('Расход на смене',
   `<div class="formgrid">`+
    field('Сумма, ₽',input('amount','','text','inputmode="decimal" required placeholder="Например: 250"'))+
    field('Что оплатил',input('note','','text','placeholder="Перекус, вода, проезд, бензин…" maxlength="120"'))+
    field('Счёт списания',`<select name="accountId">${accountOpts(defaultAcc)}</select>`)+
    field('Категория расхода',`<select name="categoryId">${categoryOpts(defaultCat,'expense')}</select>`)+
   `</div>`+
   `<div class="quick-presets section"><span class="muted">Быстро:</span>${[['Перекус','food',250],['Вода / кофе','food',120],['Проезд / транспорт','transport',100],['Бензин','transport',1000]].map(([label,cat,amt])=>`<button type="button" class="small soft" data-shift-exp-preset="${label}|${cat}|${amt}">${label} (${amt} ₽)</button>`).join('')}</div>`+
   `<p class="muted">Этот расход спишется со счёта и автоматически вычтется из рабочего дохода смены, чтобы ты видел реальный чистый заработок.</p>`,
   f=>mutate(st=>{
    const amount=cents(f.get('amount'));
    const note=(f.get('note')||'').trim()||'Расход на смене';
    st.transactions.push({
     id:uid(),
     type:'expense',
     date:x?.date||today(),
     accountId:f.get('accountId'),
     amount,
     categoryId:f.get('categoryId'),
     importance:'needed',
     deductFromCategoryId:st.incomeDefaults.x5,
     note,
     items:[],
     createdAt:Date.now()
    });
   })
  );
  dialog.querySelectorAll('[data-shift-exp-preset]').forEach(b=>b.onclick=()=>{
   const [label,cat,amt]=b.dataset.shiftExpPreset.split('|');
   dialog.querySelector('[name="note"]').value=label;
   dialog.querySelector('[name="amount"]').value=amt;
   const catEl=dialog.querySelector('[name="categoryId"]');
   if(catEl&&state().categories.some(c=>c.id===cat))catEl.value=cat;
  });
 }

 function quickAddDelivery(shiftId,forceNoAmount=false){
  const s=state(),x=s.courierShifts.find(sh=>sh.id===shiftId);
  if(!x)return;
  const amountInput=app.querySelector(`[data-quick-amount="${shiftId}"]`);
  const rawAmount=forceNoAmount?'':(amountInput?.value||'').trim();
  const amount=rawAmount?cents(rawAmount):null;
  let orders=quickOrders;
  if(quickPlusMode){
   const customInp=app.querySelector(`#customQuickOrders_${shiftId}`);
   orders=Math.max(1,Math.min(1000,Number(customInp?.value)||3));
  }
  mutate(st=>{
   const shift=st.courierShifts.find(sh=>sh.id===shiftId);
   shift.entries.push({id:uid(),orders,packages:0,takenAt:localDatetime(Date.now()),amount});
   syncShift(shift);
  });
  quickOrders=1;
  quickPlusMode=false;
  toast(`Поездка (#${(x.entries?.length||0)+1}, выдач: ${orders})${amount?' на '+rub(amount):' без суммы'} записана`);
 }

 function quickTip(shiftId,rubles){
  const s=state();
  const targetAcc=s.accounts.find(a=>a.kind==='card')||s.accounts.find(a=>a.kind!=='savings');
  if(!targetAcc){toast('Сначала добавь карту или наличные');ctx.features.handleAction('courierPayout','');return;}
  const amount=Number(rubles)*100;
  mutate(st=>{
   const x=st.courierShifts.find(sh=>sh.id===shiftId);
   st.transactions.push({id:uid(),type:'income',amount,date:today(),accountId:targetAcc.id,categoryId:st.incomeDefaults.tips,source:'courierTip',service:x.service,shiftId,taxPercent:x.taxPercent&&st.courier.taxTips?x.taxPercent:0,note:'Чаевые',createdAt:Date.now()});
  });
  toast(`Чаевые +${rub(amount)} зачислены на «${targetAcc.name}»`);
 }

 function autoStatementModal(){
  const s=state();
  const unconfirmed=unconfirmedShifts(s).sort((a,b)=>a.date.localeCompare(b.date));
  const from=unconfirmed.length?unconfirmed[0].date:addDays(today(),-7);
  const to=unconfirmed.length?unconfirmed.at(-1).date:today();
  const calcForRange=(fDate,tDate)=>s.courierShifts.filter(x=>x.date>=fDate&&x.date<=tDate).reduce((n,x)=>n+shiftTotals(s,x).earned,0);
  const initialTotal=calcForRange(from,to);

  modal('Сверить и внести расчётку',
   `<div class="formgrid">`+
    field('Период с',input('from',from,'date','required id="stmtFrom"'))+
    field('По',input('to',to,'date',`required max="${today()}" id="stmtTo"`))+
    field('Сумма по расчётке, ₽',input('amount',initialTotal?decimal(initialTotal):'','text','required inputmode="decimal" id="stmtAmount"'),true)+
    field('Комментарий · необязательно',input('note',unconfirmed.length?`Смен: ${unconfirmed.length}`:''),true)+
   `</div>`+
   `<div class="note" id="stmtDiffBox">По твоим сменам за этот период: <b>${rub(initialTotal)}</b></div>`,
   f=>mutate(st=>{
    const fDate=f.get('from'),tDate=f.get('to'),amt=cents(f.get('amount'));
    const est=calcForRange(fDate,tDate),diff=amt-est;
    const diffNote=est>0&&diff!==0?` (${diff>0?'+':''}${rub(diff)} к сменам)`:'';
    st.courierStatements.push({
     id:uid(),
     from:fDate,
     to:tDate,
     service:'X5',
     amount:amt,
     note:(f.get('note').trim()+diffNote).trim(),
     created:today()
    });
   })
  );
  const updateDiff=()=>{
   const fDate=dialog.querySelector('#stmtFrom').value;
   const tDate=dialog.querySelector('#stmtTo').value;
   const est=calcForRange(fDate,tDate);
   let entered=0;
   try{entered=cents(dialog.querySelector('#stmtAmount').value||'0');}catch{}
   const diff=entered-est;
   const box=dialog.querySelector('#stmtDiffBox');
   if(box){
    box.innerHTML=`По твоим записям смен: <b>${rub(est)}</b>`+(entered>0&&est>0?` · Разница: <b class="${diff>=0?'positive':'negative'}">${diff>=0?'+':''}${rub(diff)} ${diff>0?'(бонус / доплата)':diff<0?'(меньше оценки)':'(совпадает 1 в 1)'}</b>`:'');
   }
  };
  dialog.querySelector('#stmtFrom').onchange=updateDiff;
  dialog.querySelector('#stmtTo').onchange=updateDiff;
  dialog.querySelector('#stmtAmount').addEventListener('input',updateDiff);
  updateDiff();
 }

 function deliveryModal(shiftId,entryId){
  const x=state().courierShifts.find(x=>x.id===shiftId),e=x.entries.find(e=>e.id===entryId);
  const curOrders=e?.orders||1;
  const is3Plus=curOrders>=3;
  modal(e?'Изменить поездку':'Поездка с выбором времени',
   `<div class="orders-3btn-group section"><span class="label">Выдач:</span>`+
    `<button type="button" data-modal-count="1" class="${curOrders===1?'primary':'ghost'}">1</button>`+
    `<button type="button" data-modal-count="2" class="${curOrders===2?'primary':'ghost'}">2</button>`+
    `<button type="button" data-modal-count="3+" class="${is3Plus?'primary':'ghost'}">3+</button>`+
   `</div>`+
   `<div class="formgrid section">`+
    `<label class="field" id="customOrderCount" ${is3Plus?'':'hidden'}><span>Точное число выдач</span>${input('orders',curOrders,'number','required min="1" max="1000"')}</label>`+
    `${field('Время взятия',input('takenAt',e?.takenAt||(!e?localDatetime(Date.now()):''),'datetime-local',!e?'required':''))}`+
    `${field('Сумма за поездку, ₽',input('amount',e?.amount?decimal(e.amount):'','text','inputmode="decimal"'),true)}`+
   `</div>`+
   `${e?'<button type="button" class="danger small section" id="undoDelivery">Удалить поездку</button>':''}`,
   f=>mutate(s=>{
    const shift=s.courierShifts.find(x=>x.id===shiftId);
    const data={id:e?.id||uid(),orders:Number(f.get('orders')),packages:e?.packages||0,takenAt:f.get('takenAt')||null,amount:f.get('amount').trim()?cents(f.get('amount')):null};
    if(e)shift.entries[shift.entries.findIndex(x=>x.id===entryId)]=data;
    else shift.entries.push(data);
    syncShift(shift);
   })
  );
  dialog.querySelectorAll('[data-modal-count]').forEach(b=>b.onclick=()=>{
   const v=b.dataset.modalCount;
   dialog.querySelectorAll('[data-modal-count]').forEach(btn=>btn.className=btn===b?'primary':'ghost');
   const wrap=dialog.querySelector('#customOrderCount');
   const inp=dialog.querySelector('[name=orders]');
   if(v==='3+'){
    wrap.hidden=false;
    if(Number(inp.value)<3)inp.value=3;
    inp.focus();
   }else{
    wrap.hidden=true;
    inp.value=v;
    dialog.querySelector('[name=amount]').focus();
   }
  });
  const undo=dialog.querySelector('#undoDelivery');if(undo)undo.onclick=()=>{mutate(s=>{const shift=s.courierShifts.find(x=>x.id===shiftId);shift.entries=shift.entries.filter(x=>x.id!==entryId);syncShift(shift);});dialog.close();toast('Поездка удалена');};
 }

 function tipModal(id){
  if(!state().accounts.length){ctx.features.handleAction('courierPayout','');return;}
  modal('Чаевые на смене',`<div class="formgrid">${field('Сумма, ₽',input('amount','','text','required inputmode="decimal"'))}${field('Куда получил',`<select name="accountId">${state().accounts.filter(a=>a.kind!=='savings').map(a=>option(a.id,a.name+' · '+(a.kind==='cash'?'наличные':'карта'))).join('')}</select>`)}</div>`,f=>mutate(s=>{const x=s.courierShifts.find(x=>x.id===id);s.transactions.push({id:uid(),type:'income',amount:cents(f.get('amount')),date:today(),accountId:f.get('accountId'),categoryId:s.incomeDefaults.tips,source:'courierTip',service:x.service,shiftId:id,taxPercent:x.taxPercent&&s.courier.taxTips?x.taxPercent:0,note:'Чаевые',createdAt:Date.now()});}));
 }

 function shiftDetails(id,finish=false){
  const x=state().courierShifts.find(x=>x.id===id),t=shiftTotals(state(),x),exp=shiftExpensesTotal(state(),x);
  modal(finish?'Завершить смену':'Итог смены · '+date(x.date),
   `<div class="shift-total"><span>Чистыми за смену (с чаем, минус налог и расход)</span><strong>${rub(t.net-exp)}</strong></div>`+
   `<div class="row"><span>Поездки (${t.trips??0} шт. / ${t.orders} выдач)</span><b>${rub(t.earned)}</b></div>`+
   `<div class="row"><span>Чаевые</span><b>${rub(t.tips)}</b></div>`+
   `<div class="row"><span>Налог смены (${x.taxPercent??0}%)</span><b>−${rub(t.tax)}</b></div>`+
   `${exp?`<div class="row"><span>Расходы на смене</span><b>−${rub(exp)}</b></div>`:''}`+
   `${t.unknown?`<p class="note">Не указана сумма у ${t.unknown} поездок.</p>`:''}`+
   `<div class="formgrid section">`+
    `<label class="field"><span>Начало</span><input id="shiftStart" type="datetime-local" value="${localDatetime(x.startedAt)}" required></label>`+
    `${!finish?`<label class="field"><span>Завершение</span><input id="shiftEnd" type="datetime-local" value="${localDatetime(x.endedAt)}" required></label>`:''}`+
   `</div>`,
   ()=>mutate(s=>{
    const shift=s.courierShifts.find(x=>x.id===id);
    shift.startedAt=new Date(dialog.querySelector('#shiftStart').value).getTime();
    shift.date=localDatetime(shift.startedAt).slice(0,10);
    shift.endedAt=finish?Date.now():new Date(dialog.querySelector('#shiftEnd').value).getTime();
    syncShift(shift);
   })
  );
  if(!finish){
   const entries=document.createElement('div');
   entries.className='section';
   entries.innerHTML=deliveryList(x);
   dialog.querySelector('#formError').before(entries);
   entries.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{
    const [shiftId,entryId]=b.dataset.id.split('|');
    dialog.close();
    if(b.dataset.action==='deleteDelivery'){mutate(s=>{const shift=s.courierShifts.find(sh=>sh.id===shiftId);shift.entries=shift.entries.filter(e=>e.id!==entryId);syncShift(shift);});toast('Поездка удалена');}
    else deliveryModal(shiftId,entryId);
   });
  }
 }

 function localDatetime(n){
  const d=new Date(n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
 }

 function afterRender(){
  app.querySelectorAll('[data-start-tax-preset]').forEach(b=>b.onclick=()=>{
   const inp=app.querySelector('#startShiftTaxInput');
   if(inp)inp.value=b.dataset.startTaxPreset;
   app.querySelectorAll('[data-start-tax-preset]').forEach(btn=>btn.className='small '+(btn===b?'primary':'ghost'));
  });
  app.querySelectorAll('[data-quick-order]').forEach(b=>b.onclick=()=>{
   const val=b.dataset.quickOrder;
   const shiftId=b.dataset.shift;
   const customInp=app.querySelector(`#customQuickOrders_${shiftId}`);
   if(val==='3+'){
    quickPlusMode=true;
    quickOrders=Number(customInp?.value)||3;
    if(customInp){customInp.hidden=false;customInp.focus();customInp.select();}
   }else{
    quickPlusMode=false;
    quickOrders=Number(val);
    if(customInp)customInp.hidden=true;
   }
   app.querySelectorAll(`[data-quick-order][data-shift="${shiftId}"]`).forEach(btn=>{
    btn.className=(btn===b?'primary':'ghost');
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
   case 'payTax':{let cat=s.categories.find(c=>c.kind==='expense'&&c.name==='Налоги');if(!cat){const newId=uid();mutate(s=>s.categories.push({id:newId,name:'Налоги',kind:'expense',color:'#bc945f'}));cat=state().categories.find(c=>c.id===newId);}ctx.transactionModal(null,{type:'expense',categoryId:cat.id,deductFromCategoryId:state().incomeDefaults.x5,taxForCategoryId:state().incomeDefaults.x5,amount:taxReserve(state()),importance:'essential',note:'Оплата налога'});return true;}
   case 'startDeliveryShift':
   case 'startShift':startDeliveryShift();return true;
   case 'editShiftTax':editShiftTaxModal(id);return true;
   case 'shiftExpense':shiftExpenseModal(id);return true;
   case 'quickAddDelivery':quickAddDelivery(id,false);return true;
   case 'quickAddNoAmount':quickAddDelivery(id,true);return true;
   case 'instantTrip1':quickPlusMode=false;quickOrders=1;quickAddDelivery(id,true);return true;
   case 'instantTrip2':quickPlusMode=false;quickOrders=2;quickAddDelivery(id,true);return true;
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
