/* Original vector schematics; visual references recorded in the private design notes. */
'use strict';
const e=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t=(x,y,s,cl='',a='start')=>`<text x="${x}" y="${y}" class="${cl}" text-anchor="${a}">${e(s)}</text>`;
const r=(x,y,w,h,cl='',rx=5)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" class="${cl}"/>`;
const l=(x1,y1,x2,y2,cl='wire')=>`<path d="M${x1} ${y1}L${x2} ${y2}" class="${cl}"/>`;
const p=(d,cl='wire',marker='')=>`<path d="${d}" class="${cl}" ${marker?`marker-end="url(#${marker})"`:''}/>`;
const c=(x,y,radius,cl)=>`<circle cx="${x}" cy="${y}" r="${radius}" class="${cl}"/>`;
function bend(x1,y1,x2,y2,id,cl='wire'){
 const mid=(x1+x2)/2;return p(`M${x1} ${y1}C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`,cl,id);
}
function node(x,y,w,h,title,sub='',cl=''){
 return r(x,y,w,h,'node '+cl)+t(x+w/2,y+(sub?21:h/2+4),title,'node-title','middle')+(sub?t(x+w/2,y+39,sub,'node-sub','middle'):'');
}
function frame(name,w,h,g){
 const id='fs-art-'+name+'-'+w;
 return `<svg class="fs-schematic ${w<600?'fs-schema-small':'fs-schema-wide'}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${e(({intake:'Two watchlists merge into eighty source queries. Twenty cache hits and sixty fetches produce one hundred twenty offers. Blue follows the November 17 flight.',storage:'Raw replies, run ownership and reference maps join into curated offer rows, then branch to customer export, comparison and history.',prices:'Three comparison rules on the same flight. The selected competitor price is 220, 270 or 220 dollars against our 240.',evidence:'The November 17 departure, queried with authorization and an observation cutoff, reaches its price history and partial published-fare checks.',cohort:'Forty departure dates. Twenty-two have a cheaper competitor, eight match and ten have a higher competitor price. Blue outlines November 17.',coverage:'Failure example: one competitor response is missing. Blue identifies November 17; coverage becomes 79 of 80 queries, 118 offers and 39 comparable dates.'})[name])}"><defs><marker id="${id}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 1L7 4L0 7" class="arrow"/></marker></defs>${g(id)}</svg>`;
}
const pair=fn=>fn(800)+fn(360);
function planGrid(x,y){
 let g=r(x,y,142,135,'region');
 g+=t(x+13,y+21,'80 source queries','node-title');
 for(let i=0;i<80;i++){
  const cl=i<20?'query cached':[40,41].includes(i)?'query tracked':'query fresh';
  g+=r(x+14+(i%10)*11.5,y+35+Math.floor(i/10)*9,7.5,5.5,cl,1.2);
 }
 return g+t(x+13,y+122,'2 follow our departure','node-sub blue');
}
function offers(x,y,w,mobile){
 const vals=[['Our airline','economy','$240','own'],['Competitor','discount','$220','comp'],['Competitor','economy','$270','comp']];
 let g='';
 if(mobile){
  g+=t(x,y-9,'A → B · November 17 · 3 offers','label blue');
  vals.forEach(([owner,product,value,cl],i)=>{
   const xx=x+i*(w/3+3),ww=w/3-6;
   g+=r(xx,y,ww,79,'offer-sheet '+cl,3)+t(xx+9,y+18,owner,'small')+t(xx+9,y+35,product,'small')+t(xx+9,y+62,value,'price '+cl);
  });
 }else{
  g+=t(x,y-13,'Normalized offers','label');
  g+=r(x,y,w,147,'offer-sheet',4);
  vals.forEach(([owner,product,value,cl],i)=>{
   const yy=y+24+i*43;
   if(i)g+=l(x+10,yy-17,x+w-10,yy-17,'rule');
   g+=t(x+13,yy,owner,'small')+t(x+13,yy+15,product,'small muted')+t(x+w-12,yy+6,value,'price '+cl,'end');
  });
  g+=t(x,y+167,'A → B · Nov 17','label blue');
 }
 return g;
}
function intake(d,m){
 return pair(w=>frame('intake',w,w===800?260:472,id=>{
  let g='';
  if(w===800){
   g+=bend(142,69,188,121,id)+bend(142,147,188,121,id);
   g+=bend(330,121,397,63,id,'wire cache-wire')+bend(330,121,397,173,id,'wire strong');
   g+=bend(535,63,623,112,id,'wire cache-wire')+bend(535,173,554,173,id,'wire strong')+bend(610,173,623,150,id,'wire strong');
   g+=node(8,43,134,52,'Watchlist 1','40 dates × 2 sources')+node(8,121,134,52,'Watchlist 2','same public searches');
   g+=planGrid(188,49)+node(397,37,138,52,'Fresh cache','source time + TTL','cache-node')+node(397,147,138,52,'Provider queue','rate + inflight cap','trace-node');
   g+=node(554,152,56,42,'Parse','','parser-node')+offers(623,56,169,false);
   g+=t(346,48,'20 reuse','small muted')+t(346,194,'60 fetch','small blue');
   g+=p('M464 199V224H397','wire dashed')+t(397,244,'raw reply → replay log','small muted');
   g+=t(192,221,'Merge ownership, not evidence.','small muted');
  }else{
   g+=p('M87 72V95H86V121','wire',id)+p('M275 72V95H86','wire');
   g+=bend(158,174,196,151,id,'wire cache-wire')+bend(158,213,196,239,id,'wire strong');
   g+=p('M336 151H349V343H116V356','wire cache-wire',id)+p('M266 265V289','wire strong',id)+p('M266 325V336H98V356','wire strong',id);
   g+=node(6,20,162,52,'Watchlist 1','40 dates × 2 sources')+node(192,20,162,52,'Watchlist 2','same public searches');
   g+=planGrid(16,121)+node(196,125,140,52,'20 cache hits','keep source timestamp','cache-node')+node(196,213,140,52,'60 source fetches','rate + inflight cap','trace-node');
   g+=node(196,289,140,36,'Parse + validate','','parser-node')+offers(6,383,351,true);
   g+=t(16,286,'One shared plan','small muted')+t(16,303,'80 physical queries','small blue');
  }
  return g;
 }));
}
function offerTable(x,y,w){
 let g=r(x,y,w,121,'offer-sheet',4),cols=[x+12,x+w*.42,x+w-14];
 g+=t(x+12,y+20,'airline','small muted')+t(cols[1],y+20,'group','small muted')+t(cols[2],y+20,'USD cents','small muted','end');
 const rows=[['Our airline','economy','24000','own'],['Competitor','discount','22000','comp'],['Competitor','economy','27000','comp']];
 rows.forEach(([owner,product,amount,cl],i)=>{
  const yy=y+47+i*28;g+=l(x+10,yy-18,x+w-10,yy-18,'rule')+t(cols[0],yy,owner,'small')+t(cols[1],yy,product,'small')+t(cols[2],yy,amount,'small mono '+cl,'end');
 });
 return g;
}
function storage(d,m){
 return pair(w=>frame('storage',w,w===800?270:421,id=>{
  let g='';
  if(w===800){
   g+=bend(154,89,219,145,id)+bend(154,171,219,145,id)+p('M401 55V60H235V130','wire reference-wire',id);
   g+=p('M249 145H282','wire strong',id)+p('M576 145H608V52H637','wire',id)+p('M608 145H637','wire strong',id)+p('M608 145V232H637','wire',id);
   g+=r(7,59,142,54,'paper-back',4)+r(12,64,142,54,'node',4)+t(83,85,'Raw replies','node-title','middle')+t(83,103,'one source response','node-sub','middle');
   g+=node(12,145,142,52,'Run ownership','customer / local day')+node(267,19,268,36,'FX · city · product maps','','reference-node');
   g+=c(234,145,15,'join-dot')+t(234,150,'+','join-mark','middle');
   g+=offerTable(282,84,294)+t(282,73,'Curated offers','label blue')+t(282,225,'A → B · Nov 17 · 21 days out','small blue');
   g+=node(637,26,151,52,'Customer export','format / release delay')+node(637,119,151,52,'Comparison view','cell × airline × product','trace-node')+node(637,206,151,52,'History table','departure × observation');
   g+=t(282,250,'Partition by customer / day; cluster by route.','small muted');
  }else{
   g+=p('M85 69V83H180V96','wire',id)+p('M275 69V83H180','wire');
   g+=p('M180 130V156','wire strong',id)+p('M180 277V326H63V349','wire',id)+p('M180 326V349','wire strong',id)+p('M180 326H297V349','wire',id);
   g+=node(10,17,150,52,'Raw replies','one source response')+node(200,17,150,52,'Run ownership','customer / local day');
   g+=node(10,96,340,34,'Join FX · city · product maps','','reference-node')+offerTable(10,156,340);
   g+=t(10,298,'A → B · Nov 17 · 21 days out','small blue');
   g+=node(10,349,106,52,'Export','format / delay')+node(127,349,106,52,'Compare','cell × pair','trace-node')+node(244,349,106,52,'History','date × time');
  }
  return g;
 }));
}
function prices(d,m){
 return pair(w=>frame('prices',w,w===800?197:215,id=>{
  const mobile=w<600,x=mobile?142:243,pw=mobile?162:440,xx=v=>x+(v-20000)/8000*pw,own=xx(m.selected.own);
  let g='';
  g+=l(own,26,own,171,'own-guide')+t(own,17,'Our $240','label blue','middle');
  const labels=mobile?[['Any product','discount selected'],['Same group','economy selected'],['Alternative','discount selected']]:[['Any product','discount selected'],['Same product group','economy selected'],['Cheaper alternative','discount selected']];
  m.policies.forEach((row,i)=>{
   const y=52+i*48,cx=xx(row.competitor),gain=row.delta>0,cl=gain?'gain':'loss';
   g+=l(x,y,x+pw,y,'track')+r(Math.min(own,cx),y-4,Math.abs(own-cx),8,'gap '+cl,3);
   g+=c(own,y,3,'own-dot')+c(cx,y,5,'comp-dot');
   g+=t(9,y-1,labels[i][0],'label')+t(9,y+15,labels[i][1],'small muted');
   g+=t(cx,y-12,'$'+row.competitor/100,'small comp','middle');
   g+=t(w-9,y+4,(gain?'+':'−')+'$'+Math.abs(row.delta)/100,'delta '+cl,'end');
   g+=t(w-9,y+19,(gain?'+':'−')+(Math.abs(row.ratio)*100).toFixed(2)+'%','small '+cl,'end');
  });
  [20000,24000,28000].forEach(v=>g+=t(xx(v),190,'$'+v/100,'small muted',v===20000?'start':v===28000?'end':'middle'));
  return g;
 }));
}
function cohort(d,m){
 return pair(w=>frame('cohort',w,w===800?71:103,id=>{
  let g='',cols=w===800?40:20,gap=w===800?17.4:16.1,x=w===800?74:18,y=14;
  d.cells.forEach((row,i)=>{
   const delta=(row.basic-row.own)/row.own,cl=delta<-.01?'loss':delta>.01?'gain':'matched',xx=x+(i%cols)*gap,yy=y+Math.floor(i/cols)*24;
   g+=r(xx,yy,gap-4,13,'cohort-cell '+cl,2);
   if(row.day===21)g+=r(xx-2,yy-3,gap,19,'selected-cell',3);
  });
  if(w===800)g+=t(5,25,'40 dates','small muted')+t(x+20*gap+6,54,'Nov 17','small blue','middle');
  else g+=t(x,79,'Nov 17 is outlined in blue','small blue');
  return g;
 }));
}
function history(x,y,w,h,d,m){
 const pw=w-120,xx=i=>x+36+i/4*pw,yy=v=>y+h-(v-21000)/4000*h;let g='';
 [22000,24000,25000].forEach(v=>g+=l(x+36,yy(v),x+36+pw,yy(v),'grid')+t(x+31,yy(v)+3,'$'+v/100,'small muted','end'));
 g+=p(d.history_prices.own.map((v,i)=>(i?'L':'M')+xx(i)+' '+yy(v)).join(' '),'own-series');
 g+=p(d.history_prices.basic.map((v,i)=>(i?'L':'M')+xx(i)+' '+yy(v)).join(' '),'competitor-series');
 g+=c(xx(4),yy(22000),4,'focus-dot')+t(xx(4)+10,yy(24000)+4,'Us $240','small own')+t(xx(4)+10,yy(22000)+4,'Comp $220','small comp');
 g+=t(xx(0),y+h+23,'Oct 23','small muted')+t(xx(4),y+h+23,'Oct 27','small blue','end');
 return g;
}
function evidence(d,m){
 return pair(w=>frame('evidence',w,w===800?299:425,id=>{
  let g='';
  if(w===800){
   g+=p('M260 40H316','wire strong',id)+p('M346 40H509','wire',id)+p('M395 40V2H718V15','wire strong',id);
   g+=p('M714 67V92H234V121','wire strong',id);
   g+=node(8,15,252,52,'A → B · November 17','GET /history · explicit as_of','trace-node')+c(331,40,14,'scope-dot')+t(331,44,'✓','join-mark','middle');
   g+=node(509,15,114,52,'Route / day','Parquet')+node(648,15,140,52,'Departure history','time-series table','trace-node');
   g+=t(299,78,'customer access','small muted');
   g+=t(12,124,'Observed offers for this departure','label')+history(5,143,467,93,d,m);
   g+=bend(475,174,527,174,id,'wire reference-wire')+t(500,144,'join','small muted','middle');
   g+=r(527,125,261,156,'region reference-region',5)+t(542,148,'Published fare','label')+t(773,151,'$210','price','end');
   g+=l(542,164,773,164,'rule')+t(542,186,'Advance purchase','small muted')+t(773,188,'14 ≤ 21 days','label gain','end');
   g+=t(542,213,'Supported check passes','small gain')+p('M542 225H773','wire dashed');
   g+=t(542,247,'Other rules + tax basis: unverified','small muted')+t(542,267,'Seat availability: unknown','small comp');
  }else{
   g+=p('M180 59V80H91V105','wire',id)+p('M180 80H267V105','wire strong',id);
   g+=node(10,7,340,52,'A → B · November 17','Customer access + explicit observation cutoff','trace-node');
   g+=node(10,105,162,48,'Route / day','Parquet')+node(188,105,162,48,'Departure history','time-series table','trace-node');
   g+=p('M269 153V172H170V183','wire strong',id)+history(0,186,358,77,d,m);
   g+=r(10,310,340,106,'region reference-region',5)+t(23,332,'Published fare','label')+t(337,335,'$210','price','end');
   g+=t(23,357,'Advance purchase','small muted')+t(337,358,'14 ≤ 21 days · passes','label gain','end');
   g+=t(23,384,'Other rules + tax basis: unverified','small muted')+t(23,405,'Seat availability: unknown','small comp');
  }
  return g;
 }));
}
function loss(d,m){
 return pair(w=>frame('coverage',w,w===800?103:153,id=>{
  let g='',cols=w===800?40:20,step=w===800?13.3:16.1,start=w===800?170:18;
  const groups=w===800?[['Own source',29],['Competitor source',55]]:[['Own source',26],['Competitor source',101]];
  groups.forEach(([label,y],source)=>{
   g+=t(w===800?7:18,w===800?y+10:y-9,label,'small muted');
   for(let i=0;i<40;i++){
    const xx=start+(i%cols)*step,yy=y+Math.floor(i/cols)*17,missing=source===1&&i===20;
    g+=r(xx,yy,step-3.5,10,missing?'lost-cell':'source-cell',1.5);
    if(i===20)g+=r(xx-1.5,yy-2,step-.5,14,'selected-cell',2);
    if(missing)g+=p(`M${xx+1} ${yy+1}l${step-6} 8m0 -8l${-(step-6)} 8`,'missing-cross');
   }
  });
  if(w===800)g+=t(727,39,'40/40','small')+t(727,65,'39/40','small comp')+t(start+20*step+4,91,'Nov 17: no competitor reply','small blue','middle');
  return g;
 }));
}
module.exports={intake,storage,prices,cohort,evidence,loss};
