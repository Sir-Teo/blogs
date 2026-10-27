/* Dashboard concepts generated from the same fictional offers and detector. */
'use strict';
const A=require('./fare-anomaly.js');
const e=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cash=v=>v===null?'unknown':'$'+(v/100).toLocaleString('en-US',{maximumFractionDigits:v%100?2:0});
const shortDate=s=>new Date(s+'T00:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
const t=(x,y,s,cl='',anchor='start')=>`<text x="${x}" y="${y}" class="${cl}" text-anchor="${anchor}">${e(s)}</text>`;
const path=(pts,cl)=>`<path d="${pts.map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' ')}" class="${cl}"/>`;
const line=(x1,y1,x2,y2,cl='dash-grid')=>`<path d="M${x1} ${y1}L${x2} ${y2}" class="${cl}"/>`;
const dot=(x,y,r,cl)=>`<circle cx="${x}" cy="${y}" r="${r}" class="${cl}"/>`;
const svg=(w,h,label,body,cl)=>`<svg class="${cl}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${e(label)}">${body}</svg>`;
const responsive=fn=>fn(460,'dash-chart-wide')+fn(320,'dash-chart-small');
const panel=(title,sub,content,cl='')=>`<section class="dash-panel ${cl}"><div class="dash-panel-title"><h3>${title}</h3><span>${sub}</span></div>${content}</section>`;
function header(title,sub,tag){return `<div class="dash-header"><div><span class="dash-eyebrow">PRICING WORKSPACE · DESIGN PREVIEW</span><h3>${title}</h3><p>${sub}</p></div><span class="dash-status">${tag}</span></div>`;}
function scope(){return '<div class="dash-scope"><span><b>Market</b> A → B</span><span><b>Cabin</b> Economy</span><span><b>Trip</b> One way</span><span><b>Sale / currency</b> US / USD · tax included</span><span><b>Compare</b> Lowest available</span></div>';}
function metrics(items){return `<dl class="dash-summary">${items.map(([value,label,detail=''])=>`<div><dt>${label}</dt><dd>${value}</dd><small>${detail}</small></div>`).join('')}</dl>`;}
function marketChart(d,m,w,cl){
 const x=37,y=13,pw=w-50,ph=136,xx=day=>x+(day-1)/39*pw,yy=v=>y+ph-(v-19000)/8000*ph;
 let g='';
 for(const row of m.reviewDates)g+=`<rect x="${xx(row.day)-pw/80}" y="${y}" width="${pw/40}" height="${ph}" class="dash-event-band"/>`;
 [20000,23000,26000].forEach(v=>g+=line(x,yy(v),x+pw,yy(v))+t(x-6,yy(v)+4,cash(v),'dash-tick','end'));
 g+=path(d.cells.map(r=>[xx(r.day),yy(r.own)]),'dash-own-line')+path(d.cells.map(r=>[xx(r.day),yy(r.basic)]),'dash-price-line');
 g+=line(xx(21),y,xx(21),y+ph,'dash-cursor')+dot(xx(21),yy(m.selected.own),3,'dash-own-dot')+dot(xx(21),yy(m.selected.basic),4,'dash-price-dot');
 g+=t(xx(21)+8,yy(m.selected.own)-8,cash(m.selected.own),'dash-value dash-own')+t(xx(21)+8,yy(m.selected.basic)+17,cash(m.selected.basic),'dash-value dash-price');
 [[1,'Oct 28'],[21,'Nov 17'],[40,'Dec 6']].forEach(([day,label])=>g+=t(xx(day),y+ph+23,label,'dash-tick',day===1?'start':day===40?'end':'middle'));
 return svg(w,185,'Fares by departure date. Our economy price is 240 dollars and competitor discount is 220 dollars for November 17. Three departure dates have confirmed unexpected moves.',g,cl);
}
function heatmap(d,m,w,cl){
 let g='',cols=20,step=(w-28)/cols;
 d.cells.forEach((cell,i)=>{
  const event=m.predictions[i].decision.confirmed,x=14+(i%cols)*step,y=5+Math.floor(i/cols)*21;
  g+=`<g><title>${e(shortDate(cell.departure))}: ${event?'review':'no review'}</title><rect x="${x}" y="${y}" width="${step-4}" height="12" rx="2" class="${event?'dash-hot-cell':'dash-normal-cell'}"/>${cell.day===21?`<rect x="${x-2}" y="${y-3}" width="${step}" height="18" rx="3" class="dash-selected-cell"/>`:''}</g>`;
 });
 g+=t(14,64,'Nov 17 selected · each cell is one departure','dash-tick dash-own');
 return svg(w,75,'Forty departure dates: three confirmed review dates and thirty-seven without a review event. November 17 is outlined.',g,cl);
}
function overview(d,m){
 const first=m.reviewDates[0],last=m.reviewDates.at(-1),age=(Date.parse(d.anomaly.snapshot)-Date.parse(d.anomaly.checks.at(-1).time))/60000;
 const queue=first?`<a class="dash-event" href="#fs-product"><span class="dash-event-label">CONFIRMED PRICE MOVE</span><strong>Competitor cut discount fares</strong><span>A → B · ${shortDate(first.departure)}–${new Date(last.departure+'T00:00:00Z').getUTCDate()}</span><b>${cash(Math.abs(first.decision.residual))} below expected</b><span>${m.reviewDates.length} departure dates · 3 fresh checks</span><em>Investigate November 17 →</em></a><div class="dash-quiet"><strong>Other ${40-m.reviewDates.length} dates</strong><span>No confirmed material move</span></div><div class="dash-rule-summary"><strong>Configured benchmark</strong><span>Gap &gt; $15: ${m.screening.count} matching dates</span><small>Rule matches are separate from anomalies.</small></div>`:`<div class="dash-quiet"><strong>${m.predictions.some(r=>r.prediction.status!=='ready')?'Reference history needed':'No confirmed pricing event'}</strong><span>Inspect history and source coverage before making a decision.</span></div>`;
 return `<div class="fs-dashboard" aria-label="Market pricing dashboard concept">${header('Market monitor','27 Oct 2026 · 08:10 UTC snapshot','40/40 dates comparable')}${scope()}${metrics([
  [m.under+'/40','Competitor cheaper','Current position'],
  [String(m.reviewDates.length),'Dates to investigate',m.reviewDates.length?'1 grouped pricing event':'No confirmed pricing event'],
  [age+' min','Selected source age','Observed 08:05 UTC']
 ])}<div class="dash-market-grid">${panel('Fares by departure','Departure date →',`<div class="dash-legend"><span class="own">Our economy</span><span class="price">Competitor discount</span><span class="event">New move</span></div>`+responsive((w,cl)=>marketChart(d,m,w,cl))+`<div class="dash-chart-foot">Our $240 − competitor $220 = <b>$20 gap</b> on November 17.</div><div class="dash-matrix-label"><b>Review map</b><span>${m.reviewDates.length} review · ${40-m.reviewDates.length} no review</span></div>`+responsive((w,cl)=>heatmap(d,m,w,cl)))}${panel('Review queue','Grouped by market / product',queue,'dash-queue')}</div><div class="dash-context-note">Comparison context: own economy vs competitor discount. Same-group competitor economy is <b>$270</b>; the pricing decision changes with the product match.</div></div>`;
}
function flightHistory(d,m){
 const ap=21,day=d.anomaly.day,history=[];
 for(let i=day-14;i<day;i++){
  const daysOut=ap+(day-i),row=d.anomaly.history.find(r=>r.day===i&&r.ap===daysOut);
  const prediction=A.forecast(d.anomaly.history,{day:i,ap:daysOut,weekday:row.weekday});
  history.push({day:i,amount:row.amount,...prediction});
 }
 for(const check of d.anomaly.checks)history.push({day,amount:check.amount,...m.selectedAnomaly.prediction});
 return history;
}
function anomalyChart(d,m,w,cl){
 const rows=flightHistory(d,m),x=38,pw=w-52,y=17,ph=153;
 const low=Math.floor((Math.min(...rows.map(r=>r.lower))-300)/1000)*1000,high=Math.ceil((Math.max(...rows.map(r=>r.upper))+300)/1000)*1000;
 const xx=i=>x+i/(rows.length-1)*pw,yy=v=>y+ph-(v-low)/(high-low)*ph;
 let g='';
 [low,(low+high)/2,high].forEach(v=>g+=line(x,yy(v),x+pw,yy(v))+t(x-6,yy(v)+4,cash(v),'dash-tick','end'));
 const points=rows.map((r,i)=>[xx(i),yy(r.upper)]).concat(rows.map((r,i)=>[xx(i),yy(r.lower)]).reverse());
 g+=`<path d="${points.map(([px,py],i)=>(i?'L':'M')+px+' '+py).join(' ')} Z" class="dash-expected-band"/>`;
 g+=path(rows.map((r,i)=>[xx(i),yy(r.expected)]),'dash-expected-line')+path(rows.map((r,i)=>[xx(i),yy(r.amount)]),'dash-price-line');
 g+=line(xx(14),y,xx(14),y+ph,'dash-cursor');
 for(let i=14;i<rows.length;i++)g+=dot(xx(i),yy(rows[i].amount),3.5,'dash-price-dot');
 g+=t(xx(16)-4,yy(22000)+18,'$220','dash-value dash-price','end');
 [[0,'Oct 13'],[7,'Oct 20'],[16,'Oct 27']].forEach(([i,label])=>g+=t(xx(i),y+ph+24,label,'dash-tick',i===0?'start':i===16?'end':'middle'));
 return svg(w,207,'The same November 17 departure across observations. Its expected range changes with weekday and days to departure. Today three independent fresh observations are 220 dollars, below the 231 to 239 dollar range.',g,cl);
}
function investigation(d,m){
 const f=m.selectedAnomaly.prediction,decision=m.selectedAnomaly.decision;
 if(f.status!=='ready'||decision.status==='data_issue'){
  const status=decision.status==='data_issue'?'Data issue':'Insufficient history';
  return '<div class="fs-dashboard">'+header('A → B · November 17','No new pricing decision',status)+'<div class="dash-data-note"><b>'+status+':</b> '+e(decision.reason||f.reason)+' Competitor price and unexpected movement are not scored.</div></div>';
 }

 const checks=`<ol class="dash-evidence"><li><span>Fresh observations</span><b>${decision.breaches}/3 confirm the move</b></li><li><span>Tracked product</span><b>Discount economy</b></li><li><span>Comparable coverage</span><b>40/40 departure dates</b></li><li><span>Materiality limit</span><b>At least ${cash(decision.materialThreshold)}</b></li><li><span>Price basis</span><b>USD · tax included</b></li></ol>`;
 const quotes=`<div class="dash-quote-log">${d.anomaly.checks.map(r=>`<div><span>${r.time.slice(11,16)} UTC</span><b>${cash(r.amount)}</b><small>Fresh source observation</small></div>`).join('')}</div>`;
 return `<div class="fs-dashboard" aria-label="Selected flight anomaly dashboard concept">${header('A → B · November 17','21 days before departure · competitor discount product','Confirmed price cut')}${metrics([
  [cash(m.selected.basic),'Observed competitor','3 fresh observations'],
  [cash(f.expected),'Expected competitor','Matched historical context'],
  [cash(Math.abs(decision.residual))+' lower','Unexpected movement','Raw gap to our fare: $20']
 ])}<div class="dash-detail-grid">${panel('Price move in context','Same departure, changing days to departure',`<div class="dash-legend"><span class="price">Observed</span><span class="expected">Expected before observation</span><span class="band">Past-error range</span></div>`+responsive((w,cl)=>anomalyChart(d,m,w,cl))+`<div class="dash-range-note">Today’s usual range: <b>${cash(f.lower)}–${cash(f.upper)}</b>. Repeated ${cash(m.selected.basic)} offers fall below it.</div>`)}${panel('Evidence behind the review','Source, product and freshness',checks)}</div>${quotes}<div class="dash-fare-note"><strong>Published-fare lead: $210</strong><span>14-day purchase timing passes (21 days remain). Other fare rules, tax basis and seat availability are unverified.</span></div><div class="dash-data-note"><b>If the selected source is missing:</b> competitor price stays unknown; 39/40 comparisons remain. Create a data issue, suppress a new pricing alert for that flight.</div></div><div class="fs-model-design"><strong>Detector I’d build</strong><code>matched past → forecast error band → $10 / 3% materiality → 2 of 3 same-direction checks, 10+ min apart</code><code>GET /history?route=A-B&amp;departure=2026-11-17</code><span>Forecast and error calibration exclude today. Missing, stale or changed product scope stops the decision.</span></div>`;
}
module.exports={overview,investigation,flightHistory};
