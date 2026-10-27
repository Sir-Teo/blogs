/* Small numerical model shared by the interactive figures and Node checks. */
(function (root) {
  'use strict';
  const estimate=typeof module!=='undefined'&&module.exports?require('./volume-timing-fit.js'):root.fitVolumeTiming;
  const mix=[.06,.10,.14,.18,.18,.16,.11,.07];
  const edges=[78,62,48,36,26,18,10,6,0];
  const mid=edges.slice(0,-1).map((e,j)=>(e+edges[j+1])/2);
  const dot=(a,b)=>a.reduce((s,x,j)=>s+x*b[j],0);
  const center=dot(mix,mid),z=mid.map(a=>center-a);
  const sum=a=>a.reduce((s,x)=>s+x,0);
  function softmax(logs){const m=Math.max(...logs),w=logs.map(x=>Math.exp(x-m)),s=sum(w);return w.map(x=>x/s);}
  function tilt(t){return softmax(mix.map((p,j)=>Math.log(p)+t*z[j]));}
  function exposure(day){return edges.slice(0,-1).map((e,j)=>Math.max(0,Math.min(1,(e-day)/(e-edges[j+1]))));}
  function mean(v,t){return tilt(t).map(p=>1000*Math.exp(v)*p);}
  function conditional(t,i){
    const active=i.map((v,j)=>({v,j})).filter(o=>o.v>0);
    const p=softmax(active.map(o=>Math.log(o.v*mix[o.j])+t*z[o.j]));
    return i.map((_,j)=>{const k=active.findIndex(o=>o.j===j);return k<0?0:p[k];});
  }
  function fit(y,i){
    return estimate({counts:y,exposure:i,baselineTotal:1000,baselineMix:mix,midpoints:mid});
  }
  function nll(v,t,y,i){return mean(v,t).reduce((s,m,j)=>{
    const mu=m*i[j];return s+mu-(y[j]>0?y[j]*Math.log(mu):0);
  },0);}
  function remaining(mu,i){return dot(mu,i.map(x=>1-x));}
  function cumulative(mu,day){return dot(mu,exposure(day));}
  function shift(t){return dot(tilt(t),mid)-center;}
  function snapshot(dailyCounts,truth,day){
    if(dailyCounts.length!==edges[0]||dailyCounts.some(n=>!Number.isInteger(n)||n<0)||!Number.isInteger(day)||day<0||day>=edges[0])throw new RangeError('Use one count per day and an integer cutoff in the window.');
    const i=exposure(day),counts=mix.map(()=>0),hiddenCounts=mix.map(()=>0);
    dailyCounts.forEach((n,k)=>{const d=edges[0]-k,j=edges.findIndex((edge,c)=>c<mix.length&&d<=edge&&d>edges[c+1]);(d>day?counts:hiddenCounts)[j]+=n;});
    const fitted=fit(counts,i),flat_v=sum(counts)>0?Math.log(sum(counts)/dot(mean(0,0),i)):0;
    return {exposure:i,counts,hiddenCounts,truth,fit:fitted?[fitted.v,fitted.theta]:null,fitted:fitted?fitted.expected:mean(0,0),flat_v,flat:mean(flat_v,0),resolved:!!fitted};
  }
  const api={mix,edges,mid,z,center,dot,sum,tilt,exposure,mean,conditional,fit,nll,remaining,cumulative,shift,snapshot};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.TwoStep=api;
})(typeof window!=='undefined'?window:globalThis);
