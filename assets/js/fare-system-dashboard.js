/* Dashboard concepts generated from the same fictional offers and detector. */
(function(){
'use strict';
const A=typeof module!=='undefined'&&module.exports?require('./fare-anomaly.js'):window.FareAnomaly;
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
function header(title,sub,tag,state='ok'){return `<div class="dash-header"><div><span class="dash-eyebrow">PRICING WORKSPACE · DESIGN PREVIEW</span><h3>${title}</h3><p>${sub}</p></div><span class="dash-status" data-state="${state}">${tag}</span></div>`;}
function scope(m){return '<div class="dash-scope"><span><b>Market</b> A → B</span><span><b>Cabin</b> Economy</span><span><b>Trip</b> One way</span><span><b>Sale / currency</b> US / USD · tax included</span><span><b>Compare</b> '+(m.policy==='matched'?'Same product group':'Lowest available')+'</span></div>';}
function metrics(items){return `<dl class="dash-summary">${items.map(([value,label,detail=''])=>`<div><dt>${label}</dt><dd>${value}</dd><small>${detail}</small></div>`).join('')}</dl>`;}
function marketChart(d,m,w,cl){
 const x=37,y=13,pw=w-50,ph=136,xx=day=>x+(day-1)/39*pw,yy=v=>y+ph-(v-19000)/14000*ph,comp=r=>m.policy==='matched'?r.standard:r.basic,selected=comp(m.selected),above=selected>=m.selected.own;
 let g='';
 for(const row of m.reviewDates)g+=`<rect x="${xx(row.day)-pw/80}" y="${y}" width="${pw/40}" height="${ph}" class="dash-event-band"/>`;
 [20000,26000,32000].forEach(v=>g+=line(x,yy(v),x+pw,yy(v))+t(x-6,yy(v)+4,cash(v),'dash-tick','end'));
 g+=path(d.cells.map(r=>[xx(r.day),yy(r.own)]),'dash-own-line')+path(d.cells.map(r=>[xx(r.day),yy(comp(r))]),'dash-price-line');
 g+=line(xx(21),y,xx(21),y+ph,'dash-cursor')+dot(xx(21),yy(m.selected.own),3,'dash-own-dot')+dot(xx(21),yy(selected),4,'dash-price-dot');
 g+=t(xx(21)+8,yy(m.selected.own)+(above?17:-8),cash(m.selected.own),'dash-value dash-own')+t(xx(21)+8,yy(selected)+(above?-9:17),cash(selected),'dash-value dash-price');
 [[1,'Oct 28'],[21,'Nov 17'],[40,'Dec 6']].forEach(([day,label])=>g+=t(xx(day),y+ph+23,label,'dash-tick',day===1?'start':day===40?'end':'middle'));
 return svg(w,185,'Fares by departure date. November 17: our economy 240 dollars; competitor '+(m.policy==='matched'?'regular economy 270':'discount 220')+' dollars. Review shading tracks the discount product independently.',g,cl);
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
 const selected=m.policy==='matched'?m.selected.standard:m.selected.basic,gap=m.selected.own-selected,under=m.positionUnder??m.under;
 const first=m.reviewDates[0],last=m.reviewDates.at(-1),age=(Date.parse(d.anomaly.snapshot)-Date.parse(d.anomaly.checks.at(-1).time))/60000;
 const queue=first?`<a class="dash-event" href="#fs-product"><span class="dash-event-label">CONFIRMED PRICE MOVE</span><strong>Competitor cut discount fares</strong><span>A → B · ${shortDate(first.departure)}–${new Date(last.departure+'T00:00:00Z').getUTCDate()}</span><b>${cash(Math.abs(first.decision.residual))} below expected</b><span>${m.reviewDates.length} departure dates · 3 fresh checks</span><em>Investigate November 17 →</em></a><div class="dash-quiet"><strong>Other ${40-m.reviewDates.length} dates</strong><span>No confirmed material move</span></div><div class="dash-rule-summary"><strong>Configured benchmark</strong><span>Discount gap &gt; $15: ${m.screening.count} matching dates</span><small>Rule matches are separate from anomalies.</small></div>`:`<div class="dash-quiet"><strong>${m.predictions.some(r=>r.prediction.status!=='ready')?'Reference history needed':'No confirmed pricing event'}</strong><span>Inspect history and source coverage before making a decision.</span></div>`;
 return `<div class="fs-dashboard" aria-label="Market pricing dashboard concept">${header('Market monitor','27 Oct 2026 · 08:10 UTC snapshot','40/40 dates comparable')}${scope(m)}${metrics([
  [under+'/40','Competitor cheaper','Current position'],
  [String(m.reviewDates.length),'Dates to investigate',m.reviewDates.length?'1 grouped pricing event':'No confirmed pricing event'],
  [age+' min','Selected source age','Observed 08:05 UTC']
 ])}<div class="dash-market-grid">${panel('Fares by departure','Departure date →',`<div class="dash-legend"><span class="own">Our economy</span><span class="price">Competitor ${m.policy==='matched'?'economy':'discount'}</span><span class="event">New move</span></div>`+responsive((w,cl)=>marketChart(d,m,w,cl))+`<div class="dash-chart-foot">November 17: our $240 is <b>${cash(Math.abs(gap))} ${gap>0?'above':'below'} the competitor.</b></div><div class="dash-matrix-label"><b>Review map</b><span>${m.reviewDates.length} review · ${40-m.reviewDates.length} no review</span></div>`+responsive((w,cl)=>heatmap(d,m,w,cl)))}${panel('Review queue','Grouped by market / product',queue,'dash-queue')}</div><div class="dash-context-note">${m.policy==='matched'?'Same-product comparison selects competitor economy at <b>$270</b>.':'Lowest available selects competitor discount at <b>$220</b>.'} Price-move reviews track the discount product against its own history.</div></div>`;
}
function flightHistory(d,m){
 if(m.flightHistory)return m.flightHistory;
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
 const history=flightHistory(d,m),scored=m.selectedAnomaly.decision.status!=='data_issue';
 const rows=[...history.slice(0,14),{...history.at(-1),amount:scored?(m.activeChecks||d.anomaly.checks).at(-1).amount:null}];
 const x=38,pw=w-52,y=17,ph=153;
 const low=Math.floor((Math.min(...rows.flatMap(r=>[r.lower,r.amount].filter(Number.isFinite)))-300)/1000)*1000,high=Math.ceil((Math.max(...rows.map(r=>r.upper))+300)/1000)*1000;
 const xx=i=>x+i/(rows.length-1)*pw,yy=v=>y+ph-(v-low)/(high-low)*ph;
 let g='';
 [low,(low+high)/2,high].forEach(v=>g+=line(x,yy(v),x+pw,yy(v))+t(x-6,yy(v)+4,cash(v),'dash-tick','end'));
 const points=rows.map((r,i)=>[xx(i),yy(r.upper)]).concat(rows.map((r,i)=>[xx(i),yy(r.lower)]).reverse());
 g+=`<path d="${points.map(([px,py],i)=>(i?'L':'M')+px+' '+py).join(' ')} Z" class="dash-expected-band"/>`;
 g+=path(rows.map((r,i)=>[xx(i),yy(r.expected)]),'dash-expected-line')+path(rows.flatMap((r,i)=>Number.isFinite(r.amount)?[[xx(i),yy(r.amount)]]:[]),'dash-price-line');
 g+=line(xx(14),y,xx(14),y+ph,'dash-cursor');
 if(scored)g+=dot(xx(14),yy(rows[14].amount),4,'dash-price-dot')+t(xx(14)-7,yy(rows[14].amount)+19,cash(rows[14].amount),'dash-value dash-price','end');
 else g+=t(xx(14)-7,y+ph-10,'No fresh quote','dash-tick','end');
 [[0,'Oct 13'],[7,'Oct 20'],[14,'Oct 27']].forEach(([i,label])=>g+=t(xx(i),y+ph+24,label,'dash-tick',i===0?'start':i===14?'end':'middle'));
 return svg(w,207,'Daily observations of the same November 17 departure. The last point is '+(scored?'220 dollars; confirmation evidence is listed separately below.':'unknown because the selected source is missing or stale.'),g,cl);
}
function investigation(d,m){
 const f=m.selectedAnomaly.prediction,decision=m.selectedAnomaly.decision;
 if(f.status!=='ready')return '<div class="fs-dashboard">'+header('A → B · November 17','No new pricing decision','Insufficient history','watch')+'<div class="dash-data-note"><b>Insufficient history:</b> '+e(f.reason)+' Collect comparable history before scoring the move.</div></div>';
 const mode=m.evidenceMode||(decision.status==='data_issue'?'missing':'fresh'),checks=m.activeChecks||d.anomaly.checks;
 const issue=decision.status==='data_issue',single=mode==='single',stale=mode==='stale';
 const label=issue?(stale?'Data issue · stale quote':'Data issue · missing quote'):decision.confirmed?'Confirmed price cut':'Waiting for confirmation';
 const sourceNote=stale?'Last seen $220 · 65 min old':mode==='missing'?'Latest source did not reply':single?'1 fresh observation':'3 fresh observations';
 const reason=stale?'A 65-minute-old quote exceeds the 15-minute freshness limit. Keep it as history; do not score a current price.':mode==='missing'?'The latest source did not reply. Two earlier quotes cannot replace the missing current quote. Keep its price unknown; 39/40 comparisons remain.':single?'One fresh $220 quote is unusual and material. Wait for a second matching observation at least ten minutes apart.':'Three fresh, time-separated $220 quotes confirm the move below the expected range.';
 const evidence=`<ol class="dash-evidence"><li><span>Decision</span><b>${issue?'No pricing alert':decision.confirmed?decision.breaches+'/3 confirm the move':'1/3 · waiting for a second check'}</b></li><li><span>Tracked product</span><b>Discount economy</b></li><li><span>Comparable coverage</span><b>${issue?'39/40':'40/40'} departure dates</b></li><li><span>Materiality limit</span><b>At least ${cash(Math.max(1000,f.expected*.03))}</b></li><li><span>Price basis</span><b>USD · tax included</b></li></ol>`;
 const slots=single?[null,null,checks.at(-1)]:checks;
 const quotes=`<div class="dash-quote-log">${slots.map((r,j)=>`<div><span>${r?r.time.slice(11,16):d.anomaly.checks[j].time.slice(11,16)} UTC</span><b>${r&&r.valid!==false?cash(r.amount):'—'}</b><small>${!r?'Not collected':r.valid===false?'No source reply':stale?'Stale · excluded':'Fresh source observation'}</small></div>`).join('')}</div>`;
 return `<div class="fs-dashboard" aria-label="Selected flight anomaly dashboard concept">${header('A → B · November 17','21 days before departure · competitor discount product',label,issue?'issue':decision.confirmed?'ok':'watch')}${metrics([
  [issue?'Unknown':cash(checks.at(-1).amount),'Observed competitor',sourceNote],
  [cash(f.expected),'Expected competitor','Matched historical context'],
  [issue?'Not scored':cash(Math.abs(decision.residual))+' lower','Unexpected movement',issue?'Quality gate stopped scoring':decision.confirmed?'Confirmed · raw gap to us: $20':'Candidate · confirmation needed']
 ])}<div class="dash-detail-grid">${panel('Price move in context','Same departure · one observation per day',`<div class="dash-legend"><span class="price">Observed</span><span class="expected">Expected before observation</span><span class="band">Past-error range</span></div>`+responsive((w,cl)=>anomalyChart(d,m,w,cl))+`<div class="dash-range-note">Today’s usual range: <b>${cash(f.lower)}–${cash(f.upper)}</b>. ${issue?'A fresh, comparable quote is needed.':'The $220 quote is outside this range.'}</div>`)}${panel('Evidence behind the review','Source, product and freshness',evidence)}</div>${quotes}<div class="dash-decision-note" data-state="${decision.status}"><b>${issue?'Hold the pricing decision':decision.confirmed?'Ready for analyst review':'Watch, then check again'}</b><span>${reason}</span></div><div class="dash-fare-note"><strong>Published-fare lead: $210</strong><span>14-day purchase timing passes (21 days remain). Other fare rules, tax basis and seat availability are unverified.</span></div></div><div class="fs-model-design"><strong>Detector I’d build</strong><code>matched past → forecast error band → $10 / 3% materiality → 2 of 3 same-direction checks, 10+ min apart</code><code>GET /history?route=A-B&amp;departure=2026-11-17</code><span>Forecast and error calibration exclude today. Missing, stale or changed product scope stops the decision.</span></div>`;
}
const api={overview,investigation,flightHistory};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else window.FareDashboard=api;
})();
