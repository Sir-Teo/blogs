/* Compare the browser model with independently generated SciPy data. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const C=require(path.join(root,'assets/js/two-step-core.js'));
const estimate=require(path.join(root,'assets/js/volume-timing-fit.js'));
const d=JSON.parse(fs.readFileSync(path.join(root,'assets/data/two-step/demo.json')));
const close=(a,b,tol=1e-7)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);
assert.deepEqual(d.sample.counts,[231,236,248,216,89,0,0,0]);
assert.deepEqual(C.exposure(22),d.sample.exposure);
for(const t of [-.1,-.03,0,.03,.1]){
  close(C.sum(C.tilt(t)),1);
  close(C.sum(C.mean(Math.log(1.3),t)),1300);
  for(const day of [78,65,55,40,22,3,0]){
    const mu=C.mean(Math.log(1.3),t),i=C.exposure(day);
    close(C.cumulative(mu,day)+C.remaining(mu,i),1300);
  }
}
for(const sample of [d.sample,d.promo]){
  const fit=C.fit(sample.counts,d.sample.exposure);
  close(fit.v,sample.fit[0]);close(fit.theta,sample.fit[1]);
  const mu=C.mean(fit.v,fit.theta);
  sample.fitted.forEach((n,j)=>close(mu[j],n,1e-5));
  close(C.dot(mu,d.sample.exposure),C.sum(sample.counts),1e-6);
  close(C.dot(C.conditional(fit.theta,d.sample.exposure),C.z),fit.score);
}
for(let j=0;j<70;j++){
  const fit=C.fit(d.departures.counts[j],d.departures.exposure[j]),ref=d.departures.raw[j];
  assert.equal(fit===null,ref===null);
  if(fit){close(fit.v,ref[0]);close(fit.theta,ref[1]);}
}
assert.equal(C.fit([0,0,0,0,0,0,0,0],C.exposure(22)),null);
assert.equal(C.fit([100,0,0,0,0,0,0,0],C.exposure(65)),null);
assert.equal(C.fit([100,0,0,0,0,0,0,0],C.exposure(55)),null);
close(C.remaining(d.sample.truth,d.sample.exposure),297.7258626,1e-6);
close(C.remaining(d.sample.fitted,d.sample.exposure),317.4773929,1e-6);
close(C.remaining(d.sample.flat,d.sample.exposure),769.4736842,1e-6);
const inputs={counts:d.sample.counts,exposure:d.sample.exposure,baselineTotal:1000,baselineMix:C.mix,midpoints:C.mid};
const built=estimate(inputs);
close(built.total,1337.4773929,1e-6);close(built.remaining,317.4773929,1e-6);
close(C.sum(built.expected),built.total);
close(built.total,C.sum(inputs.counts)/built.share);
close(built.remaining,C.sum(inputs.counts)*(1-built.share)/built.share);
// The volume-profiled full likelihood and conditional timing likelihood
// differ only by a constant. Check the derived score independently.
const observedTotal=C.sum(inputs.counts);
const profile=theta=>{
  const share=C.dot(inputs.exposure,C.tilt(theta));
  return -C.nll(Math.log(observedTotal/(1000*share)),theta,inputs.counts,inputs.exposure);
};
const conditionalLog=theta=>C.conditional(theta,inputs.exposure).reduce((sum,q,c)=>
  sum+(inputs.counts[c]>0?inputs.counts[c]*Math.log(q):0),0);
const offset=profile(0)-conditionalLog(0);
for(const theta of [-.06,-.03,0,.03]){
  close(profile(theta)-conditionalLog(theta),offset,1e-8);
  const q=C.conditional(theta,inputs.exposure),h=1e-6;
  const score=C.dot(inputs.counts,C.z)-observedTotal*C.dot(q,C.z);
  close((profile(theta+h)-profile(theta-h))/(2*h),score,1e-4);
}
for(const baselineTotal of [500,2000]){
  const changed=estimate({...inputs,baselineTotal});
  close(changed.theta,built.theta);close(changed.remaining,built.remaining);
  close(changed.v,built.v+Math.log(1000/baselineTotal));
}
// Changing the time unit changes theta inversely, while the fitted forecast
// remains the same. The narrow-day case also exercises bracket expansion.
for(const factor of [.01,7]){
  const changed=estimate({...inputs,midpoints:C.mid.map(a=>a*factor)});
  close(changed.theta,built.theta/factor);close(changed.remaining,built.remaining);
}
assert.equal(estimate({...inputs,counts:Array(8).fill(0)}),null);
assert.equal(estimate({...inputs,counts:[100,0,0,0,0,0,0,0],exposure:[1,0,0,0,0,0,0,0]}),null);
assert.throws(()=>estimate({...inputs,counts:[231,236,248,216,89,1,0,0]}),RangeError);
assert.throws(()=>estimate({...inputs,baselineMix:[0,.16,.14,.18,.18,.16,.11,.07]}),RangeError);
// Conditional score derivative equals its variance; volume has canceled.
for(const day of [55,40,22,3]){
  const i=C.exposure(day),t=-.025,h=1e-6,q=C.conditional(t,i),m=C.dot(q,C.z);
  const numerical=(C.dot(C.conditional(t+h,i),C.z)-C.dot(C.conditional(t-h,i),C.z))/(2*h);
  close(numerical,C.dot(q,C.z.map(z=>(z-m)**2)),1e-4);
  const plus=C.conditional(t+h,i),minus=C.conditional(t-h,i);
  q.forEach((value,c)=>close((plus[c]-minus[c])/(2*h),value*(C.z[c]-m),1e-6));
}
console.log('Model checks passed: profile/conditional likelihood equivalence, derived score and curvature, closed-form remainder, numerical agreement, 70 departures, and edge cases.');
