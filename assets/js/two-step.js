/* Focused SVG views follow the construction of the shopping model. */
(function () {
  'use strict';
  const C=window.TwoStep;
  if(!C)return;
  const $=(s,e=document)=>e.querySelector(s);
  const all=(s,e=document)=>[...e.querySelectorAll(s)];
  const num=(n,d=0)=>n.toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
  const signed=(n,d=0)=>(n>0?'+':n<0?'−':'')+num(Math.abs(n),d);
  const pct=(n,d=0)=>signed(n*100,d)+'%';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const baselineTotal=C.sum(C.mean(0,0));
  const amount=(n,d=0)=>num(n/baselineTotal*100,d)+'%';
  const elapsed=day=>num((1-day/C.edges[0])*100)+'%';
  function mathInline(tex,fallback){
    const expression=String.raw`\displaystyle ${tex}`;
    return `<span class="math-inline" data-tex="${expression.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}">${fallback}</span>`;
  }
  const text=(x,y,s,cls='',anchor='start')=>`<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${s}</text>`;
  const line=(x1,y1,x2,y2,cls='grid')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}"/>`;
  const rect=(x,y,w,h,fill,extra='')=>`<rect x="${x}" y="${y}" width="${Math.max(0,w)}" height="${Math.max(0,h)}" fill="${fill}" ${extra}/>`;
  const circle=(x,y,r,cls='',fill='')=>`<circle cx="${x}" cy="${y}" r="${r}" class="${cls}"${fill?` fill="${fill}"`:''}/>`;
  const path=points=>'M'+points.map(p=>p.map(v=>v.toFixed(2)).join(',')).join('L');
  function svg(w,h,label,body){return `<svg class="ts-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">${body}</svg>`;}
  function shell(fig,title,tag,controls=''){
    const el=document.createElement('div');el.className='ts-body';
    el.innerHTML=`<div class="ts-head"><span class="ts-title">${title}</span></div>${controls}<div class="ts-view"></div><p class="ts-note" aria-live="polite"></p>`;
    fig.insertBefore(el,$('figcaption',fig));fig.classList.add('ready');return el;
  }
  function tabs(name,items,current){return `<div class="tabs" role="group" aria-label="${name}">${items.map(([id,label])=>`<button type="button" data-choice="${id}" aria-pressed="${id===current}">${label}</button>`).join('')}</div>`;}
  function slider(id,label,min,max,step,value){return `<label class="ts-slider" for="${id}"><span>${label}</span><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><output for="${id}"></output></label>`;}
  function legend(items){return `<div class="ts-legend">${items.map(([cls,label])=>`<span class="${cls}"><i aria-hidden="true"></i>${label}</span>`).join('')}</div>`;}
  function selectTab(el,value){all('[data-choice]',el).forEach(b=>b.setAttribute('aria-pressed',b.dataset.choice===value));}
  function observe(el,draw){let old=0;new ResizeObserver(entries=>{const w=Math.round(entries[0].contentRect.width);if(w>0&&w!==old){old=w;draw(w);}}).observe(el);}
  function width(el){return Math.max(260,Math.round(el.getBoundingClientRect().width));}
  function yAxis(x,y,w,h,max,ticks,format=amount){let s='';for(const n of ticks){const yy=y+h-n/max*h;s+=line(x,yy,x+w,yy)+text(x-9,yy+4,format(n),'small','end');}return s;}
  function stat(value,label,cls=''){return `<div class="ts-stat"><strong class="${cls}">${value}</strong><span>${label}</span></div>`;}
  function axisDays(x,y,w,days){let s='';for(const d of days){const xx=x+(78-d)/78*w;s+=line(xx,y,xx,y+4,'axis')+text(xx,y+21,elapsed(d),'small','middle');}return s+text(x+w/2,y+44,'Window elapsed →','small','middle');}
  function periodAxis(x,y,w){return C.mid.map((a,j)=>text(x+w*(j+.5)/8,y,elapsed(a),'small','middle')).join('')+text(x+w/2,y+24,'Position in window (% elapsed)','small','middle');}
  function exposureRail(x,y,w,i){
    return i.map((v,j)=>rect(x+j*w/8+1,y,w/8-2,3,'var(--line-2)','rx="1"')+
      rect(x+j*w/8+1,y,(w/8-2)*v,3,'var(--ts-blue)','rx="1"')).join('');
  }
  function periodInspector(id,selected){
    return `<div class="ts-inspector"><label class="visually-hidden" for="${id}">Inspect interval, fraction of window elapsed</label><select id="${id}">${C.mid.map((day,j)=>`<option value="${j}"${j===selected?' selected':''}>${elapsed(day)}</option>`).join('')}</select><div class="ts-inspector-values" aria-live="polite"></div></div>`;
  }
  function periodHits(x,y,w,h){return C.mid.map((_,j)=>rect(x+j*w/8,y,w/8,h,'transparent',`class="hit" data-period="${j}"`)).join('');}
  function bindInspector(view,id,selected,x,pw,update){
    const select=$('#'+id,view),cursor=$('[data-period-cursor]',view);
    function show(j){
      select.value=j;cursor.setAttribute('x',x+j*pw/8);
      $('.ts-inspector-values',view).innerHTML=update(j);
    }
    all('[data-period]',view).forEach(hit=>{
      const showHit=()=>show(Number(hit.dataset.period));
      hit.addEventListener('pointerenter',showHit);hit.addEventListener('click',showHit);
    });
    select.addEventListener('change',()=>show(Number(select.value)));show(selected);
  }
  function inspectorValue(value,label,cls=''){return `<div class="${cls}"><strong>${value}</strong>${label}</div>`;}

  function inputs(fig,data){
    let mode='today';
    const i=data.sample.exposure,y=data.sample.counts;
    const el=shell(fig,'The reference pattern and searches so far','',tabs('Input view',[['baseline','Baseline'],['today','Observed']],'today'));
    const view=$('.ts-view',el),note=$('.ts-note',el);
    function draw(){
      const today=mode==='today',w=width(view),x=42,pw=w-57,top=40,ph=205,max=300;
      const cx=j=>x+(j+.5)/8*pw,yy=n=>top+ph-n/max*ph;
      let s=text(x,14,today?'Searches so far (% of baseline total)':'Searches (% of baseline total)','small');
      if(today)s+=exposureRail(x,26,pw,i)+rect(x+pw*4.5/8,top,pw*3.5/8,ph,'var(--subtle)');
      s+=yAxis(x,top,pw,ph,max,[0,100,200,300]);
      C.mix.forEach((p,j)=>{
        const value=1000*p*(today?i[j]:1),bw=pw/8*.46;
        s+=rect(cx(j)-bw/2,yy(value),bw,top+ph-yy(value),'var(--ts-fill)','rx="1"');
        if(today&&i[j]>0)s+=circle(cx(j),yy(y[j]),3.5,'point')+text(cx(j),yy(y[j])-10,amount(y[j]),'strong small','middle');
        if(!today)s+=text(cx(j),yy(value)-9,amount(value),'small','middle');
      });
      if(today)s+=text(x+pw*.82,top+17,'Unobserved','small','middle');
      s+=periodAxis(x,top+ph+20,pw);
      view.innerHTML=legend(today?[['bar','Expected so far'],['dots','Recorded searches']]:[['bar','Baseline']])+svg(w,top+ph+54,today?'Expected searches in the elapsed part of each interval, compared with recorded searches. Future intervals are hidden.':'A reference search pattern, before changing the total or when searches arrive.',s);
      note.textContent=today?'Searches arrive faster at the start. The shaded future is still hidden.':'This is the pattern we would expect if nothing unusual happened.';
    }
    function choose(value){mode=value;selectTab(el,mode);draw();}
    all('[data-choice]',el).forEach(b=>b.addEventListener('click',()=>choose(b.dataset.choice)));
    fig.tsAction=a=>{if(a.view)choose(a.view);};
    observe(view,draw);draw();
  }

  function naive(fig,data){
    const sample=data.sample,i=sample.exposure;
    const el=shell(fig,'A single multiplier lifts the whole curve','');
    const view=$('.ts-view',el),note=$('.ts-note',el);
    function draw(){
      const w=width(view),x=42,pw=w-60,top=41,ph=205,max=350,yy=n=>top+ph-n/max*ph,cx=j=>x+(j+.5)/8*pw;
      let s=text(x,14,'Searches (% of baseline total)','small')+exposureRail(x,26,pw,i)+rect(x+pw*4.5/8,top,pw*3.5/8,ph,'var(--subtle)');
      s+=yAxis(x,top,pw,ph,max,[0,100,200,300]);
      const tail=sample.flat.map((value,j)=>[cx(j),yy(value)]).slice(i.findIndex(v=>v<1));
      s+=`<path d="${path(tail)}L${tail.at(-1)[0]},${top+ph}L${tail[0][0]},${top+ph}Z" fill="var(--ts-amber)" opacity=".075"/>`;
      C.mix.forEach((p,j)=>{const value=p*1000,bw=pw/8*.4;s+=rect(cx(j)-bw/2,yy(value),bw,top+ph-yy(value),'var(--ts-fill)');});
      s+=`<path d="${path(sample.flat.map((value,j)=>[cx(j),yy(value)]))}" class="flat"/>`;
      for(const j of [0,3])s+=line(cx(j),yy(sample.flat[j]),cx(j),yy(sample.counts[j]/i[j]),'gap');
      sample.counts.forEach((value,j)=>{if(i[j]>0)s+=circle(cx(j),yy(value/i[j]),3.5,'point');});
      s+=text(x+pw*.82,top+15,'Future','small','middle')+periodAxis(x,top+ph+20,pw);
      const left=w<450?100:124,bw=w-left-49;
      let bars='';
      [['Baseline',C.remaining(C.mean(0,0),i),'var(--ts-base)'],['Single multiplier',C.remaining(sample.flat,i),'var(--ts-amber)']].forEach(([label,value,color],j)=>{
        const y=19+j*32;bars+=text(0,y+5,label)+rect(left,y-7,value/800*bw,14,color)+text(left+value/800*bw+8,y+5,amount(value,1),'strong');
      });
      view.innerHTML=legend([['bar','Baseline'],['amber','One multiplier'],['dots','Observed, adjusted']])+svg(w,top+ph+54,'The first forecast scales every interval equally. Recorded searches arrive earlier than this curve predicts.',s)+`<div class="ts-result"><div class="ts-head"><span class="ts-title">Predicted searches still to come</span></div>${svg(w,70,'Searches still expected, as a share of the reference total, under the baseline and single-multiplier forecast.',bars)}</div>`;
      note.textContent='The multiplier gives every future interval the same increase, even when the early lead is fading.';
    }
    observe(view,draw);draw();
  }

  function knobs(fig,data){
    let v=data.sample.flat_v,theta=0,preset='volume';
    const el=shell(fig,'The total and the timing','EXPECTED COUNTS',
      `<div class="ts-controls">${slider('ts-volume','Total searches',60,180,1,Math.round(Math.exp(v)*100))}${slider('ts-timing','Timing shift',-.045,.045,.001,0)}</div>`);
    const view=$('.ts-view',el),note=$('.ts-note',el),vi=$('#ts-volume',el),ti=$('#ts-timing',el);
    function draw(){
      const w=width(view),mu=C.mean(v,theta),i=C.exposure(22),base=C.mean(0,0);
      const seen=C.dot(mu,i),remaining=C.remaining(mu,i),baseSeen=C.dot(base,i),baseRemaining=C.remaining(base,i);
      $('output[for="ts-volume"]',el).textContent=pct(Math.exp(v)-1);
      $('output[for="ts-timing"]',el).textContent=signed(C.shift(theta)/C.edges[0]*100)+'%';
      vi.setAttribute('aria-valuetext',pct(Math.exp(v)-1)+' change in total searches');
      ti.setAttribute('aria-valuetext',num(Math.abs(C.shift(theta))/C.edges[0]*100)+' percent of the window '+(theta<=0?'earlier':'later'));
      const x=45,y=30,pw=w-62,ph=w<500?225:265,h=y+ph+57,xx=d=>x+(78-d)/78*pw;
      const max=2000,yy=n=>y+ph-n/max*ph;
      const points=[78,...C.edges.slice(1)],model=points.map(d=>[xx(d),yy(C.cumulative(mu,d))]),baseline=points.map(d=>[xx(d),yy(C.cumulative(base,d))]);
      const before=[78,...C.edges.slice(1).filter(d=>d>22),22].map(d=>[xx(d),yy(C.cumulative(mu,d))]);
      const after=[22,...C.edges.slice(1).filter(d=>d<22)].map(d=>[xx(d),yy(C.cumulative(mu,d))]);
      let s=rect(xx(22),y,pw-(xx(22)-x),ph,'var(--subtle)')+text(x,y-13,'Searches so far (% of baseline total)','small');
      s+=yAxis(x,y,pw,ph,max,[0,500,1000,1500,2000]);
      s+=`<path d="${path(model)}L${xx(0)},${yy(0)}L${x},${yy(0)}Z" fill="var(--ts-blue)" opacity=".075"/>`;
      s+=`<path d="${path(baseline)}" class="baseline"/><path d="${path(before)}" class="model"/><path d="${path(after)}" class="model" stroke-dasharray="5 5"/>`;
      s+=line(xx(22),y,xx(22),y+ph,'today')+circle(xx(22),yy(seen),4,'','var(--ts-blue)');
      s+=text(xx(22)-8,y+18,'Now','strong','end')+text((xx(22)+xx(0))/2,y+ph-13,'Still to come','direct small','middle');
      if(Math.abs(C.sum(mu)-1000)<1){
        s+=text(xx(0)-7,yy(C.sum(mu))-12,'M · same total','direct strong','end');
      }else{
        const above=C.sum(mu)>1000,endpointY=yy(C.sum(mu));
        const labelOffset=above&&endpointY>=y+50?-12:19;
        s+=text(xx(0)-7,endpointY+labelOffset,'M = '+amount(C.sum(mu)),'direct blue strong','end');
        s+=text(xx(0)-7,yy(1000)+(above?19:-12),'Baseline total','direct small','end');
      }
      s+=circle(xx(0),yy(C.sum(mu)),3,'','var(--ts-blue)')+axisDays(x,y+ph,pw,w<500?[78,48,22,0]:[78,62,48,36,22,10,0]);
      view.innerHTML=`<div class="ts-stats two">${stat(pct(seen/baseSeen-1),'searches so far','blue')}${stat(pct(remaining/baseRemaining-1),'still to come')}</div>`+
        legend([['blue','Changed curve'],['','Baseline']])+svg(w,h,'Searches added up through time for the reference and changed curves, split at the moment we stop observing.',s);
      let story;
      if(Math.abs(v)<.005&&theta<-.0005)story='The endpoint stays fixed. Today’s extra searches have moved out of the shaded future.';
      else if(Math.abs(theta)<.0005)story='Only the total changes. Searches so far and searches still to come move together.';
      else if(seen>baseSeen&&remaining<baseRemaining)story='The flight looks busier now, yet fewer searches remain. Earlier activity has already used up part of its future.';
      else if(theta>.0005)story='Searches move later, leaving more of the total in the shaded future. Follow the endpoint to see the separate volume change.';
      else story='The endpoint follows the total; the count at Now also follows timing. Trace both to see where the busy start comes from.';
      note.innerHTML=mathInline(String.raw`F\approx${num(seen/C.sum(mu)*100)}\%`,'Fraction already arrived')+' · '+story;
    }
    vi.addEventListener('input',()=>{v=Math.log(Number(vi.value)/100);selectTab(el,'');draw();});
    ti.addEventListener('input',()=>{theta=Number(ti.value);selectTab(el,'');draw();});
    function choose(p){preset=p;v=p==='earlier'?0:data.experiment.volumeLog;theta=p==='volume'?0:data.experiment.timing;vi.value=Math.exp(v)*100;ti.value=theta;selectTab(el,preset);draw();}
    all('[data-choice]',el).forEach(b=>b.addEventListener('click',()=>choose(b.dataset.choice)));
    fig.tsAction=a=>{if(a.preset)choose(a.preset);};observe(view,draw);draw();
  }

  function estimator(fig,data){
    const sample=data.sample,i=sample.exposure,y=sample.counts,n=C.sum(y),fit=C.fit(y,i);
    const el=shell(fig,'Matching the observed arrival times','');
    const view=$('.ts-view',el),note=$('.ts-note',el);
    function draw(){
      const w=width(view),x=42,pw=w-57,top=40,ph=205,max=.4;
      const baseline=C.conditional(0,i),fitted=C.conditional(fit.theta,i),cx=j=>x+(j+.5)/8*pw,yy=v=>top+ph-v/max*ph;
      let s=text(x,14,'Share of recorded searches','small')+exposureRail(x,26,pw,i)+rect(x+pw*4.5/8,top,pw*3.5/8,ph,'var(--subtle)');
      s+=yAxis(x,top,pw,ph,max,[0,.1,.2,.3,.4],v=>num(v*100)+'%');
      baseline.forEach((value,j)=>{const bw=pw/8*.28;s+=rect(cx(j)-bw-1,yy(value),bw,top+ph-yy(value),'var(--ts-fill)')+rect(cx(j)+1,yy(fitted[j]),bw,top+ph-yy(fitted[j]),'var(--ts-blue)');if(i[j]>0)s+=circle(cx(j)+1+bw/2,yy(y[j]/n),3.5,'point');});
      s+=text(x+pw*.82,top+17,'Unobserved','small','middle')+periodAxis(x,top+ph+20,pw);
      const observedMean=1-C.dot(y,C.mid)/n/C.edges[0],fittedMean=1-C.dot(fitted,C.mid)/C.edges[0];
      const railX=82,railW=w-96,averageX=railX+railW*fittedMean;
      let average=line(averageX,10,averageX,58,'gap');
      for(const [label,value,row,color] of [['Recorded',observedMean,20,'var(--fg)'],['Fitted',fittedMean,49,'var(--ts-blue)']]){
        average+=text(0,row+4,label,'small')+line(railX,row,railX+railW,row,'grid');
        average+=`<circle cx="${railX+railW*value}" cy="${row}" r="4" fill="${color}" data-timing-mean="${label.toLowerCase()}" data-position="${value}"/>`;
      }
      average+=text(railX+railW/2,78,'Earlier ← average arrival → later','small','middle');
      view.innerHTML=legend([['bar','Baseline shape'],['blue bar','Fitted timing'],['dots','Observed shares']])+svg(w,top+ph+54,'Fit when searches arrive by comparing their shares across observed intervals, without estimating the total for the whole window yet.',s)+`<div class="ts-mean-summary">${svg(w,87,'The recorded and fitted average arrival times line up.',average)}</div>`;
      note.textContent='';
    }
    observe(view,draw);draw();
  }

  function forecast(fig,data){
    const sample=data.sample,i=sample.exposure;let revealed=false,period=5;
    const fittedShare=C.dot(sample.fitted,i)/C.sum(sample.fitted);
    const el=shell(fig,'Forecasting the remaining searches','',
      '<button type="button" class="btn ts-reveal" aria-pressed="false" aria-controls="ts-future-result">Reveal hidden future</button>');
    const view=$('.ts-view',el),note=$('.ts-note',el),reveal=$('.ts-reveal',el);
    function draw(){
      const w=width(view),x=42,pw=w-60,y=43,ph=230,max=350,yy=v=>y+ph-v/max*ph;
      fig.dataset.future=revealed?'revealed':'hidden';
      reveal.setAttribute('aria-pressed',String(revealed));
      reveal.textContent=revealed?'Hide future again':'Reveal hidden future';
      let s=rect(x+pw*4.5/8,y,pw*3.5/8,ph,'var(--subtle)')+text(x,14,'Searches (% of baseline total)','small')+exposureRail(x,27,pw,i);
      s+=rect(x+period*pw/8,y,pw/8,ph,'var(--ts-blue)','opacity=".055" data-period-cursor="true"');
      s+=yAxis(x,y,pw,ph,max,[0,100,200,300]);
      const center=j=>x+pw*(j+.5)/8,bw=pw/8*.26;
      C.mix.forEach((p,j)=>{
        const base=1000*p,fitted=sample.fitted[j];
        s+=rect(center(j)-bw-1,yy(base),bw,ph-(yy(base)-y),'var(--ts-fill)');
        s+=rect(center(j)+1,yy(fitted),bw,ph-(yy(fitted)-y),'var(--ts-blue)');
      });
      s+=`<path d="${path(sample.flat.map((v,j)=>[center(j),yy(v)]))}" class="flat"/>`;
      if(revealed){
        const firstHidden=i.findIndex(v=>v<1);
        const future=sample.truth.map((v,j)=>[center(j),yy(v)]).slice(firstHidden);
        s+=`<path d="${path(future)}" class="truth" data-known-future="true"/>`;
      }
      sample.counts.forEach((v,j)=>{if(i[j]>0)s+=circle(center(j),yy(v/i[j]),3.5,'point');});
      s+=line(x+pw*4.5/8,y,x+pw*4.5/8,y+ph,'today')+text(x+pw*4.5/8+7,y+15,'Future','small');
      s+=periodAxis(x,y+ph+20,pw)+periodHits(x,y,pw,ph);
      const rows=[['Baseline',C.remaining(C.mean(0,0),i),'var(--ts-base)'],['Scale only',C.remaining(sample.flat,i),'var(--ts-amber)'],['Fitted · R',C.remaining(sample.fitted,i),'var(--ts-blue)']];
      if(revealed)rows.push(['Known future',C.remaining(sample.truth,i),'var(--fg)']);
      const left=w<450?98:122,barW=w-left-52;
      let bars='';rows.forEach(([label,n,color],j)=>{
        const rowY=22+j*32;
        const body=text(0,rowY+5,label,label.startsWith('Fitted')?'strong':'')+rect(left,rowY-7,n/800*barW,14,color,'rx="1"')+text(left+n/800*barW+8,rowY+5,amount(n,1),'strong');
        bars+=label==='Known future'?`<g data-known-remainder="true">${body}</g>`:body;
      });
      const items=[['bar','Baseline'],['blue bar','Fitted'],['amber','Scale only'],['dots','Observed, adjusted']];
      if(revealed)items.push(['truth','Known future']);
      view.innerHTML=legend(items)+svg(w,y+ph+56,revealed?'The known future is revealed as a dashed curve, after making the forecast.':'Predicted searches in each interval. The known future is hidden while the forecast is made.',s)+periodInspector('ts-forecast-period',period)+`<div class="ts-result" id="ts-future-result"><div class="ts-head"><span class="ts-title">${revealed?'Now check what remained':'Predicted searches still to come'}</span></div>${svg(w,rows.length*32+14,'Compare predicted future searches as shares of baseline total searches.',bars)}</div>`;
      bindInspector(view,'ts-forecast-period',period,x,pw,j=>{
        period=j;
        return inspectorValue(amount(C.mix[j]*1000,1),'Baseline')+inspectorValue(amount(sample.fitted[j],1),'Fitted','blue')+inspectorValue(amount(sample.flat[j],1),'Scale only','amber');
      });
      const story=revealed?'Allowing searches to arrive earlier brings the remaining forecast closer to the known future.':'This is the share expected by Now. The blue R bar is the part still to come.';
      note.innerHTML='Fitted '+mathInline(String.raw`F\approx${num(fittedShare*100)}\%`,'Fraction expected by Now')+' · '+story;
    }
    reveal.addEventListener('click',()=>{revealed=!revealed;draw();});
    fig.tsAction=a=>{if(a.reveal){revealed=a.reveal==='true';draw();}};
    observe(view,draw);draw();
  }

  // Remaining figures are mounted after the shared data has loaded below.
  const mounts={inputs,naive,knobs,estimator,forecast};
  window.TwoStepFigures={C,$,all,num,signed,pct,clamp,elapsed,text,line,rect,circle,path,svg,shell,tabs,slider,legend,selectTab,observe,width,yAxis,stat,axisDays,periodAxis,exposureRail,periodInspector,periodHits,bindInspector,inspectorValue,mathInline,mounts};
})();

(function () {
  'use strict';
  const F=window.TwoStepFigures;
  if(!F)return;
  const {C,$,all,num,signed,pct,clamp,elapsed,text,line,rect,circle,path,svg,shell,tabs,slider,legend,selectTab,observe,width,yAxis,stat,exposureRail,periodInspector,periodHits,bindInspector,inspectorValue}=F;

  function information(fig,data){
    let day=C.edges[0]*(1-.17),zoom=false;
    const el=shell(fig,'One interval leaves two explanations','LIKELIHOOD · EXPECTED COUNTS',
      `<div class="ts-controls">${slider('ts-info-day','Stop observing at',4,96,1,17)}<label class="check"><input id="ts-info-zoom" type="checkbox">Zoom</label></div>`);
    const view=$('.ts-view',el),note=$('.ts-note',el),input=$('#ts-info-day',el);
    function draw(){
      const w=width(view),i=C.exposure(day),mu=C.mean(data.experiment.volumeLog,data.experiment.timing),y=mu.map((m,j)=>m*i[j]),n=C.sum(y);
      const q=C.conditional(data.experiment.timing,i),mean=C.dot(q,C.z),variance=C.dot(q,C.z.map(z=>(z-mean)**2)),active=i.filter(v=>v>0).length;
      $('output',el).textContent=elapsed(day);
      input.setAttribute('aria-valuetext',elapsed(day)+' of the window elapsed');
      $('.ts-title',el).textContent=active===1?'One interval leaves two explanations':'More intervals separate timing from total';
      const x=49,top=33,pw=w-64,ph=w<500?250:300,cols=w<500?65:100,rows=65;
      const lo=zoom?-.05:-.065,hi=zoom?-.01:.045,vlo=Math.log(zoom ? .9 : .5),vhi=Math.log(zoom?1.8:2.5);
      const xx=t=>x+(t-lo)/(hi-lo)*pw,yy=v=>top+ph-(v-vlo)/(vhi-vlo)*ph;
      const min=C.nll(data.experiment.volumeLog,data.experiment.timing,y,i);
      const likelihood=(v,t)=>Math.max(0,C.nll(v,t,y,i)-min);
      let s=text(x,top-15,'Change in total searches','small');
      const values=[];
      for(let r=0;r<=rows;r++){values[r]=[];for(let c=0;c<=cols;c++)values[r][c]=likelihood(vlo+(vhi-vlo)*r/rows,lo+(hi-lo)*c/cols);}
      // A dense alpha mask interpolates the sampled loss field smoothly.
      // Color stays in SVG/CSS, so changing the site theme remains immediate.
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(pw*2);canvas.height=ph*2;
      const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(canvas.width,canvas.height);
      for(let py=0;py<canvas.height;py++)for(let px=0;px<canvas.width;px++){
        const u=px/(canvas.width-1)*cols,v=(1-py/(canvas.height-1))*rows;
        const c=Math.min(cols-1,Math.floor(u)),r=Math.min(rows-1,Math.floor(v)),fx=u-c,fy=v-r;
        const delta=(1-fy)*((1-fx)*values[r][c]+fx*values[r][c+1])+fy*((1-fx)*values[r+1][c]+fx*values[r+1][c+1]);
        const index=(py*canvas.width+px)*4;
        pixels.data[index]=pixels.data[index+1]=pixels.data[index+2]=255;
        pixels.data[index+3]=Math.round(255*(.025+.91*Math.exp(-delta/5)));
      }
      ctx.putImageData(pixels,0,0);
      s+=`<defs><mask id="ts-likelihood-mask" maskUnits="userSpaceOnUse" x="${x}" y="${top}" width="${pw}" height="${ph}" style="mask-type:alpha"><image x="${x}" y="${top}" width="${pw}" height="${ph}" preserveAspectRatio="none" href="${canvas.toDataURL()}"/></mask></defs>`;
      s+=rect(x,top,pw,ph,'var(--ts-blue)','mask="url(#ts-likelihood-mask)"');
      // Marching-square isolines at fixed likelihood-loss levels. These are
      // descriptive levels, with no confidence coverage claim.
      for(const level of [.5,2,8]){
        let seg='';
        for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
          const pts=[[c,r],[c+1,r],[c+1,r+1],[c,r+1]],vs=[values[r][c],values[r][c+1],values[r+1][c+1],values[r+1][c]],hits=[];
          for(let e=0;e<4;e++){const j=(e+1)%4;if((vs[e]<level)!==(vs[j]<level)){const f=(level-vs[e])/(vs[j]-vs[e]);hits.push([x+(pts[e][0]+f*(pts[j][0]-pts[e][0]))/cols*pw,top+ph-(pts[e][1]+f*(pts[j][1]-pts[e][1]))/rows*ph]);}}
          for(let j=0;j+1<hits.length;j+=2)seg+=`M${hits[j].join(',')}L${hits[j+1].join(',')}`;
        }
        s+=`<path d="${seg}" stroke="var(--ts-blue)" stroke-width=".8" fill="none" opacity=".6"/>`;
      }
      for(const ratio of zoom?[.9,1,1.3,1.5,1.8]:[.5,1,1.5,2,2.5]){const y0=yy(Math.log(ratio));s+=text(x-8,y0+4,pct(ratio-1),'small','end');}
      for(const t of zoom?[-.05,-.04,-.03,-.02,-.01]:[-.06,-.03,0,.03])s+=text(xx(t),top+ph+22,t===0?'0':signed(t*C.edges[0],1),'small','middle');
      s+=text(x+pw/2,top+ph+45,zoom?'Timing · zoomed around known setting':'Timing · earlier ← 0 → later','small','middle');
      const cx=xx(data.experiment.timing),cy=yy(data.experiment.volumeLog);
      s+=`<path d="M${cx-6},${cy}h12M${cx},${cy-6}v12" stroke="var(--bg)" stroke-width="5"/><path d="M${cx-6},${cy}h12M${cx},${cy-6}v12" stroke="var(--fg)" stroke-width="1.6"/>`;
      s+=text(cx+12,cy-10,'Known setting','direct strong');
      view.innerHTML=`<div class="ts-heat-key"><span>Worse fit</span><i aria-hidden="true"></i><span>Better fit</span></div>`+svg(w,top+ph+55,`Volume and timing likelihood for a synthetic observation window. ${zoom?'Zoomed axes near truth. ':''}${active===1?'A ridge of equally good solutions prevents identification.':'Additional observed intervals narrow the high-likelihood region.'}`,s)+
        `<div class="ts-inline"><strong>${active}</strong> observed interval${active>1?'s':''} · ${active===1?'total and timing cannot be separated':'the pattern helps separate total and timing'}</div>`;
      note.textContent=active===1?'A higher total with later searches and a lower total with earlier searches both explain this snapshot.':'New intervals show whether the lead fades or persists, so fewer explanations fit.';
    }
    input.addEventListener('input',()=>{day=C.edges[0]*(1-Number(input.value)/100);draw();});
    $('#ts-info-zoom',el).addEventListener('change',e=>{zoom=e.target.checked;draw();});observe(view,draw);draw();
  }

  Object.assign(F.mounts,{information});
  const figures=[['ts-input','inputs'],['ts-naive','naive'],['ts-knobs','knobs'],['ts-fit','estimator'],['ts-future','forecast'],['ts-information','information']];
  const first=document.getElementById('ts-input');
  if(!first)return;
  fetch(first.dataset.src).then(r=>{if(!r.ok)throw Error('Figure data unavailable');return r.json();}).then(data=>{
    for(const [id,name] of figures){const fig=document.getElementById(id);if(!fig)continue;try{F.mounts[name](fig,data);}catch(error){console.error(id,error);failure(fig);}}
  }).catch(error=>{console.error(error);figures.forEach(([id])=>{const f=document.getElementById(id);if(f)failure(f);});});
  function failure(fig){const el=document.createElement('p');el.className='ts-error';el.innerHTML=`The interactive figure could not load. <a href="${first.dataset.src}">Open the figure data</a> or reload this page to try again.`;fig.insertBefore(el,$('figcaption',fig));fig.classList.add('ready');}
  document.addEventListener('click',event=>{
    const a=event.target.closest('a.act[href^="#ts-"]');if(!a)return;
    const fig=document.getElementById(a.getAttribute('href').slice(1));
    if(fig&&fig.tsAction)fig.tsAction(a.dataset);
  });
})();
