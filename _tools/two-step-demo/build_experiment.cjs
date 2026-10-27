/* Construct a reproducible experiment without reading source documents. */
const fs=require('node:fs');
const path=require('node:path');
const C=require('../../assets/js/two-step-core.js');
const seed=0x71b3a40d;
let state=seed;
function uniform(){
  state=(state+0x6d2b79f5)|0;
  let t=Math.imul(state^(state>>>15),1|state);
  t^=t+Math.imul(t^(t>>>7),61|t);
  return ((t^(t>>>14))>>>0)/4294967296;
}
function drawCount(mean){
  if(mean===0)return 0;
  const limit=Math.exp(-mean);let product=1,count=0;
  do{count++;product*=uniform();}while(product>limit);
  return count-1;
}
const volumeLog=Math.log(1.25),timing=-.025,cutoff=22;
const exposure=C.exposure(cutoff),truth=C.mean(volumeLog,timing);
const counts=truth.map((mean,c)=>drawCount(mean*exposure[c]));
const hiddenCounts=truth.map((mean,c)=>drawCount(mean*(1-exposure[c])));
const fitted=C.fit(counts,exposure);
if(!fitted)throw Error('The constructed sample must support a finite fit.');
const flat_v=Math.log(C.sum(counts)/C.dot(C.mean(0,0),exposure));
const fixture={
  experiment:{kind:'synthetic',generator:'_tools/two-step-demo/build_experiment.cjs',seed,volumeLog,timing,cutoff},
  baseline:{total:C.sum(C.mean(0,0)),mix:C.mix,midpoints:C.mid,edges:C.edges},
  sample:{exposure,counts,hiddenCounts,truth,fit:[fitted.v,fitted.theta],fitted:fitted.expected,flat_v,flat:C.mean(flat_v,0)}
};
const output=path.resolve(__dirname,'../../assets/data/two-step/experiment.json');
fs.writeFileSync(output,JSON.stringify(fixture,null,2)+'\n');
console.log('Generated the synthetic experiment; no source-document data was read.');
