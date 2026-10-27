const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'../..');
const core=require(path.join(root,'assets/js/fare-system-core.js'));
const d=require(path.join(root,'assets/data/fare-system/demo.json'));
const out=path.join(root,'_includes/fare-system');
for(const file of fs.readdirSync(out))if(file.endsWith('.html')&&!core.scenes.includes(file.slice(0,-5))&&file!=='validation.html')fs.unlinkSync(path.join(out,file));
for(const scene of core.scenes)fs.writeFileSync(path.join(out,scene+'.html'),'<!-- Generated from one shared fictional dataset. -->\n'+core.render(scene,d)+'\n');
const dashboard=require(path.join(root,'assets/js/fare-system-dashboard.js')),m=core.model(d);
const model=JSON.parse(JSON.stringify({...m,flightHistory:dashboard.flightHistory(d,m)},(key,value)=>['peers','calibrationDays','checks','rows','policies','history'].includes(key)?undefined:value));
const data={cells:d.cells,flight:d.flight,anomaly:{snapshot:d.anomaly.snapshot,scope:d.anomaly.scope,checks:d.anomaly.checks}};
fs.writeFileSync(path.join(root,'assets/data/fare-system/workspace.json'),JSON.stringify({data,model})+'\n');
const evaluation=require(path.join(root,'assets/data/fare-system/anomaly-evaluation.json'));
const metric=evaluation.metrics;
const table='<table class="fs-validation-table"><caption>Constructed holdout · same price target and review gates</caption><thead><tr><th>Detector</th><th>Sustained moves found</th><th>False reviews on normal cell-days</th></tr></thead><tbody>'+
[['Context forecast',metric.context],['Two-pass fence',metric.twoPass]].map(([name,m])=>'<tr><th scope="row">'+name+'</th><td>'+m.tp+'/'+(m.tp+m.fn)+'</td><td>'+m.fp+'/'+(m.fp+m.tn)+'</td></tr>').join('')+'</tbody></table>'+
'<p class="fs-validation-note">Both methods blocked '+evaluation.dataIssuesBlocked+' data-issue cases. The contextual range covered '+(evaluation.normalBandCoverage.fraction*100).toFixed(1)+'% of normal held-out observations in this test. This is synthetic evidence, not a production accuracy claim.</p>';
fs.writeFileSync(path.join(out,'validation.html'),table+'\n');
console.log('Rendered two pipeline figures, two dashboard concepts and a calculated synthetic evaluation table.');
