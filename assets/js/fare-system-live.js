/* Local what-if controls. The published snapshot remains readable without JS. */
(function(root){
 'use strict';
 const A=typeof module!=='undefined'&&module.exports?require('./fare-anomaly.js'):root.FareAnomaly;
 function derive(payload,{policy='any',evidence='fresh'}={}){
  if(!['any','matched'].includes(policy)||!['fresh','single','stale','missing'].includes(evidence))throw new RangeError('Unknown comparison or evidence scenario.');
  const d=payload.data,m={...payload.model,policy,evidenceMode:evidence};
  m.positionUnder=d.cells.filter(r=>(r.own-(policy==='matched'?r.standard:r.basic))*100>r.own).length;
  let checks=d.anomaly.checks.map(r=>({...r,scope:d.anomaly.scope,observedAt:Date.parse(r.time)}));
  if(evidence==='single')checks=checks.slice(-1);
  if(evidence==='stale')checks=checks.map(r=>({...r,observedAt:r.observedAt-3600000,time:new Date(r.observedAt-3600000).toISOString()}));
  if(evidence==='missing')checks=checks.map((r,i)=>i===checks.length-1?{...r,amount:null,valid:false}:r);
  m.activeChecks=checks;
  m.selectedAnomaly={...m.selectedAnomaly,decision:A.assess(m.selectedAnomaly.prediction,checks,{now:Date.parse(d.anomaly.snapshot),scope:d.anomaly.scope})};
  return m;
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={derive};return;}
 const market=document.getElementById('fs-compare'),detail=document.getElementById('fs-product');
 if(!market||!detail)return;
 const state={policy:'any',evidence:'fresh'},D=root.FareDashboard;
 fetch(market.dataset.workspace).then(r=>{if(!r.ok)throw Error('Snapshot unavailable');return r.json();}).then(payload=>{
  function controls(fig,key,label,choices,render){
   const bar=document.createElement('div');bar.className='fs-interaction';
   const title=document.createElement('span');title.className='fs-control-label';title.textContent=label;bar.append(title);
   const group=document.createElement('div');group.className='fs-switch';group.setAttribute('role','group');group.setAttribute('aria-label',label);bar.append(group);
   const status=document.createElement('span');status.className='fs-live-status visually-hidden';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
   const content=fig.querySelector('.fs-technical');
   for(const [value,text] of choices){
    const button=document.createElement('button');button.type='button';button.dataset[key]=value;button.textContent=text;group.append(button);
    button.addEventListener('click',()=>{state[key]=value;draw();});
   }
   fig.insertBefore(bar,content);fig.insertBefore(status,fig.querySelector('figcaption'));
   function draw(){
    const model=derive(payload,state);
    for(const b of group.children)b.setAttribute('aria-pressed',String(b.dataset[key]===state[key]));
    content.innerHTML=render(payload.data,model);
    fig.dataset.interactive='ready';fig.dataset[key]=state[key];
    status.textContent=key==='policy'?(state.policy==='matched'?'Same product: our fare is $30 lower. The discount monitor keeps its own reference.':'Lowest available: our fare is $20 higher.'):
      ({fresh:'Three fresh checks: confirmed price cut.',single:'One fresh check: waiting for confirmation.',stale:'Stale quote: current price unknown; alert held.',missing:'Missing source: current price unknown; alert held.'}[state.evidence]);
   }
   draw();
  }
  controls(market,'policy','Compare products',[['any','Lowest available'],['matched','Same product']],D.overview);
  controls(detail,'evidence','Test the evidence',[['fresh','3 fresh checks'],['single','1 fresh check'],['stale','Stale quote'],['missing','Missing source']],D.investigation);
  root.FareWorkspace={get state(){return {...state};},get model(){return derive(payload,state);}};
 }).catch(()=>{ /* The complete static figures remain available. */ });
})(typeof window!=='undefined'?window:globalThis);
