/* A volume-and-timing estimator using scalar arithmetic and bracketed search.
   Returns null when timing or the full-curve extrapolation cannot be resolved. */
(function (root) {
  'use strict';
  function fitVolumeTiming({counts,exposure,baselineTotal,baselineMix,midpoints}) {
    const n=counts.length;
    if(!n||exposure.length!==n||baselineMix.length!==n||midpoints.length!==n||
       !Number.isFinite(baselineTotal)||baselineTotal<=0) {
      throw new RangeError('Use equally sized arrays and a positive baseline total.');
    }
    for(let c=0;c<n;c++) {
      if(!Number.isFinite(counts[c])||counts[c]<0||
         !Number.isFinite(exposure[c])||exposure[c]<0||exposure[c]>1||
         !Number.isFinite(baselineMix[c])||baselineMix[c]<=0||
         !Number.isFinite(midpoints[c])||(exposure[c]===0&&counts[c]>0)) {
        throw new RangeError('Check counts, exposure, positive baseline shares, and midpoints.');
      }
    }
    const sum=a=>a.reduce((total,x)=>total+x,0);
    const dot=(a,b)=>sum(a.map((x,c)=>x*b[c]));
    const normalise=logs=>{
      const peak=Math.max(...logs),weights=logs.map(x=>Math.exp(x-peak));
      const total=sum(weights);
      return weights.map(x=>x/total);
    };
    const shareTotal=sum(baselineMix);
    const baseline=baselineMix.map(p=>p/shareTotal);
    const center=dot(baseline,midpoints),z=midpoints.map(a=>center-a);
    const observed=exposure.map((value,c)=>value>0?c:-1).filter(c=>c>=0);
    const totalSeen=sum(counts);
    if(totalSeen===0||observed.length<2)return null;
    const target=dot(counts,z)/totalSeen;
    const scores=observed.map(c=>z[c]);
    if(!(target>Math.min(...scores)&&target<Math.max(...scores)))return null;

    const conditionalMean=theta=>{
      const q=normalise(observed.map(c=>Math.log(exposure[c])+Math.log(baseline[c])+theta*z[c]));
      return dot(q,scores);
    };
    let lo=-.01,hi=.01;
    for(let k=0;k<24;k++) {
      if(conditionalMean(lo)<=target&&conditionalMean(hi)>=target)break;
      lo*=2;hi*=2;
    }
    if(conditionalMean(lo)>target||conditionalMean(hi)<target)return null;
    for(let k=0;k<70;k++) {
      const middle=(lo+hi)/2;
      if(conditionalMean(middle)<target)lo=middle;else hi=middle;
    }
    const theta=(lo+hi)/2;
    const mix=normalise(baseline.map((p,c)=>Math.log(p)+theta*z[c]));
    const share=dot(exposure,mix);
    if(!(share>0))return null;
    const total=totalSeen/share,v=Math.log(total)-Math.log(baselineTotal);
    const expected=mix.map(p=>total*p);
    if(!Number.isFinite(total)||!Number.isFinite(v)||!expected.every(Number.isFinite))return null;
    const remaining=dot(exposure.map(x=>1-x),expected);
    return {v,theta,share,score:target,total,expected,remaining};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=fitVolumeTiming;
  root.fitVolumeTiming=fitVolumeTiming;
})(typeof window!=='undefined'?window:globalThis);
