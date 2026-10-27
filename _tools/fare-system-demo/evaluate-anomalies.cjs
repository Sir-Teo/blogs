const fs=require('node:fs'),path=require('node:path');
const A=require('../../assets/js/fare-anomaly.js');
const seeds=[3,11,29,47,73,101],aps=[7,21,45],start=140,end=224;
function random(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
function quantile(xs,p){const a=[...xs].sort((x,y)=>x-y),h=(a.length-1)*p,i=Math.floor(h);return a[i]+(a[Math.min(i+1,a.length-1)]-a[i])*(h-i);}
function limits(xs){const q1=quantile(xs,.25),q3=quantile(xs,.75),iqr=q3-q1;return {lower:q1-1.5*iqr,upper:q3+1.5*iqr};}
function twoPass(history,value){
 const xs=history.slice(-22),first=limits(xs),mean=xs.reduce((s,v)=>s+v,0)/xs.length;
 const clean=xs.map(v=>v<first.lower||v>first.upper?mean:v);
 return {status:'ready',expected:A.median(xs),...limits([...clean,value])};
}
const totals={context:{tp:0,fp:0,fn:0,tn:0},twoPass:{tp:0,fp:0,fn:0,tn:0}};
let blocked=0,healthyWithin=0,healthyTotal=0,spikesHeld=0;
const examples=[];
for(const seed of seeds){
 const rng=random(seed),history=[],samples=[];
 for(let day=0;day<end;day++)for(const ap of aps){
  const weekday=(day+1)%7,base={7:26000,21:23500,45:21500}[ap],season=[100,0,200,100,200,-2500,-200][weekday];
  const truth=[154,155,156,189,190,191,217,218,219].includes(day);
  const amount=base+season+(Math.floor(rng()*7)-3)*100-(truth?1500:0),issue=[168,203].includes(day);
  const scope='market|economy|discount|AP'+ap,now=Date.UTC(2026,0,1+day,8,10);
  const checks=[35,50,65].map((minute,i)=>({amount:amount+(Math.floor(rng()*3)-1)*50-(day===175&&i===0?3500:0),
    observedAt:Date.UTC(2026,0,1+day,7,minute),scope,coverage:day===203?.90:1,valid:!issue,currency:'USD',taxBasis:'included'}));
  history.push({day,weekday,ap,product:'discount',amount:A.median(checks.map(r=>r.amount)),valid:!issue});
  samples.push({day,weekday,ap,truth,issue,scope,now,checks});
 }
 for(const sample of samples.filter(r=>r.day>=start)){
  const f=A.forecast(history,{day:sample.day,weekday:sample.weekday,ap:sample.ap,calibrationEnd:start});
  const past=history.filter(r=>r.day<sample.day&&r.ap===sample.ap&&r.valid).map(r=>r.amount);
  const legacy=twoPass(past,sample.checks.at(-1).amount);
  const newer=A.assess(f,sample.checks,{now:sample.now,scope:sample.scope});
  const old=A.assess(legacy,sample.checks,{now:sample.now,scope:sample.scope});
  if(sample.issue){
   if(newer.status!=='data_issue'||old.status!=='data_issue')throw Error('Quality gates diverged');
   blocked++;continue;
  }
  for(const [name,result] of [['context',newer],['twoPass',old]]){
   const key=sample.truth?(result.confirmed?'tp':'fn'):(result.confirmed?'fp':'tn');
   totals[name][key]++;
  }
  if(!sample.truth)for(const row of sample.checks){healthyTotal++;if(row.amount>=f.lower&&row.amount<=f.upper)healthyWithin++;}
  if(sample.day===175&&!newer.confirmed)spikesHeld++;
  if(seed===seeds[0]&&sample.ap===21&&[145,154,175].includes(sample.day))examples.push({day:sample.day,weekday:sample.weekday,truth:sample.truth,expected:f.expected,range:[f.lower,f.upper],observed:sample.checks.at(-1).amount,contextStatus:newer.status,twoPassStatus:old.status});
 }
}
for(const result of Object.values(totals)){
 result.precision=result.tp/(result.tp+result.fp||1);
 result.recall=result.tp/(result.tp+result.fn||1);
 result.falseReviewsPer100Normal=result.fp/(result.fp+result.tn)*100;
}
const result={kind:'Constructed synthetic stress test; not airline production validation',seeds,apContexts:aps,
 holdoutDays:[start,end-1],calibrationDays:[start-56,start-1],
 protocol:'Walk-forward peer forecasts use only earlier days. Error calibration is frozen before the holdout. Both detectors share quality, dollar-materiality and fresh-observation confirmation gates.',
 scenarios:['weekly normal discount','three sustained price-cut episodes','one-shop spike','selected-source outage','coverage below 95%'],
 metrics:totals,dataIssuesBlocked:blocked,oneShopSpikesHeld:spikesHeld,
 normalBandCoverage:{covered:healthyWithin,total:healthyTotal,fraction:healthyWithin/healthyTotal},
 limits:'Small designed test suite, with known seasonal structure and large injected shifts. This does not establish general superiority, real-data accuracy or a distribution-free temporal coverage guarantee.',
 examples};
fs.writeFileSync(path.join(__dirname,'../../assets/data/fare-system/anomaly-evaluation.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
