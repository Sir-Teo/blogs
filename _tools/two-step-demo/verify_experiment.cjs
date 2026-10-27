/* Check the article's controlled experiments against known generating curves. */
const assert=require('node:assert/strict');
const C=require('../../assets/js/two-step-core.js');
const data=require('../../assets/data/two-step/experiment.json');
const close=(a,b,tol=1e-7)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);
for(const [v,theta] of [[0,0],[data.experiment.volumeLog,0],[0,data.experiment.timing],[data.experiment.volumeLog,data.experiment.timing]]){
  const truth=C.mean(v,theta);
  close(C.sum(truth),data.baseline.total*Math.exp(v));
  for(const cutoff of [55,40,22,3]){
    const exposure=C.exposure(cutoff),counts=truth.map((m,c)=>m*exposure[c]);
    const fit=C.fit(counts,exposure);
    assert(fit,'Distinct exposed scores identify the expected-count experiment');
    close(fit.v,v);close(fit.theta,theta);
    close(fit.remaining,C.remaining(truth,exposure));
    if(theta===0){
      const scale=C.sum(counts)/C.dot(C.mean(0,0),exposure);
      close(C.remaining(C.mean(Math.log(scale),0),exposure),fit.remaining);
    }
  }
  const narrow=C.exposure(65);
  assert.equal(C.fit(truth.map((m,c)=>m*narrow[c]),narrow),null);
}
const {sample}=data,fit=C.fit(sample.counts,sample.exposure);
assert(fit);
close(fit.v,sample.fit[0]);close(fit.theta,sample.fit[1]);
fit.expected.forEach((m,c)=>close(m,sample.fitted[c]));
const truthRemaining=C.remaining(sample.truth,sample.exposure);
assert(Math.abs(fit.remaining-truthRemaining)<Math.abs(C.remaining(sample.flat,sample.exposure)-truthRemaining),'The displayed experiment demonstrates the scale-only failure');
assert(sample.counts.every(Number.isInteger)&&sample.hiddenCounts.every(Number.isInteger));
console.log('Synthetic experiments passed: unchanged shape, volume alone, timing alone, combined changes, multiple cutoffs, hidden counts, and unresolved narrow windows.');
