/* Build-time calculations and vector figures for one fictional pricing pipeline. */
'use strict';
const art=require('./fare-system-art.js');
const anomaly=require('./fare-anomaly.js');
const dashboard=require('./fare-system-dashboard.js');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,p=0)=>Number(v).toLocaleString('en-US',{minimumFractionDigits:p,maximumFractionDigits:p});
const cash=c=>c===null?'unknown':'$'+num(c/100,c%100?2:0);
const pct=v=>num(v*100,Math.abs(v*100-Math.round(v*100))<1e-8?0:1)+'%';
const code=s=>`<code>${esc(s)}</code>`;
const comparisonSQL='SELECT route, departure, stops, cabin, trip,\n       stay_nights, country_of_sale, carrier,\n       product_group, MIN(total_usd_minor) AS fare\nFROM offers\nWHERE customer = :customer AND reporting_day = :day\n  AND collection_run = :run\nGROUP BY 1,2,3,4,5,6,7,8,9;';
const pre=s=>`<pre><code>${esc(s)}</code></pre>`;
function quantile(xs,p){const v=[...xs].sort((a,b)=>a-b),h=(v.length-1)*p,i=Math.floor(h);return v[i]+(v[Math.min(i+1,v.length-1)]-v[i])*(h-i);}
function price(row,policy){
 const {own,basic,standard}=row;
 return policy==='matched'?standard:policy==='alternative'&&standard!==null&&!(basic!==null&&basic<own)?standard:basic;
}
function model(d,{missing=false,threshold=d.benchmark.gap_over}={}){
 const available=d.cells.filter(r=>!missing||r.day!==21),selected=d.cells[20],c=d.collection;
 const rows=available.map(r=>({...r,competitor:price(r,'any')}));
 const under=rows.filter(r=>(r.own-r.competitor)*100>r.own),frequency=Number((under.length/rows.length).toFixed(2));
 const history=d.history_counts.map(c=>Number((c/d.history_denominator).toFixed(2)));
 const screening=rows.filter(r=>r.own-r.basic>threshold);
 const policies=['any','matched','alternative'].map(policy=>{
  const competitor=price(selected,policy),delta=competitor-selected.own;
  return {policy,competitor,delta,ratio:delta/selected.own};
 });
 const queries=c.dates*c.sources,assignments=queries*c.watchlists,calls=queries-c.cache_hits;
 const predictions=d.cells.map(cell=>{
  const prediction=anomaly.forecast(d.anomaly.history,{day:d.anomaly.day,weekday:d.anomaly.weekday,ap:cell.day});
  const scope=d.anomaly.scope.replace(/AP\d+$/, 'AP'+cell.day);
  const checks=d.anomaly.checks.map(check=>({...check,amount:missing&&cell.day===21?null:cell.basic,valid:!(missing&&cell.day===21),scope,observedAt:Date.parse(check.time)}));
  return {day:cell.day,departure:cell.departure,prediction,decision:anomaly.assess(prediction,checks,{now:Date.parse(d.anomaly.snapshot),scope})};
 });
 const selectedAnomaly=predictions.find(r=>r.day===21),reviewDates=predictions.filter(r=>r.decision.confirmed);
 return {predictions,selectedAnomaly,reviewDates,selected,rows,under:under.length,frequency,history,median:quantile(history,.5),policies,
  screening:{count:screening.length,selected:screening.some(r=>r.day===21),threshold},
  assignments,queries,calls,cache:c.cache_hits,offers:c.dates*3-(missing?2:0),satisfied:queries-(missing?1:0),
  comparisons:available.length,competitor:missing?null:selected.basic};
}
const txt=(x,y,s,cl='',anchor='start')=>`<text x="${x}" y="${y}" class="${cl}" text-anchor="${anchor}">${esc(s)}</text>`;
const line=(x1,y1,x2,y2,cl='grid')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cl}"/>`;
const dot=(x,y,r,cl)=>`<circle cx="${x}" cy="${y}" r="${r}" class="${cl}"/>`;
const path=(points,cl)=>`<path d="${points.map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' ')}" class="${cl}"/>`;
const svg=(w,h,label,g,cl='')=>`<svg class="${cl}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${g}</svg>`;
const responsive=fn=>fn(400,'fs-chart-wide')+fn(300,'fs-chart-small');
const section=(label,body)=>`<div class="fs-subsection"><h3>${label}</h3>${body}</div>`;
const table=(label,headers,rows,cls='')=>`<table class="fs-table ${cls}" aria-label="${esc(label)}"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((v,i)=>i===0?`<th scope="row">${v}</th>`:`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const flow=(nodes,cl='')=>`<div class="fs-flow ${cl}">${nodes.map(([title,detail])=>`<div><strong>${title}</strong><span>${detail.replaceAll('<br>',' · ')}</span></div>`).join('')}</div>`;
const caption=(label,detail)=>`<div class="fs-overline"><strong>${label}</strong><span>${detail.replaceAll('<br>',' · ')}</span></div>`;
function intake(d,m){
 const sample='route=A-B · departure=2026-11-17 · cabin=economy · trip=OW · stops=0 · sale=US\nsource=airline-site · observed_at=08:05Z · currency=USD · tax=included · total_minor=24000';
 return caption('Collect → normalize','A → B · November 17')+art.intake(d,m)+
 `<div class="fs-equation">${m.assignments} assignments <i>→</i> <b>${m.queries} queries</b> <i>=</i> ${m.cache} cached + ${m.calls} fetched <i>→</i> <b>${m.offers} offers</b></div>`+
 `<div class="fs-record-strip"><span>One normalized offer</span>${pre(sample)}</div>`;
}
function storage(d,m){
 return caption('Curate → materialize','A → B · November 17')+art.storage(d,m)+
 `<div class="fs-pair fs-storage-code">${section('Minimum fare per cell / airline / product',pre(comparisonSQL))}${section('Physical layout and readiness',
 `<div class="fs-tree"><span>curated offers</span><div>└ customer / reporting_day<div>└ route-clustered Parquet files</div></div></div><p>Keep source timestamps; compact small files.</p><p><b>Export:</b> format, destination and release policy.<br><b>Analytics:</b> batch completion and late-input audit.</p>`
 )}</div>`;
}
function signals(d,m){return dashboard.overview(d,m);}
function investigate(d,m){return dashboard.investigation(d,m);}
const renderers={intake,storage,signals,investigate};
function render(type,d){return `<div class="fs-technical">${renderers[type](d,model(d))}</div>`;}
module.exports={comparisonSQL,model,price,quantile,render,scenes:Object.keys(renderers)};
