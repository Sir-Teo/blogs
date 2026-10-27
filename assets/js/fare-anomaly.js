/* Context-matched forecasts with past-only error calibration and review gates. */
'use strict';
const DEFAULTS=Object.freeze({peers:8,calibrationDays:56,minCalibration:40,quantile:.95,materialMinor:1000,materialFraction:.03,minCoverage:.95,maxAgeMinutes:15,confirmationWindowMinutes:45,minSeparationMinutes:10,confirmations:2});
const median=xs=>{const a=[...xs].sort((x,y)=>x-y),n=a.length;return n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2;};
function predictPast(rows,day,weekday,config=DEFAULTS){
 const peers=rows.filter(r=>r.day<day&&r.weekday===weekday&&r.valid!==false&&Number.isFinite(r.amount)&&r.amount>0).sort((a,b)=>b.day-a.day).slice(0,config.peers);
 if(peers.length<config.peers)return null;
 return {expected:median(peers.map(r=>r.amount)),peers:peers.map(r=>r.day)};
}
// Historical input must already be tenant/market/cabin/trip/sale/currency scoped.
function forecast(history,{day,ap,weekday,product='discount',calibrationEnd=day},options={}){
 calibrationEnd=Math.min(calibrationEnd,day);
 const cfg={...DEFAULTS,...options},rows=history.filter(r=>r.ap===ap&&r.product===product);
 const fit=predictPast(rows,day,weekday,cfg);
 if(!fit)return {status:'insufficient_history',reason:'Fewer than eight matching historical weekdays.'};
 const calibration=[];
 for(const row of rows){
  if(row.day>=calibrationEnd||row.day<calibrationEnd-cfg.calibrationDays||row.valid===false||!Number.isFinite(row.amount)||row.amount<=0)continue;
  const prediction=predictPast(rows,row.day,row.weekday,cfg);
  if(prediction)calibration.push({day:row.day,error:Math.abs(row.amount-prediction.expected)});
 }
 if(calibration.length<cfg.minCalibration)return {status:'insufficient_history',reason:'Too few past forecast errors for a range.'};
 const errors=calibration.map(r=>r.error).sort((a,b)=>a-b);
 const order=Math.min(errors.length,Math.ceil((errors.length+1)*cfg.quantile));
 // A one-dollar outward rounding avoids displaying a spuriously precise range.
 const width=Math.max(100,Math.ceil(errors[order-1]/100)*100);
 return {status:'ready',expected:fit.expected,lower:fit.expected-width,upper:fit.expected+width,width,
  peers:fit.peers,calibration:calibration.length,calibrationDays:calibration.map(r=>r.day),
  targetDay:day,ap,weekday,product,nominalCoverage:cfg.quantile};
}
function assess(prediction,checks,{now,scope,...options}={}){
 const cfg={...DEFAULTS,...options},latest=checks.at(-1);
 if(!latest)return {status:'data_issue',reason:'No observation.',confirmed:false,checks:[]};
 const quality=r=>r.valid!==false&&Number.isFinite(r.amount)&&r.amount>0&&r.coverage>=cfg.minCoverage&&r.currency==='USD'&&r.taxBasis==='included'&&r.scope===scope;
 if(!quality(latest)||now-latest.observedAt>cfg.maxAgeMinutes*60000||latest.observedAt>now){
  return {status:'data_issue',reason:'Missing, stale or incomparable selected-source evidence.',confirmed:false,checks:[]};
 }
 if(prediction.status!=='ready')return {...prediction,confirmed:false,checks:[]};
 const materialThreshold=Math.max(cfg.materialMinor,prediction.expected*cfg.materialFraction),seen=new Set(),evaluated=[];
 for(const row of checks.slice(-3)){
  if(!quality(row)||row.observedAt>now||now-row.observedAt>cfg.confirmationWindowMinutes*60000||seen.has(row.observedAt))continue;
  seen.add(row.observedAt);
  const residual=row.amount-prediction.expected,unusual=row.amount<prediction.lower||row.amount>prediction.upper;
  evaluated.push({...row,residual,unusual,material:Math.abs(residual)>=materialThreshold});
 }
 const latestResidual=latest.amount-prediction.expected,latestCandidate=(latest.amount<prediction.lower||latest.amount>prediction.upper)&&Math.abs(latestResidual)>=materialThreshold;
 const confirming=evaluated.filter(r=>r.unusual&&r.material&&Math.sign(r.residual)===Math.sign(latestResidual)),breaches=confirming.length;
 const separated=confirming.length>1&&Math.max(...confirming.map(r=>r.observedAt))-Math.min(...confirming.map(r=>r.observedAt))>=cfg.minSeparationMinutes*60000;
 const confirmed=latestCandidate&&breaches>=cfg.confirmations&&separated;
 return {status:confirmed?'review':latestCandidate?'watch':'normal',confirmed,breaches,
  freshChecks:evaluated.length,residual:latestResidual,materialThreshold,checks:evaluated,reason:confirmed?'Same-direction material deviation in fresh shops at least ten minutes apart.':latestCandidate?'Waiting for same-direction, time-separated fresh confirmation.':'Within the expected behavior or below the materiality limit.'};
}
module.exports={DEFAULTS,median,predictPast,forecast,assess};
