import {calculate} from './comfort-model.js';

export function installComfort({state,esc,option}){
 function tryEvalInput(el){
  if(!el||!el.value)return;
  const raw=String(el.value).trim();
  if(/[+\-*/×÷()]/.test(raw.slice(1))){
   try{
    const val=calculate(raw);
    const precision=el.dataset.item==='quantity'||el.name==='hours'?4:2;
    el.value=String(Math.round(val*10**precision)/10**precision);
   }catch{}
  }
 }

 function enhance(root=document){
  for(const child of root.querySelectorAll('select[name="categoryId"]')){
   if(child.hasAttribute('data-category-child')||child.dataset.hierarchy||!child.value)continue;
   const chosen=state().categories.find(c=>c.id===child.value);
   if(chosen)child.dataset.hierarchy=chosen.kind;
  }

  for(const el of root.querySelectorAll('input[inputmode="decimal"]')){
   if(el.dataset.mathReady||el.readOnly||el.disabled)continue;
   el.dataset.mathReady='true';
   // Allow typing +, -, *, / on mobile and desktop while keeping numeric/decimal hint
   el.setAttribute('inputmode','text');
   el.classList.add('math-input');
   if(!el.placeholder)el.placeholder='Сумма или 250+180';

   // Add compact inline operator strip for 1-tap math (+, -, *, =) without modal popup
   if(!el.dataset.noMathBar && el.parentElement && !el.parentElement.querySelector('.inline-math-bar')){
    const bar=document.createElement('div');
    bar.className='inline-math-bar';
    bar.hidden=true;
    bar.innerHTML=['+','−','×','÷','='].map(op=>`<button type="button" tabindex="-1" data-math-op="${op}">${op}</button>`).join('');
    el.after(bar);
    bar.addEventListener('pointerdown',e=>{
     const btn=e.target.closest('[data-math-op]');
     if(!btn)return;
     e.preventDefault(); // keep keyboard open!
     const op=btn.dataset.mathOp;
     if(op==='='){
      tryEvalInput(el);
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
     }else{
      el.value=(el.value||'')+(op==='−'?'-':op);
      el.dispatchEvent(new Event('input',{bubbles:true}));
     }
    });
    el.addEventListener('focus',()=>{bar.hidden=false;});
    el.addEventListener('blur',()=>{
     setTimeout(()=>{bar.hidden=true;},150);
     tryEvalInput(el);
     el.dispatchEvent(new Event('input',{bubbles:true}));
     el.dispatchEvent(new Event('change',{bubbles:true}));
    });
   }else{
    el.addEventListener('blur',()=>{
     tryEvalInput(el);
     el.dispatchEvent(new Event('input',{bubbles:true}));
     el.dispatchEvent(new Event('change',{bubbles:true}));
    });
   }
  }

  for(const child of root.querySelectorAll('select[data-hierarchy]')){
   const current=state().categories.find(c=>c.id===child.value);
   if(child.dataset.hierarchyReady&&current&&current.kind!==child.dataset.hierarchy){
    child._categoryParent?.remove();
    delete child.dataset.hierarchyReady;
    child.dataset.hierarchy=current.kind;
   }
   if(child.dataset.hierarchyReady)continue;
   child.dataset.hierarchyReady='true';
   const s=state(),chosen=s.categories.find(c=>c.id===child.value),kind=child.dataset.hierarchy,rootId=chosen?.parentId||chosen?.id;
   const parent=document.createElement('select');
   parent.setAttribute('aria-label',child.dataset.item?'Основная категория':'Основная категория');
   parent.innerHTML=s.categories.filter(c=>c.kind===kind&&!c.parentId&&(!c.hidden||c.id===rootId)).map(c=>option(c.id,c.name,rootId)).join('');
   child.before(parent);
   child._categoryParent=parent;
   child.setAttribute('aria-label',child.dataset.item?'Подкатегория':'Подкатегория');
   const change=(selected)=>{
    const cat=s.categories.find(c=>c.id===parent.value);
    child.innerHTML=option(cat.id,cat.name,selected||cat.id)+s.categories.filter(c=>c.parentId===cat.id&&(!c.hidden||c.id===selected)).map(c=>option(c.id,c.name,selected)).join('');
   };
   change(chosen?.id);
   parent.onchange=()=>{change();child.dispatchEvent(new Event('change',{bubbles:true}));};
  }
 }

 // Also evaluate any math expressions right before any form submit
 document.addEventListener('submit',e=>{
  if(e.target instanceof HTMLFormElement){
   e.target.querySelectorAll('input.math-input').forEach(tryEvalInput);
  }
 },true);

 const observer=new MutationObserver(()=>enhance());
 observer.observe(document.body,{childList:true,subtree:true});
 enhance();
 return {enhance,tryEvalInput};
}
